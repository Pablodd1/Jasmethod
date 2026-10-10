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
  assert.equal(dailyRecoveryContext({ ...rest, plannedRest: false, sessions: [{ durationMin: 0, verdict: "rest" }] }).mode, "hold");
});

test("protected event day is neither planned rest nor optional extra movement; symptoms still win",()=>{
  const event=dailyRecoveryContext({...rest,eventDay:true});
  assert.equal(dailyRecoveryContext({...rest,eventDay:true,sessions:[{durationMin:0,verdict:"blocked"}]}).mode,"event-day");
  assert.equal(event.mode,"event-day");assert.equal(event.allowMovement,false);assert.equal(event.optionalMovementMinutes,null);
  assert.equal(dailyRecoveryContext({...rest,eventDay:true,answers:{...answers,urgentSymptoms:true}}).mode,"hold");
});
