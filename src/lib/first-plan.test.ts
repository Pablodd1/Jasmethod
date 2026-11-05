import test from "node:test";
import assert from "node:assert/strict";
import { firstPlanDraft } from "./first-plan";
import { parsePlanningSetup, PLANNABLE_GOALS } from "./planning-setup";

const now=new Date("2026-11-03T12:00Z"),start="2026-11-03";
const setup=()=>parsePlanningSetup({adultConfirmed:true,profileConfirmed:true,goalDescription:"Sport-specific practice",baselineWeeklyMinutes:540,baselineObservedAt:start,interruptions:"none",restrictions:"none",qualifiedReview:"none_needed",trainingDays:[0,1,2,3,4,5,6],maxSessionMinutes:90,availableWeeklyMinutes:600,equipmentAccess:"Familiar equipment and supervised pool",planWeeks:12},now);
test("each selected supported sport has a first draft without a race, wearable or invented physiology",()=>{
  for(const goal of PLANNABLE_GOALS){
    const draft=firstPlanDraft({goal,birthYear:1990},null,start,"UTC",[],[],now)!;
    assert.ok(draft,goal);assert.equal(draft.kind,"observation");assert.ok(draft.totalMinutes<=60);
    assert.ok(draft.sessions.length);assert.doesNotMatch(JSON.stringify(draft),/"ftp":|"vo2max":|"runPaceBase":/);
    if(["triathlon","sprint","olympic","half","full"].includes(goal))assert.deepEqual(draft.sessions.map(s=>s.base.sport),["swim","bike","run"]);
    if(goal==="hyrox")assert.ok(draft.sessions.every(s=>s.base.sport==="mobility"));
  }
  assert.equal(firstPlanDraft({goal:"unknown"},null,start,"UTC",[],[],now),null);
});
test("eligible athletes retain separately reported capacity rather than universal 60-minute observation",()=>{
  for(const goal of ["swim-only","cycle","run-only","triathlon","sprint","olympic","half","full","hyrox"]){
    const draft=firstPlanDraft({goal,birthYear:1990,experience:"advanced",weeklyHours:10},setup(),start,"UTC",[],[],now)!;
    assert.equal(draft.kind,"reported_capacity",goal);assert.ok(draft.totalMinutes>60,goal);
    assert.ok(draft.totalMinutes<=540,goal);
    for(const s of draft.sessions)assert.ok(s.base.durationMin<=90,goal);
    if(goal==="half"||goal==="triathlon")for(const sport of ["swim","bike","run"])assert.ok(draft.sessions.some(s=>s.base.sport===sport),sport);
  }
});
test("availability cannot invent tolerated capacity; stale or restricted history remains explicit",()=>{
  const profile={goal:"cycle",birthYear:1990,experience:"advanced",weeklyHours:20};
  const noBaseline={...setup(),baselineWeeklyMinutes:null};
  assert.equal(firstPlanDraft(profile,noBaseline,start,"UTC",[],[],now)!.kind,"observation");
  const stale={...setup(),baselineObservedAt:"2026-09-01"};
  assert.equal(firstPlanDraft(profile,stale,start,"UTC",[],[],now)!.kind,"observation");
  const restricted:any=[{id:"restricted",date:new Date("2026-11-02"),source:"strava",completed:true,actualDurationMin:500,feedbackStatus:"completed",rpe:3}];
  const draft=firstPlanDraft(profile,setup(),start,"UTC",restricted,[],now)!;
  assert.equal(draft.kind,"observation");assert.equal(draft.totalMinutes,0);assert.equal(draft.activity.reportedMinutes,null);
});
test("existing work, races, illness and explicit zero availability are never overwritten with training",()=>{
  const records:any=[{id:"actual",date:new Date(`${start}T12:00Z`),source:"manual",planned:false,completed:true,actualDurationMin:30,feedbackStatus:"completed",rpe:3}];
  const events=[{dateKey:"2026-11-05",priority:1 as const}];
  const draft=firstPlanDraft({goal:"run-only",birthYear:1990},null,start,"UTC",records,events,now)!;
  assert.ok(draft.sessions.every(s=>![0,2].includes(s.slot)));
  for(const profile of [{goal:"run-only",birthYear:1990,injured:true},{goal:"run-only",birthYear:1990,weeklyHours:0}]){
    assert.equal(firstPlanDraft(profile,null,start,"UTC",[],[],now)!.totalMinutes,0);
  }
});
