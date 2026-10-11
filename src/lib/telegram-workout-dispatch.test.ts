import test from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { canonicalSession } from "./canonical-session";
import { createCoachingPrompt, saveCommunicationSettings } from "./coaching-service";
import { TELEGRAM_CONSENT_VERSION } from "./coaching-communication";
import { sendTelegramCoaching } from "./telegram-coaching-transport";
const now = new Date("2026-10-11T12:00:00Z");
const actor = { id: "athlete", email: "athlete@example.invalid", timezone: "UTC" };
const env = { ENABLE_TELEGRAM_COACHING: "true", ENABLE_AUTOMATED_DELIVERY: "true", COACHING_TRANSPORT: "telegram", TELEGRAM_BOT_TOKEN: "SYNTHETIC_ONLY", TELEGRAM_COACHING_WEBHOOK_SECRET: "SYNTHETIC_ONLY" };
const basePreference = { userId: actor.id, primaryChannel: "telegram", paused: false, dailyPlan: true, sessionFeedback: false, missingData: false, consentVersion: TELEGRAM_CONSENT_VERSION, consentAt: now, timezone: "UTC", quietStart: 1380, quietEnd: 420, minuteOfDay: 600, declinedOptional: "[]", verifiedChatId: "123", verifiedActorId: "123", verifiedAt: now, verificationTransport: "telegram" };
async function fixture(mode: "accepted" | "revoke" | "changed" | "approval" | "held" | "old-consent" | "partial" | "preflight" | "unapproved" | "missing-approval" | "stale-approval" | "started" | "approval-preflight" | "approval-before-request") {
  const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]])); Object.assign(process.env, env);
  const original = prisma.$transaction, originalUpdate = prisma.coachingPrompt.updateMany;
  let pref = { ...basePreference, ...(mode === "old-consent" ? { consentVersion: "telegram-coaching-v1" } : {}) }, row: any = null, calls = 0, approval = "", audit: any[] = [];
  const canonical = canonicalSession({ athleteId: actor.id, workout: { id: "session", sport: "bike", title: "Fixture", durationMin: 10 }, prescription: { sport: "bike", durationMin: 10, verdict: "full", steps: [{ name: "Steady", seconds: 600, zone: "z2", phase: "active" }] }, profile: { ftp: 200 }, dateLocal: "2026-10-11", timezone: "UTC" });
  approval = mode === "missing-approval" ? "" : mode === "stale-approval" ? "stale" : canonical.revision;
  let resolved: any = { canonical: mode === "held" ? { ...canonical, verdict: "blocked" } : canonical, targetProfile: { ftp: 200 }, workout: { id: "session", date: new Date("2026-10-11T00:00Z"), approved: mode !== "unapproved", planned: true, completed: false, feedbackStatus: null, startTime: mode === "started" ? "11:00" : "15:00", sport: "bike" } };
  const tx: any = {
    communicationPreference: { findUnique: async () => pref },
    coachingPrompt: { findUnique: async ({ where }: any) => where.idempotencyKey ? row : row, count: async () => 0,
      create: async ({ data }: any) => { row = { id: "prompt", replyStatus: "none", ...data }; if (mode === "preflight") pref = { ...pref, paused: true }; if (mode === "approval-preflight") approval = "revoked"; return row; },
      findFirst: async () => row, findUniqueOrThrow: async () => row,
      updateMany: async ({ where, data }: any) => { if (where.status && row?.status !== where.status) return { count: 0 }; Object.assign(row, data); return { count: 1 }; } },
    dailyCheckin: { findUnique: async () => null }, athleteProfile: { findUnique: async () => null },
    auditLog: { findFirst: async ({ where }: any) => where.action === "workout.approved" ? { after: JSON.stringify({ revision: approval }) } : null, create: async (data: any) => { audit.push(data); return {}; } },
  };
  (prisma as any).$transaction = async (fn: any) => fn(tx);
  (prisma.coachingPrompt as any).updateMany = tx.coachingPrompt.updateMany;
  const texts: string[] = [];
  const fetcher = (async (_url, init) => { calls++;
    if (typeof init?.body === "string") texts.push(JSON.parse(init.body).text);
    if (calls === 1) {
      if (mode === "revoke") pref = { ...pref, paused: true };
      if (mode === "changed") resolved = { ...resolved, canonical: { ...canonical, revision: "changed" } };
      if (mode === "approval") approval = "old";
    }
    if (calls === 2 && mode === "partial") return new Response(JSON.stringify({ ok: false, error_code: 400 }));
    return new Response(JSON.stringify({ ok: true, result: { message_id: calls, chat: { id: 123 } } }));
  }) as typeof fetch;
  const dependencies = { resolve: (async () => resolved) as any, clock: () => now, sendTelegram: ((chat, text, options) => { if (mode === "approval-before-request") approval = "revoked"; return sendTelegramCoaching(chat, text, { ...options, env, fetcher }); }) as typeof sendTelegramCoaching };
  try {
    if (mode === "old-consent") { await assert.rejects(createCoachingPrompt(actor, { sessionId: "session", purpose: "dailyPlan" }, now, dependencies), /Opt in/); assert.equal(calls, 0); return; }
    if (mode === "preflight" || mode === "approval-preflight") { await assert.rejects(createCoachingPrompt(actor, { sessionId: "session", purpose: "dailyPlan" }, now, dependencies), /cancelled before sending/); assert.equal(calls, 0); assert.equal(row.status, "cancelled"); assert.equal(row.nextAttemptAt, null); return; }
    const result = await createCoachingPrompt(actor, { sessionId: "session", purpose: "dailyPlan" }, now, dependencies);
    if (mode === "approval-before-request") { assert.equal(calls, 0); assert.equal(result.prompt.status, "failed"); assert.equal(result.prompt.externallySent, false); return; }
    assert.equal(result.prompt.status, ["revoke", "changed", "approval", "partial"].includes(mode) ? "partial" : "sent");
    assert.equal(calls, mode === "accepted" ? 3 : mode === "partial" ? 2 : 1);
    assert.equal(result.prompt.receiptId, "telegram:1"); assert.equal(result.prompt.nextAttemptAt, null);
    assert.equal(result.prompt.externallySent, true);
    if (["unapproved", "missing-approval", "stale-approval", "started", "held"].includes(mode)) {
      assert.match(texts[0], /No cleared workout/);
      assert.doesNotMatch(texts[0], /1\. active|During:|After:| W|RPE/);
    }
    const outcome = audit.find(a => a.data.action === "communication.telegram-outcome");
    assert.ok(outcome); assert.equal(JSON.parse(outcome.data.after).deviceTransferVerified, false);
    // Repeated invocation cannot resend a partially or fully accepted bundle.
    if (!["revoke", "changed", "approval"].includes(mode)) { const prior = calls; assert.equal((await createCoachingPrompt(actor, { sessionId: "session", purpose: "dailyPlan" }, now, dependencies)).duplicate, true); assert.equal(calls, prior); }
  } finally { (prisma as any).$transaction = original; (prisma.coachingPrompt as any).updateMany = originalUpdate; for (const key of Object.keys(env)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
}
for (const mode of ["accepted", "revoke", "changed", "approval", "held", "old-consent", "partial", "preflight", "unapproved", "missing-approval", "stale-approval", "started", "approval-preflight", "approval-before-request"] as const) test(`synthetic end-to-end dispatch: ${mode}`, async () => fixture(mode));
test("pausing old consent never silently renews permission for workout files", async () => {
  const original = prisma.$transaction, saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]])); Object.assign(process.env, env);
  let written: any;
  (prisma as any).$transaction = async (fn: any) => fn({ communicationPreference: { findUnique: async () => ({ ...basePreference, consentVersion: "telegram-coaching-v1" }), upsert: async ({ update }: any) => { written = update; return update; } }, coachingPrompt: { updateMany: async () => ({ count: 0 }) }, auditLog: { create: async () => ({}) } });
  try {
    const { primaryChannel, dailyPlan, sessionFeedback, missingData, timezone, minuteOfDay, quietStart, quietEnd } = basePreference;
    await saveCommunicationSettings(actor, { primaryChannel, paused: true, dailyPlan, sessionFeedback, missingData, timezone, minuteOfDay, quietStart, quietEnd, declinedOptional: [], consentVersion: TELEGRAM_CONSENT_VERSION });
    assert.equal(written.consentVersion, "telegram-coaching-v1"); assert.equal(written.paused, true);
  } finally { (prisma as any).$transaction = original; for (const key of Object.keys(env)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; } }
});
