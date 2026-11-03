import test from "node:test";
import assert from "node:assert/strict";
import { cyclePlanningBasis } from "./cycle-planning-basis";
import { cycleActivityEvidence } from "./training-cycle";
import type { PlanningSetup } from "./planning-setup";

const setup={source:"athlete_reported",baselineWeeklyMinutes:300,baselineObservedAt:"2026-11-01"} as PlanningSetup;
const restricted=cycleActivityEvidence([{id:"synthetic-restricted",date:new Date("2026-11-02T10:00Z"),source:"strava",completed:true,planned:false,actualDurationMin:99,feedbackStatus:null,rpe:null}],"2026-11-02","America/New_York");

test("restricted history still blocks implicit, refused or invalid manual planning choices",()=>{
  for(const requested of [undefined,false,"true",1]) assert.throws(()=>cyclePlanningBasis(restricted,setup,requested,true));
  assert.throws(()=>cyclePlanningBasis(restricted,setup,true,false));
  assert.throws(()=>cyclePlanningBasis(restricted,{...setup,source:"coach_set"},true,true));
  assert.throws(()=>cyclePlanningBasis(restricted,{...setup,baselineWeeklyMinutes:null},true,true));
});

test("explicit baseline-only planning preserves restricted origin, unknown load and protected dates",()=>{
  const before=JSON.stringify(restricted);
  const result=cyclePlanningBasis(restricted,setup,true,true);
  assert.equal(result.basis,"athlete_reported_baseline");
  assert.equal(result.activity.reportedMinutes,null);
  assert.equal(result.activity.reportedSessions,null);
  assert.equal(result.activity.historyReview,true);
  assert.equal(result.activity.recoveryReview,true);
  assert.equal(result.activity.derivedActivityPolicy.status,"insufficient");
  assert.deepEqual(result.activity.protectedDays,["2026-11-02"]);
  assert.equal(JSON.stringify(restricted),before);
  assert.match(result.activity.note,/No capacity increase or execution approval/);
});

test("normal eligible activity planning keeps its existing evidence unchanged",()=>{
  const evidence=cycleActivityEvidence([],"2026-11-02","America/New_York");
  assert.equal(cyclePlanningBasis(evidence,setup,false,true).activity,evidence);
});
