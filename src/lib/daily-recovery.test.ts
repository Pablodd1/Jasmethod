import test from "node:test";
import assert from "node:assert/strict";
import { dailyRecoveryContext } from "./daily-recovery";
const answers = { sleep: 4, soreness: 1, energy: 4, stress: 1, motivation: 4, sick: false, newPain: false, urgentSymptoms: false, availableMin: 20 };
const rest = { plannedRest: true, sessions: [], answers };
test("optional recovery movement needs a planned rest day, current answers and enough time", () => {
  assert.equal(dailyRecoveryContext(rest).optionalMovementMinutes, 20);
  assert.equal(dailyRecoveryContext({ ...rest, performedToday: true }).allowMovement, false);
  assert.equal(dailyRecoveryContext({ ...rest, sessions: [{ durationMin: 40, intensity: "z2" }] }).allowMovement, false);
  assert.equal(dailyRecoveryContext({ ...rest, answers: null }).allowMovement, false);
  assert.equal(dailyRecoveryContext({ ...rest, answers: { ...answers, availableMin: 10 } }).allowMovement, false);
  assert.equal(dailyRecoveryContext({ ...rest, plannedRest: false }).allowMovement, false);
  assert.equal(dailyRecoveryContext({ ...rest, plannedRest: false, sessions: [{ durationMin: 20, intensity: "z1" }] }).allowMovement, false);
});
test("illness, injury, safety holds and poor recovery override optional movement", () => {
  for (const extra of [{ injured: true }, { answers: { ...answers, sick: true } }, { answers: { ...answers, newPain: true } }, { answers: { ...answers, urgentSymptoms: true } }, { answers: { ...answers, sleep: 1 } }, { answers: { ...answers, stress: 5 } }, { answers: { ...answers, soreness: 5 } }, { answers: { ...answers, energy: 1 } }, { sessions: [{ durationMin: 0, verdict: "blocked" }] }]) {
    assert.equal(dailyRecoveryContext({ ...rest, ...extra }).allowMovement, false);
  }
  assert.equal(dailyRecoveryContext({ ...rest, plannedRest: false, sessions: [{ durationMin: 0, verdict: "rest" }] }).mode, "review-needed");
});

test("protected event day is neither planned rest nor optional extra movement; symptoms still win",()=>{
  const event=dailyRecoveryContext({...rest,eventDay:true});
  assert.equal(dailyRecoveryContext({...rest,eventDay:true,sessions:[{durationMin:0,verdict:"blocked"}]}).mode,"event-day");
  assert.equal(event.mode,"event-day");assert.equal(event.allowMovement,false);assert.equal(event.optionalMovementMinutes,null);
  assert.equal(dailyRecoveryContext({...rest,eventDay:true,answers:{...answers,urgentSymptoms:true}}).mode,"hold");
});

test("missing check-in does not convert a saved workout or an empty schedule into illness or rest", () => {
  for (const sessions of [[], [{ durationMin: 0, verdict: "blocked" }], [{ durationMin: 9, intensity: "z1", verdict: "blocked" }]]) {
    const result = dailyRecoveryContext({ plannedRest: false, sessions, answers: null });
    assert.equal(result.mode, "checkin-needed"); assert.equal(result.safetyStatus, "unknown");
    assert.equal(result.allowMovement, false); assert.equal(result.optionalMovementMinutes, null);
  }
  const partial = dailyRecoveryContext({ plannedRest: false, sessions: [{ durationMin: 0, verdict: "blocked" }], answers: { sleep: 4 } });
  assert.equal(partial.mode, "checkin-needed");
});

test("reported illness, injury and urgent symptoms still hold training even when other answers are missing", () => {
  for (const extra of [{ injured: true }, { answers: { sick: true } }, { answers: { newPain: true } }, { answers: { urgentSymptoms: true } }]) {
    const result = dailyRecoveryContext({ plannedRest: false, sessions: [{ durationMin: 9, verdict: "blocked" }], answers: null, ...extra });
    assert.equal(result.mode, "hold"); assert.equal(result.allowMovement, false);
  }
  assert.equal(dailyRecoveryContext({ ...rest, answers: null }).mode, "planned-rest");
  assert.equal(dailyRecoveryContext({ ...rest, eventDay: true, answers: null }).mode, "event-day");
});

test("clear answers with a canonical block after new feedback require review, not a medical hold or rest claim", () => {
  for (const verdict of ["blocked", "rest"]) {
    const result = dailyRecoveryContext({ plannedRest: false, sessions: [{ durationMin: 0, verdict }], performedToday: true, answers });
    assert.equal(result.mode, "review-needed"); assert.equal(result.safetyStatus, "clear");
    assert.equal(result.allowMovement, false); assert.equal(result.optionalMovementMinutes, null);
  }
  assert.equal(dailyRecoveryContext({ plannedRest: false, sessions: [{ durationMin: 0, verdict: "blocked" }], answers: { ...answers, sick: true } }).mode, "hold");
});
