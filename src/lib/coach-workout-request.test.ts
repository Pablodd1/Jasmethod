import { test } from "node:test";
import assert from "node:assert/strict";
import { opensTodayWorkout, todayWorkoutRequest } from "./coach-review-intent";
import { workoutRequestReply } from "./coach-workout-request";
import type { CoachReplyContext } from "./coach-conversation";

test("English and Spanish workout requests understand spoken time without treating it as a write", () => {
  for (const [message, expected] of [
    ["I need a bike workout I have an hour", { sport: "bike", minutes: 60 }],
    ["Quiero un entrenamiento de ciclismo, tengo una hora", { sport: "bike", minutes: 60 }],
    ["Can you suggest a swim workout for half an hour?", { sport: "swim", minutes: 30 }],
    ["I need a HYROX session for 45 minutes", { sport: "hyrox", minutes: 45 }],
    ["I want a strength session", { sport: "strength", minutes: null }],
    ["I need a bike workout in 20 or 40 minutes", { sport: "bike", minutes: null }],
  ] as const) {
    assert.deepEqual(todayWorkoutRequest(message), expected);
    assert.equal(opensTodayWorkout(message), true);
  }
  for (const message of ["I don't want a bike workout", "I need a bike workout tomorrow", "Change my bike workout to 50 minutes", "I completed a 60 minute bike workout", "I need to change my run workout", "What is a bike workout?", "I need a sample bike workout for next week"]) {
    assert.equal(todayWorkoutRequest(message), null);
  }
});

test("request uses reviewed plan and time only; no protected values are copied and no dose is invented", () => {
  const request = { sport: "bike", minutes: 60 } as const;
  const today = "2026-11-25";
  const recovery = { mode: "training", safetyStatus: "clear", recoveryNeedsReview: false } as NonNullable<CoachReplyContext["recovery"]>;
  const context: CoachReplyContext = { localToday: today, recovery, approvedSession: { id: "private-id", title: "Private workout", date: today, sport: "bike", durationMin: 55, approved: true } };
  const ready = workoutRequestReply(request, context, false);
  assert.match(ready.ruleId, /-review$/);
  assert.doesNotMatch(ready.answer, /private-id|Private workout|55/);
  assert.match(workoutRequestReply({ ...request, minutes: 30 }, context, false).ruleId, /-plan$/);
  assert.match(workoutRequestReply(request, context, true).ruleId, /-plan$/);
  assert.match(workoutRequestReply(request, { ...context, recovery: { ...recovery, mode: "planned-rest" } }, false).ruleId, /-reserved$/);
  assert.match(workoutRequestReply(request, { ...context, recovery: { ...recovery, mode: "hold" } }, false).ruleId, /-hold$/);
  assert.match(workoutRequestReply(request, { ...context, recovery: { ...recovery, recoveryNeedsReview: true } }, false).ruleId, /-checkin$/);
  const missing = workoutRequestReply(request, { localToday: today, language: "es" }, false);
  assert.match(missing.answer, /60 minutos/);
  assert.doesNotMatch(missing.answer, /Cuántos minutos/);
});
