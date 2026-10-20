import test from "node:test";
import assert from "node:assert/strict";
import { approvalStatus, buildWorkoutHistory, canRestoreLatest, prescriptionSteps, stepsDigest, type AuditRow } from "./workout-history";
import { applyIntervalPatch, type EditableStep } from "./workout-interval-edit";

const W = "w1";
function steps(reps: number, work = 240, rest = 120, zone = "z4"): EditableStep[] {
  const out: EditableStep[] = [{ name: "Warm up", seconds: 600, zone: "z1", phase: "warmup", endpoint: { type: "time", seconds: 600 } }];
  for (let i = 0; i < reps; i++) {
    out.push({ name: `Hard ${i + 1}/${reps}`, seconds: work, zone, phase: "active", endpoint: { type: "time", seconds: work } });
    if (i < reps - 1) out.push({ name: "Easy", seconds: rest, zone: "z2", phase: "recovery", endpoint: { type: "time", seconds: rest } });
  }
  out.push({ name: "Cool down", seconds: 600, zone: "z1", phase: "cooldown", endpoint: { type: "time", seconds: 600 } });
  return out;
}
const rx = (s: EditableStep[]) => JSON.stringify({ steps: [], sportStructure: { schemaVersion: 1, kind: "endurance", steps: s }, durationMin: 60 });
let n = 0;
const row = (o: Partial<AuditRow> & { action: string }): AuditRow => ({ id: `a${++n}`, actorId: "athlete", entityId: W, createdAt: new Date(Date.UTC(2026, 9, 1, 12, n)), ...o });

test("steps digest handles endurance structure, plain steps and repeat nodes; garbage is null", () => {
  assert.equal(stepsDigest(rx(steps(4)))?.repeats, 4);
  assert.equal(stepsDigest(JSON.stringify({ steps: steps(3) }))?.stepCount, 1 + 5 + 1);
  const repeatNode = JSON.stringify({ steps: [{ name: "W", seconds: 60, zone: "z1", phase: "warmup" }, { repeat: 3, steps: [{ name: "Hard", seconds: 30, zone: "z5", phase: "active" }, { name: "Easy", seconds: 30, zone: "z1", phase: "recovery" }] }] });
  assert.equal(prescriptionSteps(repeatNode)?.length, 7);
  assert.equal(stepsDigest("not json"), null);
  assert.equal(stepsDigest(null), null);
  assert.equal(stepsDigest(JSON.stringify({ steps: [{ repeat: 500, steps: [] }] })), null);
});

test("history of a chat interval edit: what changed, approval cleared, newest first", () => {
  const before = steps(4), result = applyIntervalPatch(before, { repeats: 5 }, { budgetSeconds: 7200, intensityCapZone: 5 });
  assert.ok(result.ok);
  if (!result.ok) return;
  const rows = [
    row({ action: "workout.approved", after: JSON.stringify({ revision: "rev-1" }) }),
    row({ action: "workout.cardSteps", before: rx(before), after: rx(result.steps), note: "Source revision rev-1; approval cleared" }),
  ];
  const history = buildWorkoutHistory(rows, { workoutId: W, athleteId: "athlete" });
  assert.deepEqual(history.map(h => h.kind), ["steps_edited", "approved"]);
  assert.equal(history[0].approvalCleared, true);
  assert.match(history[0].summary.en, /repeats 4 → 5/);
  assert.match(history[0].summary.es, /repeticiones 4 → 5/);
  assert.equal(history[0].before?.repeats, 4);
  assert.equal(history[0].after?.repeats, 5);
  assert.equal(history[1].approvedRevision, "rev-1");
  assert.equal(history[0].byAthlete, true);
});

test("history never leaks raw before/after JSON or athlete measurements from workout.update rows", () => {
  const full = { id: W, title: "Intervals", durationMin: 60, intensity: "z4", avgHr: 151, maxHr: 188, feedbackNote: "knee pain, secret note", preWeightKg: 70.4, approved: true, prescription: null };
  const rows = [row({ action: "workout.update", before: JSON.stringify(full), after: JSON.stringify({ ...full, durationMin: 50, approved: false }) })];
  const history = buildWorkoutHistory(rows, { workoutId: W });
  assert.equal(history.length, 1);
  assert.equal(history[0].kind, "plan_edited");
  assert.equal(history[0].approvalCleared, true);
  const text = JSON.stringify(history);
  for (const secret of ["knee pain", "151", "188", "70.4", "feedbackNote", "avgHr"]) assert.equal(text.includes(secret), false, secret);
  assert.match(history[0].summary.en, /duration/);
});

