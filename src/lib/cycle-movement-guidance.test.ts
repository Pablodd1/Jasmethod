import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CYCLE_MOVEMENT_GUIDANCE, trustedCycleMovementGuidance } from "./cycle-movement-guidance";
import { prescribeToday } from "./adaptive";
import { canonicalSession } from "./canonical-session";
import { calendarDescription, telegramPlan } from "./plan-formats";
import { manualWorkoutCalendarDescription, manualWorkoutEmailContent } from "./manual-workout-email-content";
import { stepsText } from "./prescription";
const workout={id:"fixture",sport:"strength",title:"Station: Sled Push + Pull",type:"strength",intensity:"z2",durationMin:20,cycleVersion:"bounded-cycle-v1"};
const prescription=prescribeToday({session:workout,adaptation:{verdict:"full",durationFactor:1,intensityCap:"z2"}});
const canonical=canonicalSession({athleteId:"athlete",workout,prescription,dateLocal:"2026-10-12",timezone:"UTC"});
test("trusted movement restrictions survive daily prescription, preview and compact summaries",()=>{
  assert.match(prescription.detail.main,/skip the loaded work and ask for review/);
  assert.equal(trustedCycleMovementGuidance(prescription.steps.find(s=>s.phase==="active")!),CYCLE_MOVEMENT_GUIDANCE);
  assert.match(readFileSync("src/app/training/page.tsx","utf8"),/trustedCycleMovementGuidance\(step, es \? "es" : "en"\)/);
  const session={...workout,steps:prescription.steps};
  for(const text of [stepsText(prescription.steps),calendarDescription(session),telegramPlan("Fixture","Monday",[session])]) {
    assert.match(text,/only familiar coach-reviewed/);assert.match(text,/skip the loaded work/);assert.match(text,/No fixed load, repetitions/);
  }
});
test("manual email and ICS description preserve authored restrictions in English and Spanish",()=>{
  for(const language of ["en","es"] as const){
    const expected=language==="es"?/omite el trabajo con carga y pide una revisión/:/skip the loaded work and ask for review/;
    assert.match(manualWorkoutEmailContent(canonical,null,null,false,language).plan.steps.join(" "),expected);
    assert.match(manualWorkoutCalendarDescription(canonical,null,null,language),expected);
  }
});
test("arbitrary private notes and modified templates cannot enter export through the safety allowlist",()=>{
  for(const note of ["PRIVATE_HEALTH_NOTE",CYCLE_MOVEMENT_GUIDANCE+" PRIVATE_HEALTH_NOTE","PRIVATE_HEALTH_NOTE "+CYCLE_MOVEMENT_GUIDANCE]){
    const steps=prescription.steps.map(step=>({...step,note}));
    assert.equal(trustedCycleMovementGuidance(steps[1]),"");
    const session=canonicalSession({athleteId:"athlete",workout,prescription:{...prescription,steps},dateLocal:"2026-10-12",timezone:"UTC"});
    for(const language of ["en","es"] as const){
      assert.doesNotMatch(JSON.stringify(manualWorkoutEmailContent(session,null,null,false,language)),/PRIVATE_HEALTH_NOTE/);
      assert.doesNotMatch(manualWorkoutCalendarDescription(session,null,null,language),/PRIVATE_HEALTH_NOTE/);
    }
    assert.doesNotMatch(calendarDescription({...workout,steps}),/PRIVATE_HEALTH_NOTE/);
    assert.doesNotMatch(stepsText(steps),/PRIVATE_HEALTH_NOTE/);
  }
});
