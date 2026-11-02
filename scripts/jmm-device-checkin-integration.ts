/** Isolated mobile Chromium -> real HTTP -> disposable PostgreSQL acceptance.
 * Run in the existing CI integration environment with its egress guard and built app.
 * Synthetic WHOOP observations exercise stored-data behavior, not a live WHOOP sync.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { hashToken } from "../src/lib/auth";
import { addDaysKey, dayBounds, localDate } from "../src/lib/dates";

assert.equal(process.env.CI, "true", "Run only in the disposable CI environment");
for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
  const url = new URL(process.env[key] || "");
  assert.equal(url.protocol, "postgresql:"); assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432"); assert.equal(url.pathname, "/jmm_launch_integration_test"); assert.equal(url.search, "");
}
assert.notEqual(process.env.VERCEL_ENV, "production");
assert.ok(process.env.NODE_OPTIONS?.includes("jmm-test-egress-guard.cjs"), "The CI egress guard is mandatory");
const base = "http://127.0.0.1:3220";
assert.equal(process.env.JMM_INTEGRATION_BASE || base, base);
const db = new PrismaClient(), ids: string[] = [];
const results: {name: string; status: "PASS" | "FAIL"; detail?: string}[] = [];
const dir = ".local/jmm-device-checkin"; mkdirSync(dir, {recursive: true});
const {start: day, key: today} = dayBounds("UTC");
type Actor = {id: string; token: string; language: string; workoutId: string};

async function api(path: string, owner?: Actor, body?: unknown, expected = 200, method = body === undefined ? "GET" : "POST") {
  const response = await fetch(base + path, {method, headers: {origin: base, "Content-Type": "application/json", ...(owner ? {cookie: `jmm_session=${owner.token}`} : {})},
    ...(body === undefined ? {} : {body: JSON.stringify(body)}), redirect: "manual", signal: AbortSignal.timeout(120000)});
  assert.equal(response.status, expected, `${method} ${path}: ${response.status}; ${(await response.clone().text()).slice(0, 700)}`);
  return response.json();
}
async function actor(language = "en", observations = true): Promise<Actor> {
  const user = await db.user.create({data: {email: `device-checkin-${randomUUID()}@example.invalid`, name: "Synthetic device check-in athlete", timezone: "UTC", language,
    passwordHash: bcrypt.hashSync(randomBytes(24).toString("hex"), 4), role: "athlete", onboarded: true,
    profile: {create: {goal: "run-only", experience: "amateur", weeklyHours: 3, birthYear: 1990, weightKg: 70, units: "metric"}},
    reminder: {create: {emailEnabled: false, telegramEnabled: false}}}});
  ids.push(user.id);
  const token = randomBytes(32).toString("hex");
  await db.authSession.create({data: {userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 3600000)}});
  const owner: Actor = {id: user.id, token, language, workoutId: ""};
  const current = await api("/api/profile", owner);
  await api("/api/profile", owner, {expectedRevision: current.revision, expectedSetupRevision: current.setupRevision ?? null, experience: "amateur", weeklyHours: 3,
    setup: {adultConfirmed: true, profileConfirmed: true, goalDescription: "Maintain familiar comfortable running", baselineWeeklyMinutes: 120,
      baselineObservedAt: today, interruptions: "none", restrictions: "none", qualifiedReview: "none_needed", trainingDays: [0,1,2,3,4,5,6],
      maxSessionMinutes: 60, equipmentAccess: "Running shoes and a familiar outdoor path", planWeeks: 4}}, 200, "PUT");
  const original = {sport: "run", title: "Familiar easy run", type: "endurance", durationMin: 30, intensity: "z2"};
  const workout = await db.workout.create({data: {userId: user.id, date: day, ...original, source: "manual", planned: true, completed: false, approved: false,
    originalPlan: JSON.stringify(original), prescription: JSON.stringify({...original, verdict: "full", steps: [
      {name: "Easy warm-up", seconds: 300, zone: "z1", phase: "warmup", target: {type: "open"}},
      {name: "Comfortable running", seconds: 1200, zone: "z2", phase: "active", target: {type: "open"}},
      {name: "Easy finish", seconds: 300, zone: "z1", phase: "cooldown", target: {type: "open"}},
    ]})}});
  owner.workoutId = workout.id;
  if (observations) await freshObservations(owner);
  return owner;
}
async function freshObservations(owner: Actor) {
  const observedAt = new Date(Date.now() - 1000);
  await db.metricObservation.createMany({data: [
    {metricType: "sleep_hours", unit: "h", value: 8}, {metricType: "resting_hr", unit: "bpm", value: 50}, {metricType: "hrv_rmssd", unit: "ms", value: 70},
  ].map(row => ({...row, userId: owner.id, observedAt, source: "whoop", measurementMethod: "device_sync", qualityFlag: "ok"}))});
  await db.dailyMetrics.upsert({where: {userId_date: {userId: owner.id, date: day}}, create: {userId: owner.id, date: day, source: "whoop", hrv: 70, hrvType: "rmssd", restingHr: 50, sleepHours: 8}, update: {source: "whoop", hrv: 70, hrvType: "rmssd", restingHr: 50, sleepHours: 8}});
}
function confirmation(revision: string) {return {mode: "device_assisted", deviceRevision: revision, recoveryUnchanged: true, confirmed: true, sick: false, newPain: false, urgentSymptoms: false, availableMinutes: 30};}
async function scenario(name: string, run: () => Promise<void>) {
  try {await run(); results.push({name, status: "PASS"}); console.log(`PASS ${name}`);}
  catch (error) {const detail = error instanceof Error ? error.message : String(error); results.push({name, status: "FAIL", detail}); console.error(`FAIL ${name}: ${detail}`);}
}
async function mobile(browser: Browser, owner: Actor, run: (page: Page) => Promise<void>) {
  const context = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, locale: owner.language === "es" ? "es-ES" : "en-US", serviceWorkers: "block"});
  await context.addCookies([{name: "jmm_session", value: owner.token, url: base, httpOnly: true, sameSite: "Lax"}]);
  const page = await context.newPage(); page.setDefaultTimeout(20000);
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/*", route => {
    if (new URL(route.request().url()).origin !== base) {external.push("Unexpected external request"); return route.abort();}
    return route.continue();
  });
  try {await run(page); assert.deepEqual(errors, []); assert.deepEqual(external, []);}
  catch (error) {await page.screenshot({path: `${dir}/failure-${owner.language}-${owner.id}.png`, fullPage: true}).catch(() => {}); throw error;}
  finally {await context.close();}
}
async function screenshot(page: Page, name: string) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), "No horizontal overflow on mobile");
  await page.screenshot({path: `${dir}/${name}.png`, fullPage: true});
}
async function main() {
  const browser = await chromium.launch({headless: true});
  try {
    await scenario("Unauthenticated device confirmations are rejected", async () => {await api("/api/checkin", undefined, confirmation("a".repeat(64)), 401);});
    for (const language of ["en", "es"]) await scenario(`${language}: fresh WHOOP readings use the short mobile form and survive real save/reload`, async () => {
      const owner = await actor(language), es = language === "es";
      const before = await api("/api/checkin", owner);
      assert.equal(before.deviceReview?.source, "whoop"); assert.match(before.deviceReview.revision, /^[a-f0-9]{64}$/);
      await api("/api/checkin", owner, {...confirmation(before.deviceReview.revision), confirmed: false}, 400);
      await api("/api/checkin", owner, confirmation("f".repeat(64)), 409);
      await api("/api/checkin", owner, {...confirmation(before.deviceReview.revision),sessionFelt:"harder"}, 400);
      assert.equal(await db.dailyCheckin.count({where: {userId: owner.id}}), 0);
      await mobile(browser, owner, async page => {
        await page.goto(base + "/checkin");
        await page.getByText(es ? "Usaremos tus registros actuales" : "Using your current sleep", {exact: false}).waitFor();
        assert.equal(await page.locator("#answer-sleep").count(), 0, "No duplicate subjective questionnaire");
        assert.equal(await page.locator("#answer-rhr").count(), 0);
        await page.locator("#answer-availableMinutes").fill("30");
        await screenshot(page, `fresh-${language}`);
        await page.getByText(es ? "Mediciones y contexto adicionales (opcional)" : "Additional measurements and context (optional)", {exact:true}).click();
        await page.locator("#answer-weightKg").fill("71");
        assert.equal(await page.locator("#answer-sleep").count(),0,"Optional weight does not force duplicate subjective questions");
        const submit = page.getByRole("button", {name: es ? "Revisar mi plan guardado" : "Review my saved plan", exact: true});
        await submit.click();
        await page.getByRole("alert").filter({hasText: es ? "Confirma tu estado" : "Confirm how you feel"}).waitFor();
        assert.equal(await db.dailyCheckin.count({where: {userId: owner.id}}), 0, "Unconfirmed shortcut does not save");
        await page.getByRole("checkbox", {name: es ? /Confirmo que no tengo/ : /I confirm no illness/}).check();
        const savedResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/api/checkin" && response.request().method() === "POST");
        await submit.click();
        const saved = await savedResponse; assert.equal(saved.status(), 200, await saved.text());
        const payload = await saved.json(); assert.equal(payload.ok, true);
        assert.ok(payload.prescriptions.some((p: any) => p.canonical?.verdict === "ready"), "Real backend prepared the session");
        const stored = await db.dailyCheckin.findUniqueOrThrow({where: {userId_date: {userId: owner.id, date: day}}});
        const answers = JSON.parse(stored.answers || "{}");
        for (const key of ["sleep", "soreness", "motivation", "energy", "stress"]) assert.equal(answers[key], null);
        assert.equal(answers.inputMetadata.deviceReview.athleteId, owner.id); assert.equal(answers.availableMin, 30);
        assert.equal(Number(answers.weightKg),71,"Optional weight is saved rather than silently discarded");
        assert.equal(JSON.parse(stored.adaptation || "{}").scoreAvailable, false);
        const reloaded = await api("/api/today", owner);
        assert.ok(["training", "easy-day"].includes(reloaded.recovery.mode), JSON.stringify(reloaded.recovery));
        assert.equal(reloaded.sessions.find((s: any) => s.id === owner.workoutId)?.verdict, "ready");
        await page.goto(base + "/today");
        await page.getByText(es ? "Sesión de hoy revisada" : "Today's session reviewed", {exact: true}).waitFor();
        assert.equal(await page.getByRole("link", {name: es ? "Responder check-in" : "Answer check-in", exact: true}).count(), 0);
        await page.reload(); await page.getByText(es ? "Sesión de hoy revisada" : "Today's session reviewed", {exact: true}).waitFor();
        await screenshot(page, `today-reviewed-${language}`);
        assert.equal(await db.dailyCheckin.count({where: {userId: owner.id}}), 1);
        assert.equal(await db.workout.count({where: {userId: owner.id}}), 1, "No duplicate workout created");
      });
      await db.metricObservation.updateMany({where: {userId: owner.id}, data: {observedAt: localDate(addDaysKey(today, -1), "UTC")}});
      assert.equal((await api("/api/checkin", owner)).deviceReview, null);
      await api("/api/checkin", owner, confirmation(before.deviceReview.revision), 409);
      const stale = await api("/api/today", owner); assert.equal(stale.sessions.find((s: any) => s.id === owner.workoutId)?.verdict, "blocked");
      await mobile(browser, owner, async page => {
        await page.goto(base + "/checkin"); await page.locator("#answer-sleep").waitFor();
        assert.equal(await page.getByRole("checkbox", {name: es ? /Confirmo que no tengo/ : /I confirm no illness/}).count(), 0);
        await screenshot(page, `stale-manual-${language}`);
      });
    });
    await scenario("Missing measurements and another athlete's revision cannot enable the shortcut", async () => {
      const owner = await actor(), other = await actor("en", false);
      const current = await api("/api/checkin", owner);
      assert.equal((await api("/api/checkin", other)).deviceReview, null);
      await api("/api/checkin", other, {...confirmation(current.deviceReview.revision), userId: owner.id}, 409);
      assert.equal(await db.dailyCheckin.count({where: {userId: {in: [owner.id, other.id]}}}), 0);
      await db.metricObservation.deleteMany({where: {userId: owner.id, metricType: "hrv_rmssd"}});
      assert.equal((await api("/api/checkin", owner)).deviceReview, null);
      await api("/api/checkin", owner, confirmation(current.deviceReview.revision), 409);
    });
    await scenario("Reported symptoms keep the manual path and cannot be erased by a device confirmation", async () => {
      const owner = await actor(); const current = await api("/api/checkin", owner);
      const manual = await api("/api/checkin", owner, {sleep: 3, soreness: 3, motivation: 3, energy: 3, stress: 3, sick: true, newPain: false, urgentSymptoms: false, availableMinutes: 30});
      assert.equal(manual.adaptation.safetyStatus, "hold");
      const record = await db.dailyCheckin.findUniqueOrThrow({where: {userId_date: {userId: owner.id, date: day}}});
      assert.equal((await api("/api/checkin", owner)).deviceReview, null);
      await api("/api/checkin", owner, confirmation(current.deviceReview.revision), 409);
      assert.equal((await db.dailyCheckin.findUniqueOrThrow({where: {id: record.id}})).answers, record.answers);
      await mobile(browser, owner, async page => {
        await page.goto(base + "/checkin"); await page.locator("#answer-sick").waitFor();
        await page.waitForFunction(() => (document.querySelector("#answer-sick") as HTMLSelectElement | null)?.value === "true");
        assert.equal(await page.locator("#answer-sick").inputValue(), "true");
        await screenshot(page, "symptoms-manual");
      });
    });
  } finally {await browser.close();}
}
main().catch(error => {results.push({name: "Acceptance runner", status: "FAIL", detail: error instanceof Error ? error.message : String(error)}); process.exitCode = 1;}).finally(async () => {
  let cleanup = false;
  try {await db.usageCounter.deleteMany({where: {userId: {in: ids}}}); await db.appEvent.deleteMany({where: {userId: {in: ids}}}); await db.user.deleteMany({where: {id: {in: ids}}}); cleanup = (await db.user.count({where: {id: {in: ids}}})) === 0;}
  catch {results.push({name: "Synthetic fixture cleanup", status: "FAIL"});}
  finally {await db.$disconnect();}
  writeFileSync(`${dir}/report.json`, JSON.stringify({generatedAt: new Date().toISOString(), scope: "Synthetic stored WHOOP observations; real mobile browser, API and disposable PostgreSQL; no successful POST mocked", results, cleanup,
    notTested: ["Live WHOOP authentication or synchronization", "Production athlete data", "Hardware microphone", "Actual wearable delivery"]}, null, 2));
  if (results.some(result => result.status === "FAIL") || !cleanup) process.exitCode = 1;
  console.log(`${results.filter(result => result.status === "PASS").length}/${results.length} device-assisted acceptance scenarios passed`);
});