test("feedback-only updates are not plan revisions; other workouts' rows are ignored", () => {
  const base = { id: W, title: "Intervals", durationMin: 60, intensity: "z4", approved: true };
  const rows = [
    row({ action: "workout.feedback", before: JSON.stringify(base), after: JSON.stringify({ ...base, rpe: 7 }) }),
    row({ action: "workout.update", before: JSON.stringify(base), after: JSON.stringify({ ...base, rpe: 7 }) }),
    row({ action: "workout.cardSteps", entityId: "someone-elses", before: rx(steps(4)), after: rx(steps(5)) }),
    row({ action: "auth.login" }),
  ];
  assert.deepEqual(buildWorkoutHistory(rows, { workoutId: W }).map(h => h.action), []);
});

test("approval is only current for the exact revision that was approved", () => {
  const rows = [row({ action: "workout.approved", after: JSON.stringify({ revision: "rev-1" }) })];
  assert.deepEqual(approvalStatus(rows, { workoutId: W, currentRevision: "rev-1" }).reason, "current");
  assert.equal(approvalStatus(rows, { workoutId: W, currentRevision: "rev-2" }).approved, false);
  assert.equal(approvalStatus(rows, { workoutId: W, currentRevision: "rev-2" }).reason, "revision_changed");
  assert.equal(approvalStatus([], { workoutId: W, currentRevision: "rev-1" }).reason, "never_approved");
  const other = [row({ action: "workout.approved", entityId: "other", after: JSON.stringify({ revision: "rev-1" }) })];
  assert.equal(approvalStatus(other, { workoutId: W, currentRevision: "rev-1" }).approved, false);
});

test("an approval older than a later edit does not re-approve: latest approval row wins, by time", () => {
  const rows = [
    row({ action: "workout.approved", after: JSON.stringify({ revision: "rev-2" }), createdAt: new Date("2026-10-01T10:00:00Z") }),
    row({ action: "workout.approved", after: JSON.stringify({ revision: "rev-1" }), createdAt: new Date("2026-10-01T09:00:00Z") }),
  ];
  assert.equal(approvalStatus(rows, { workoutId: W, currentRevision: "rev-1" }).approved, false);
  assert.equal(approvalStatus(rows, { workoutId: W, currentRevision: "rev-2" }).approved, true);
});

test("undo is offered only while the newest step edit is still the saved prescription (same rule as the server)", () => {
  const a = rx(steps(4)), b = rx(steps(5));
  const rows = [row({ action: "workout.cardSteps", before: a, after: b })];
  assert.equal(canRestoreLatest(rows, { workoutId: W, currentPrescription: b }), true);
  assert.equal(canRestoreLatest(rows, { workoutId: W, currentPrescription: a }), false);
  assert.equal(canRestoreLatest(rows, { workoutId: W, currentPrescription: rx(steps(6)) }), false);
  assert.equal(canRestoreLatest([], { workoutId: W, currentPrescription: b }), false);
  assert.equal(canRestoreLatest([row({ action: "workout.cardSteps", entityId: "x", before: a, after: b })], { workoutId: W, currentPrescription: b }), false);
});

test("restore entries are labelled as restores and still clear approval", () => {
  const rows = [row({ action: "workout.cardRestore", before: rx(steps(5)), after: rx(steps(4)) })];
  const [h] = buildWorkoutHistory(rows, { workoutId: W });
  assert.equal(h.kind, "steps_restored");
  assert.equal(h.approvalCleared, true);
  assert.match(h.summary.en, /restored/);
  assert.match(h.summary.en, /repeats 5 → 4/);
});

test("restoring an old revision never resurrects its historical approval", () => {
  const rows = [row({ action: "workout.approved", after: JSON.stringify({ revision: "original" }) })];
  assert.equal(approvalStatus(rows, { workoutId: W, currentRevision: "original", currentApproved: false }).approved, false);
});

test("prescription-only updates remain visible without exposing raw prescription data", () => {
  const [entry] = buildWorkoutHistory([row({ action: "workout.update", before: JSON.stringify({ prescription: rx(steps(4)) }), after: JSON.stringify({ prescription: rx(steps(5)) }) })], { workoutId: W });
  assert.equal(entry.kind, "plan_edited");
  assert.match(entry.summary.en, /prescription/);
  assert.match(entry.summary.es, /prescripción/);
});
