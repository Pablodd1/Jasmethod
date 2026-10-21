import test from "node:test";
import assert from "node:assert/strict";
import { readDeliveryWorkout } from "./delivery-session";
import { runMockCoachingSchedule } from "./coaching-service";
import { TELEGRAM_CONSENT_VERSION } from "./coaching-communication";
import { prisma } from "./db";

function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (key === "OR") return value.some((part: any) => matches(row, part));
    if (key === "AND") return value.every((part: any) => matches(row, part));
    if (value === null) return row[key] == null;
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("not" in value) return row[key] != null;
      if ("notIn" in value) return row[key] != null && !value.notIn.includes(row[key]);
      if ("gte" in value || "lt" in value) return (!value.gte || row[key] >= value.gte) && (!value.lt || row[key] < value.lt);
      return row[key] != null && matches(row[key], value);
    }
    return row[key] === value;
  });
}
const owner = "synthetic-athlete", now = new Date("2026-10-20T12:00Z");
const row = (id: string, extra: Record<string, any> = {}) => ({ id, userId: owner, date: now, planned: true, completed: false, approved: true, feedbackStatus: null, source: "plan", ...extra });
const plan = (id: string, status = "active") => ({ plan: { id, status, userId: owner } });

test("delivery selection rejects older active, archived and retired approved rows while retaining history for feedback only", async () => {
  let activeId = "latest";
  const records = [row("current", { planDay: plan("latest") }), row("old-active", { planDay: plan("older") }), row("archived", { planDay: plan("archived", "archived") }), row("retired", { source: "superseded-starter" }), row("old-actual", { planDay: plan("older"), actualDurationMin: 0 }), row("foreign", { userId: "other", completed: true })];
  const db: any = {
    trainingPlan: { findFirst: async ({ where, orderBy }: any) => { assert.equal(where.userId, owner); assert.equal(where.status, "active"); assert.deepEqual(orderBy,[{createdAt:"desc"},{id:"desc"}]); return { id: activeId }; } },
    workout: { findFirst: async ({ where }: any) => records.find(record => matches(record, where)) ?? null },
  };
  assert.equal((await readDeliveryWorkout(db, owner, "current"))?.id, "current");
  for (const id of ["old-active", "archived", "retired", "old-actual", "foreign"]) assert.equal(await readDeliveryWorkout(db, owner, id), null, id);
  assert.equal((await readDeliveryWorkout(db, owner, "old-actual", true))?.id, "old-actual");
  assert.equal(await readDeliveryWorkout(db, owner, "foreign", true), null);
  activeId = "replacement";
  assert.equal(await readDeliveryWorkout(db, owner, "current"), null, "a queued attempt must re-read the current plan");
});

test("morning scheduler excludes 85 legacy active-plan rows and retains old actual feedback", async () => {
  const env = { ENABLE_TELEGRAM_COACHING: "true", ENABLE_AUTOMATED_DELIVERY: "true", COACHING_TRANSPORT: "telegram", TELEGRAM_BOT_TOKEN: "SYNTHETIC_ONLY", TELEGRAM_COACHING_WEBHOOK_SECRET: "SYNTHETIC_ONLY" };
  const saved = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]])); Object.assign(process.env, env);
  const actor = { id: owner, email: "athlete@example.invalid", timezone: "UTC" };
  const records = [...Array.from({ length: 85 }, (_, i) => row(`legacy-${i}`, { planDay: plan("older") })), row("current-a", { planDay: plan("latest") }), row("current-b", { planDay: plan("latest") }), row("old-actual", { date: new Date("2026-10-19T12:00Z"), planned: false, completed: true, actualDurationMin: 30, planDay: plan("archived", "archived") })];
  const originals = { pref: prisma.communicationPreference.findMany, prompt: prisma.coachingPrompt.updateMany, connector: prisma.connector.findMany, workouts: prisma.workout.findMany, plan: prisma.trainingPlan.findFirst };
  const prompts: Array<{ sessionId: string; purpose: string }> = [];
  (prisma.communicationPreference as any).findMany = async () => [{ userId: owner, user: actor, primaryChannel: "telegram", paused: false, dailyPlan: true, sessionFeedback: true, missingData: true, consentVersion: TELEGRAM_CONSENT_VERSION, consentAt: now, timezone: "UTC", quietStart: 1380, quietEnd: 420, minuteOfDay: 300, declinedOptional: "[]", verifiedChatId: "123", verifiedActorId: "123", verifiedAt: now, verificationTransport: "telegram" }];
  (prisma.coachingPrompt as any).updateMany = async () => ({ count: 0 });
  (prisma.connector as any).findMany = async () => [];
  (prisma.trainingPlan as any).findFirst = async () => ({ id: "latest" });
  (prisma.workout as any).findMany = async ({ where }: any) => records.filter(record => matches(record, where));
  try {
    await runMockCoachingSchedule(now, { prompt: (async (_: any, input: any) => { prompts.push(input); return { duplicate: false, prompt: { status: "sent" } }; }) as any });
    assert.deepEqual(prompts.map(p => `${p.purpose}:${p.sessionId}`), ["dailyPlan:current-a", "dailyPlan:current-b", "sessionFeedback:old-actual"]);
    assert.equal(records.length, 88, "selection does not delete or rewrite legacy/actual records");
  } finally {
    (prisma.communicationPreference as any).findMany = originals.pref; (prisma.coachingPrompt as any).updateMany = originals.prompt;
    (prisma.connector as any).findMany = originals.connector; (prisma.workout as any).findMany = originals.workouts; (prisma.trainingPlan as any).findFirst = originals.plan;
    for (const key of Object.keys(env)) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
  }
});
