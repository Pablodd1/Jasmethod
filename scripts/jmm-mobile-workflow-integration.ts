/** Synthetic-only DB-backed acceptance for the mobile onboarding workflow.
 * Run under scripts/jmm-test-egress-guard.cjs against the disposable local DB.
 * This checks durable state and tenant isolation; browser coverage is separate.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { hashToken } from "../src/lib/auth";
for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
    const url = new URL(process.env[key] || "");
    assert.equal(url.protocol, "postgresql:");
    assert.equal(url.hostname, "127.0.0.1");
    assert.equal(url.port, "55432");
    assert.equal(url.pathname, "/jmm_launch_integration_test");
    assert.equal(url.search, "");
}
assert.notEqual(process.env.VERCEL_ENV, "production");
assert.ok(process.env.NODE_OPTIONS?.includes("jmm-test-egress-guard.cjs"), "The egress guard is mandatory");
const base = "http://127.0.0.1:3220";
const db = new PrismaClient();
const ids: string[] = [];
const results: Array<{
    name: string;
    status: "PASS" | "FAIL";
    detail?: string;
}> = [];
const now = new Date(), day = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
const observed = new Date(now.getTime() - 86400000), observedKey = observed.toISOString().slice(0, 10);
type Actor = {
    id: string;
    cookie: string;
};
async function actor(name: string, onboarded = false): Promise<Actor> {
    const user = await db.user.create({ data: {
            email: `mobile-${name}-${randomUUID()}@example.invalid`,
            name: `Synthetic mobile ${name}`,
            passwordHash: bcrypt.hashSync(randomBytes(24).toString("hex"), 10),
            role: "athlete",
            timezone: "UTC",
            language: "en",
            onboarded,
            profile: { create: {} },
            reminder: { create: { emailEnabled: false, telegramEnabled: false } }
        } });
    ids.push(user.id);
    const token = randomBytes(32).toString("hex");
    await db.authSession.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000) } });
    return { id: user.id, cookie: `jmm_session=${token}` };
}
async function api(path: string, a: Actor, body?: unknown, method?: string, status = 200) {
    const res = await fetch(`${base}${path}`, {
        method: method || (body === undefined ? "GET" : "POST"),
        headers: { cookie: a.cookie, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(120000)
    });
    const data = await res.json();
    assert.equal(res.status, status, `${path}: ${JSON.stringify(data)}`);
    return data;
}
async function save(a: Actor, fields: Record<string, unknown>) {
    const current = await api("/api/profile", a);
    return api("/api/profile", a, { ...fields, expectedRevision: current.revision, ...(fields.setup ? { expectedSetupRevision: current.setupRevision } : {}) }, "PUT");
}
async function setup(a: Actor, weeks = 12) {
    return save(a, {
        birthYear: 1990,
        sex: "female",
        heightCm: 170,
        weightKg: 64,
        experience: "amateur",
        goal: "run-only",
        weeklyHours: 3,
        setup: {
            adultConfirmed: true,
            profileConfirmed: true,
            goalDescription: "Run comfortably for general fitness",
            baselineWeeklyMinutes: 120,
            baselineObservedAt: observedKey,
            interruptions: "none",
            restrictions: "none",
            qualifiedReview: "none_needed",
            trainingDays: [day.getUTCDay(), (day.getUTCDay() + 2) % 7, (day.getUTCDay() + 4) % 7],
            maxSessionMinutes: 60,
            equipmentAccess: "Running shoes and outdoor path",
            planWeeks: weeks
        }
    });
}
async function scenario(name: string, work: () => Promise<void>) {
    try {
        await work();
        results.push({ name, status: "PASS" });
        console.log(`PASS ${name}`);
    }
    catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        results.push({ name, status: "FAIL", detail });
        console.error(`FAIL ${name}: ${detail}`);
    }
}
async function main() {
    const fresh = await actor("new"), synced = await actor("synchronized"), other = await actor("other"), returning = await actor("returning", true);
    await scenario("New athlete: unknown imports, saved profile/goals survive reload, evaluated setup requires a reviewed plan", async () => {
        assert.equal((await api("/api/profile", fresh)).profile.units, "auto", "New profiles should use the language-aware units default");
        const imports = await api("/api/onboard/import-review", fresh);
        assert.equal(imports.history.count, 0);
        assert.deepEqual(imports.suggestions, []);
        let p = await save(fresh, {
            birthYear: 1990,
            sex: "female",
            heightCm: 170,
            weightKg: 64
        });
        assert.equal(p.profile.weightKg, 64);
        p = await api("/api/profile", fresh);
        assert.equal(p.profile.birthYear, 1990);
        assert.equal(p.profile.heightCm, 170);
        assert.equal(p.profile.weightKg, 64);
        assert.equal(p.planningReadiness.ready, false);
        await api("/api/onboard", fresh, {});
        assert.equal(await db.trainingPlan.count({ where: { userId: fresh.id } }), 0);
        p = await setup(fresh, 12);
        assert.equal(p.planningReadiness.ready, true);
        p = await api("/api/profile", fresh);
        assert.equal(p.setup.planWeeks, 12);
        assert.equal(p.profile.goal, "run-only");
        assert.equal(p.setup.goalDescription, "Run comfortably for general fitness");
        await api("/api/plan/generate", fresh, { distance: "run-only", weeks: 12 }, undefined, 409);
        const preview = await api("/api/plan/generate", fresh, { distance: "run-only", weeks: 12, preview: true });
        assert.ok(preview.previewToken);
        assert.equal(await db.trainingPlan.count({ where: { userId: fresh.id } }), 0);
        await api("/api/plan/generate", fresh, {
            distance: "run-only",
            weeks: 12,
            preview: false,
            previewToken: preview.previewToken
        });
        const plan = await api("/api/plan", fresh);
        assert.equal(plan.plans[0].weeks, 12);
        assert.ok(plan.plans[0].days.length);
        assert.equal(plan.plans[0].raceDate, null);
        assert.ok(plan.summary);
        assert.ok(plan.cycle);
        const today = await api("/api/today", fresh);
        assert.ok(Array.isArray(today.sessions));
        assert.equal(await db.connector.count({ where: { userId: fresh.id } }), 0);
    });
    await scenario("Synchronized athlete: imported history is honest, Apple file weight requires review and persists without overwriting identity", async () => {
        await db.connector.create({ data: {
                userId: synced.id,
                provider: "strava",
                status: "connected",
                lastSyncAt: observed,
                lastSyncCount: 2
            } });
        for (let i = 0; i < 2; i++)
            await db.workout.create({ data: {
                    userId: synced.id,
                    date: new Date(observed.getTime() - i * 86400000),
                    sport: "run",
                    title: `Synthetic imported run ${i + 1}`,
                    type: "endurance",
                    durationMin: 30,
                    intensity: "z2",
                    planned: false,
                    completed: true,
                    source: "strava",
                    externalId: `synthetic-${randomUUID()}`
                } });
        await save(synced, {
            birthYear: 1991,
            sex: "female",
            heightCm: 168,
            weightKg: 61
        });
        const xml = `<?xml version="1.0"?><HealthData><Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Synthetic file" unit="kg" value="62.4" startDate="${observed.toISOString()}" endDate="${observed.toISOString()}"/></HealthData>`;
        const form = new FormData();
        form.set("source", "apple");
        form.set("file", new Blob([xml], { type: "application/xml" }), "synthetic-health.xml");
        const uploaded = await fetch(`${base}/api/import`, {
            method: "POST",
            headers: { cookie: synced.cookie },
            body: form,
            signal: AbortSignal.timeout(120000)
        });
        assert.equal(uploaded.status, 200, await uploaded.text());
        const imported = await api("/api/onboard/import-review", synced);
        assert.equal(imported.history.count, 2);
        assert.ok(imported.limitations.some((s: string) => s.includes("not all records")));
        const weight = imported.suggestions.find((s: any) => s.source === "apple_health");
        assert.ok(weight);
        assert.equal(weight.kind, "uploaded_file");
        assert.equal(weight.value, 62.4);
        const before = await api("/api/profile", synced);
        assert.equal(before.profile.weightKg, 61, "File upload must not silently overwrite profile");
        await save(synced, { weightKg: weight.value, reviewedWeightObservationId: weight.observationId });
        const after = await api("/api/profile", synced);
        assert.equal(after.profile.weightKg, 62.4);
        assert.equal(after.profile.weightSource, "apple_health");
        assert.equal(after.profile.birthYear, 1991);
        assert.equal(after.profile.heightCm, 168);
        const outsider = await api("/api/profile", other);
        await api("/api/profile", other, { weightKg: 62.4, reviewedWeightObservationId: weight.observationId, expectedRevision: outsider.revision }, "PUT", 409);
        assert.equal((await api("/api/onboard/import-review", other)).history.count, 0);
    });
    await scenario("Returning athlete: edited profile and re-preview retain completed history and adapt future cycle only after confirmation", async () => {
        await setup(returning, 12);
        const preview = await api("/api/plan/generate", returning, { distance: "run-only", weeks: 12, preview: true });
        await api("/api/plan/generate", returning, {
            distance: "run-only",
            weeks: 12,
            preview: false,
            previewToken: preview.previewToken
        });
        const original = await api("/api/plan", returning), planId = original.plans[0].id;
        const completed = await db.workout.create({ data: {
                userId: returning.id,
                date: observed,
                sport: "run",
                title: "Synthetic completed history",
                type: "endurance",
                durationMin: 30,
                intensity: "z2",
                completed: true,
                planned: false,
                source: "manual",
                actualDurationMin: 28,
                rpe: 3,
                feedbackStatus: "completed",
                feedbackAt: observed
            } });
        await save(returning, { weightKg: 65, heightCm: 171 });
        assert.equal((await api("/api/plan", returning)).plans[0].id, planId);
        assert.deepEqual(await db.workout.findUnique({ where: { id: completed.id } }), completed);
        const current = await api("/api/profile", returning);
        await save(returning, { experience: "amateur", weeklyHours: 2, setup: { ...current.setup, maxSessionMinutes: 40, planWeeks: 24 } });
        const revised = await api("/api/profile", returning);
        assert.equal(revised.profile.weightKg, 65);
        assert.equal(revised.profile.heightCm, 171);
        assert.equal(revised.setup.planWeeks, 24);
        assert.equal(revised.profile.weeklyHours, 2);
        const next = await api("/api/plan/generate", returning, { distance: "run-only", weeks: 24, preview: true });
        assert.equal((await api("/api/plan", returning)).plans[0].id, planId, "Preview cannot replace an active plan");
        await api("/api/plan/generate", returning, {
            distance: "run-only",
            weeks: 24,
            preview: false,
            previewToken: next.previewToken
        });
        const changed = await api("/api/plan", returning);
        assert.notEqual(changed.plans[0].id, planId);
        assert.equal(changed.plans[0].weeks, 24);
        assert.ok(changed.plans[0].days.flatMap((d: any) => d.sessions).every((w: any) => w.durationMin <= 40));
        assert.deepEqual(await db.workout.findUnique({ where: { id: completed.id } }), completed);
    });
    await scenario("Saved cycle: direct ICS download is a private read with no publication side effects", async () => {
        const before = await db.workout.count({ where: { userId: fresh.id } });
        const response = await fetch(`${base}/api/training/export?format=ics`, { headers: { cookie: fresh.cookie }, signal: AbortSignal.timeout(120000) });
        assert.equal(response.status, 200);
        assert.ok(response.headers.get("content-type")?.includes("text/calendar"));
        assert.ok(response.headers.get("content-disposition")?.includes(".ics"));
        const calendar = await response.text();
        assert.ok(calendar.startsWith("BEGIN:VCALENDAR"));
        assert.ok(calendar.includes("BEGIN:VEVENT"));
        assert.equal(await db.workout.count({ where: { userId: fresh.id } }), before);
        const denied = await fetch(`${base}/api/training/export?format=ics&athleteId=${fresh.id}`, { headers: { cookie: other.cookie } });
        assert.equal(denied.status, 403);
        const anonymous = await fetch(`${base}/api/training/export?format=ics`);
        assert.equal(anonymous.status, 401);
    });
}
main().catch(error => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    await db.user.deleteMany({ where: { id: { in: ids } } });
    const remaining = await db.user.count({ where: { id: { in: ids } } });
    await db.$disconnect();
    mkdirSync(".local/jmm-mobile-workflow", { recursive: true });
    const report = {
        syntheticOnly: true,
        physicalDevice: false,
        results,
        remainingFixtureUsers: remaining,
        egressBytes: process.env.JMM_EGRESS_LOG ? readFileSync(process.env.JMM_EGRESS_LOG).length : null
    };
    writeFileSync(".local/jmm-mobile-workflow/report.json", JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
        passed: results.filter(r => r.status === "PASS").length,
        total: results.length,
        remainingFixtureUsers: remaining,
        egressBytes: report.egressBytes
    }));
    if (results.some(r => r.status === "FAIL") || remaining)
        process.exitCode = 1;
});
