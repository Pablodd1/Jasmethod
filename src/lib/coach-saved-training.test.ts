import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCoachReply, type CoachReplyContext } from "./coach-conversation";
import { savedTrainingReply } from "./coach-saved-training";

const context: CoachReplyContext = { localToday: "2026-10-14", language: "en", savedTodaySessions: [
  { date: "2026-10-14", title: "Saved easy bike", sport: "bike", durationMin: 9, completed: false },
  { date: "2026-10-14", title: "Saved swim", sport: "swim", durationMin: 23, completed: false },
] };

test("ordinary training questions retrieve saved planning context while check-in is missing", () => {
  for (const message of ["Show my training", "Explain my workout", "Where is my plan?", "I need guidance on today's workout", "My training doesn't load", "I can't see my workouts", "explin todays training for me pls", "explan todays workout"]) {
    const result = buildCoachReply(message, context);
    assert.equal(result.ruleId, "coach-conversation-v1:saved-training-navigation", message);
    assert.match(result.answer, /Saved easy bike: 9 min/);
    assert.match(result.answer, /Saved swim: 23 min/);
    assert.match(result.answer, /check-in is incomplete/);
    assert.match(result.answer, /not completed minutes or permission to train/);
    assert.match(result.answer, /\/training/);
    assert.doesNotMatch(result.answer, /Call Jasmel/);
  }
});

test("Spanish saved-plan navigation is localized without inventing clearance", () => {
  const result = buildCoachReply("¿Dónde está mi entrenamiento de hoy?", { ...context, language: "es" });
  assert.equal(result.ruleId, "coach-conversation-v1:saved-training-navigation");
  assert.match(result.answer, /sesiones guardadas/);
  assert.match(result.answer, /no minutos realizados ni autorización/);
});

test("no session today is distinct from an erased plan or recorded rest", () => {
  const result = buildCoachReply("Show my training", { ...context, savedTodaySessions: [] });
  assert.match(result.answer, /don't see a saved planned session for today/);
  assert.match(result.answer, /does not mean your cycle or history has been deleted/);
  assert.doesNotMatch(result.answer, /rest day|0 min/);
});

test("saved context excludes other dates and never substitutes actual minutes", () => {
  const result = savedTrainingReply("Show my workout", { ...context, savedTodaySessions: [
    { date: "2026-10-13", title: "Yesterday private detail", sport: "run", durationMin: 30, completed: true },
    { date: "2026-10-14", title: "Saved completed run", sport: "run", durationMin: 18, completed: true },
  ] })!;
  assert.doesNotMatch(result.answer, /Yesterday private detail/);
  assert.match(result.answer, /18 min \(marked completed\)/);
  assert.match(result.answer, /planned durations, not completed minutes/);
});

test("mutations, history, other days and examples retain their separate handlers", () => {
  for (const message of ["Change my workout to 10 minutes", "Show my workout tomorrow", "Explain my last workout", "Log my workout", 'The example says "show my workout"', "Show my training history"]) {
    assert.equal(savedTrainingReply(message, context), null, message);
  }
});

test("current and unresolved safety concerns continue to take precedence", () => {
  assert.equal(buildCoachReply("explin todays training; I have chest pain", context).ruleId, "coach-conversation-v1:urgent-symptoms");
  assert.equal(savedTrainingReply("explin todays training and change it to 60 minutes", context), null);
  assert.equal(buildCoachReply("Show my workout; I have chest pain", context).ruleId, "coach-conversation-v1:urgent-symptoms");
  assert.equal(buildCoachReply("Show my training", { ...context, checkin: { observedDate: context.localToday, newPain: true } }).ruleId, "coach-conversation-v1:illness-or-pain");
  assert.equal(buildCoachReply("Show my training", { ...context, unresolvedSafetyConcernAt: "2026-10-14T08:00:00Z" }).ruleId, "coach-conversation-v1:clarify-prior-safety");
});

test("metrics, personal progress and recovery retain their richer existing handlers", () => {
  for (const message of ["What is my training JStress?", "Show my training progress", "Explain my training and HRV readings", "Explain my workout recovery", "¿Cuál es mi progreso de entrenamiento?", "Muestra mi entrenamiento y recuperación"]) {
    assert.equal(savedTrainingReply(message, context), null, message);
  }
  assert.equal(buildCoachReply("What is my training JStress?", context).ruleId, "coach-conversation-v1:jmetrics-unknown");
});
