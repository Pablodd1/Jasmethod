import { test } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { updateWorkout } from "./workout-update";

test("manual session outcomes never invent actual duration or mark partial as completed", async () => {
  const original = prisma.$transaction;
  const session = { id: "synthetic-workout", userId: "synthetic-athlete", date: new Date("2026-10-02T00:00:00Z"), title: "Planned run", sport: "run", durationMin: 60, planned: true, completed: false, actualDurationMin: null, rpe: null, planDay: null };
  const writes: any[] = [];
  (prisma as any).$transaction = async (fn: any) => fn({ workout: { findFirst: async ({ where }: any) => { assert.equal(where.userId, session.userId); return session; }, update: async ({ data }: any) => { writes.push(data); return { ...session, ...data }; } }, auditLog: { create: async () => ({}) } });
  const actor = { id: session.userId, timezone: "UTC" };
  try {
    for (const status of ["completed", "partial", "substituted", "skipped", "unknown"]) {
      const result = await updateWorkout(actor.id, actor, { sessionId: session.id, feedbackStatus: status });
      assert.equal(result.actualDurationMin, null);
      assert.equal(result.rpe, null);
      assert.equal(result.completed, status === "completed");
      assert.equal(writes.at(-1).actualDurationMin, undefined);
    }
    const actual = await updateWorkout(actor.id, actor, { sessionId: session.id, feedbackStatus: "substituted", actualDurationMin: 22, rpe: 4, actualSport: "bike", actualDetails: { distanceKm: 5.2, reps: null } });
    assert.equal(actual.sport, "run"); assert.equal(actual.actualSport, "bike"); assert.equal(actual.actualDurationMin, 22);
    const report = JSON.parse(actual.actualDetails!);
    assert.equal(report.source, "athlete_report"); assert.equal(report.observedDate, "2026-10-02"); assert.deepEqual(report.values, { distanceKm: 5.2, reps: null });
    const correction = await updateWorkout(actor.id, actor, { sessionId: session.id, rpe: 6 });
    assert.ok(correction.feedbackAt instanceof Date, "A direct effort correction advances the execution timestamp");
    const cleared = await updateWorkout(actor.id, actor, { sessionId: session.id, actualDurationMin: null });
    assert.ok(cleared.feedbackAt instanceof Date, "Clearing an old actual also invalidates previous readiness");
    await assert.rejects(updateWorkout(actor.id, actor, { sessionId: session.id, actualDetails: { reps: 2.5 } }), /Invalid actual reps/);
    await assert.rejects(updateWorkout(actor.id, actor, { sessionId: session.id, actualSport: "invented" }), /Invalid actual sport/);
  } finally { (prisma as any).$transaction = original; }
});
