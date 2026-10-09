import test from "node:test";
import assert from "node:assert/strict";
import { canonicalSession, type CanonicalSession } from "./canonical-session";
import { canonicalCorosWorkout, corosDirectAvailability, planCorosOperation, publishCanonicalCorosWorkout } from "./coros-direct";

function session(sport: "run" | "bike" = "run", steps: unknown[] = [step()]) {
  return canonicalSession({ athleteId: "athlete-a", workout: { id: "workout-a", userId: "athlete-a", sport, title: "Intervals", durationMin: 1 }, prescription: { sport, durationMin: 1, verdict: "full", steps }, dateLocal: "2026-10-10", timezone: "America/New_York" });
}
function step(extra: Record<string, unknown> = {}) {
  return { name: "Work", phase: "active", seconds: 60, zone: "z3", target: { type: "open" }, ...extra };
}

test("COROS preparation preserves time/distance/lap endpoints without duration estimates", () => {
  const c = session("run", [step({ endpoint: { type: "distance", meters: 400 }, seconds: 99, target: { type: "pace", low: 240, high: 300 } }), step({ endpoint: { type: "lap" } }), step({ seconds: 5.25 })]);
  const draft = canonicalCorosWorkout(c);
  assert.equal(draft.courseSportCode, 1);
  assert.equal(draft.wireSchemaVerified, false);
  assert.deepEqual(draft.steps.map(s => s.endpoint), [{ type: "distance", meters: 400 }, { type: "lap" }, { type: "time", seconds: 5.25 }]);
  assert.equal("seconds" in draft.steps[0], false);
  assert.deepEqual(draft.steps[0].target, c.steps[0].target);
  assert.equal(draft.dateLocal, "2026-10-10");
  assert.equal(draft.timezone, "America/New_York");
  assert.equal(draft.revision, c.revision);
});

test("COROS preparation preserves exact canonical units, open targets, and expanded repeats", () => {
  const c = session("bike", [{ repeat: 3, group: "Three sets", steps: [step({ seconds: 5, note: "Keep seated", target: { type: "power", low: 250, high: 300 } }), step({ seconds: 15, phase: "recovery", target: { type: "heartRate", low: 100, high: 120 } })] }]);
  const draft = canonicalCorosWorkout(c);
  assert.equal(draft.courseSportCode, 2);
  assert.equal(draft.repeatRepresentation, "expanded_exact");
  assert.equal(draft.steps.length, 6);
  for (let i = 0; i < c.steps.length; i++) {
    assert.deepEqual(draft.steps[i].endpoint, c.steps[i].endpoint);
    assert.deepEqual(draft.steps[i].target, c.steps[i].target);
    assert.equal(draft.steps[i].group, "Three sets");
    assert.equal(draft.steps[i].order, i);
  }
  draft.steps[0].target.low = 999;
  assert.equal(c.steps[0].target.low, 250, "draft is detached from canonical targets");
  const speed = canonicalCorosWorkout(session("run", [step({ target: { type: "speed", low: 3.1, high: 4.2 } })]));
  assert.equal(speed.steps[0].target.low, 3.1);
  assert.equal(canonicalCorosWorkout(session()).steps[0].target.type, "open");
});

test("COROS rejects unsafe or unsupported content rather than inventing workout fields", () => {
  const good = session();
  for (const bad of [
    { ...good, verdict: "blocked", reason: "Check-in required" }, { ...good, verdict: "rest" },
    { ...good, sport: "swim" }, { ...good, sport: "strength" }, { ...good, sport: "brick" },
    { ...good, dateLocal: "2026-02-30" }, { ...good, timezone: "Invalid/Zone" },
    { ...good, steps: [] }, { ...good, steps: [{ ...good.steps[0], endpoint: { type: "reps", reps: 10 } }] },
    { ...good, steps: [{ ...good.steps[0], target: { ...good.steps[0].target, type: "power", low: Number.NaN, high: 200 } }] },
    { ...good, steps: [{ ...good.steps[0], target: { ...good.steps[0].target, stroke: "freestyle" } }] },
  ]) assert.throws(() => canonicalCorosWorkout(bad as CanonicalSession));
});

test("COROS library edits and scheduled-copy edits have different read-before-write routes", () => {
  const c = session();
  const library = planCorosOperation(c, { action: "update_library", libraryId: "12345678901234567890", editable: true });
  const scheduled = planCorosOperation(c, { action: "update_scheduled", idInPlan: "22345678901234567890", dateLocal: c.dateLocal, editable: true, recordRole: "standalone" });
  assert.equal(library.tool, "updateWorkoutDetails");
  assert.deepEqual(library.readFirst, ["queryWorkoutDetails"]);
  assert.equal(library.destination, "library");
  assert.equal(scheduled.tool, "updateScheduledWorkout");
  assert.deepEqual(scheduled.readFirst, ["queryTrainingSchedule", "queryScheduledWorkoutDetails"]);
  assert.equal(scheduled.preserveReturnedIdInPlan, true);
  assert.equal(library.status, "blocked");
  assert.equal(scheduled.deviceReceived, false);
  assert.equal(planCorosOperation(c, { action: "create_scheduled" }).tool, "createScheduledWorkout");
  assert.equal(planCorosOperation(c, { action: "create_library" }).tool, "createSingleWorkout");
  assert.equal(planCorosOperation(c, { action: "schedule_library", libraryId: "123" }).tool, "scheduleWorkout");
});

test("COROS moves, cancellations, non-editable records and plan edits fail closed", () => {
  const c = session();
  for (const action of ["cancel", "move"] as const) assert.throws(() => planCorosOperation(c, { action }), /COROS App/);
  assert.throws(() => planCorosOperation(c, { action: "update_library", libraryId: "123", editable: false }), /non-editable/);
  assert.throws(() => planCorosOperation(c, { action: "update_library", libraryId: "1.234e6", editable: true }), /full library/);
  assert.throws(() => planCorosOperation(c, { action: "update_library", libraryId: 123 as unknown as string, editable: true }), /full library/);
  assert.throws(() => planCorosOperation(c, { action: "update_scheduled", idInPlan: "123", dateLocal: c.dateLocal, editable: true, recordRole: "plan" }), /execution plan/);
  assert.throws(() => planCorosOperation(c, { action: "update_scheduled", idInPlan: "123", dateLocal: "2026-10-11", editable: true, recordRole: "standalone" }), /cannot move/);
});

test("COROS production write path is disabled independently of environment flags", async () => {
  const availability = corosDirectAvailability();
  assert.equal(availability.available, false);
  assert.equal(availability.partnerApplicationRequired, false);
  assert.equal(availability.inboundMode, "polling");
  await assert.rejects(publishCanonicalCorosWorkout(session()), { code: "write_disabled", status: 503 });
});
