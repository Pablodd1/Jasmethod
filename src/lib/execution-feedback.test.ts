import { test } from "node:test";
import assert from "node:assert/strict";
import { applyExecutionFeedback, sessionReportedLoad } from "./execution-feedback";
import type { Adaptation } from "./adaptive";
const full: Adaptation = { score: 90, scoreAvailable: true, safetyStatus: "clear", verdict: "full", durationFactor: 1, intensityCap: "z7", message: "Retain plan" };
test("actual duration times anchored RPE is labeled load and never a planned-duration fallback", () => {
  assert.equal(sessionReportedLoad({ id: "a", feedbackStatus: "partial", actualDurationMin: 20, rpe: 5 }), 100);
  assert.equal(sessionReportedLoad({ id: "a", feedbackStatus: "completed", actualDurationMin: 20, rpe: 0 }), 0);
  assert.equal(sessionReportedLoad({ id: "a", feedbackStatus: "completed", durationMin: 60, rpe: 5 }), null);
  assert.equal(sessionReportedLoad({ id: "a", feedbackStatus: "skipped", actualDurationMin: 0, rpe: 5 }), null);
  assert.equal(sessionReportedLoad({ id: "a", feedbackStatus: "unknown" }), null);
});
test("confirmed very-hard partial or substituted execution conservatively changes next adaptation", () => {
  for (const feedbackStatus of ["completed", "partial", "substituted"]) {
    const { adaptation } = applyExecutionFeedback(full, [{ id: "a", feedbackStatus, actualDurationMin: 20, rpe: 9, feedbackAt: new Date() }]);
    assert.equal(adaptation.verdict, "trim"); assert.equal(adaptation.intensityCap, "z3"); assert.equal(adaptation.durationFactor, .85);
  }
});
test("unknown execution produces conservative guidance; skipped work is never made up", () => {
  const { adaptation, notes, inputs } = applyExecutionFeedback(full, [{ id: "a", feedbackStatus: "skipped" }, { id: "b", feedbackStatus: "partial", rpe: 6 }]);
  assert.equal(adaptation.intensityCap, "z2"); assert.equal(inputs[1].reportedLoadAU, null); assert.ok(notes.some((n) => n.includes("not added")));
});
test("feedback never lifts a safety hold or raises intensity after easier work", () => {
  const rest = { ...full, verdict: "rest" as const, durationFactor: 0, intensityCap: "z1", safetyStatus: "urgent" as const };
  assert.deepEqual(applyExecutionFeedback(rest, [{ id: "a", feedbackStatus: "completed", actualDurationMin: 30, rpe: 2 }]).adaptation, rest);
  assert.deepEqual(applyExecutionFeedback(full, [{ id: "a", feedbackStatus: "completed", actualDurationMin: 30, rpe: 2 }]).adaptation, full);
});
