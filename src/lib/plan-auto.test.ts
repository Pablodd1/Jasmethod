import { test } from "node:test";
import assert from "node:assert/strict";
import { starterPlanInputs } from "./plan-auto";
import { parsePlanningSetup, assessPlanningSetup } from "./planning-setup";
const now = new Date("2026-10-02T12:00:00Z");
const profile = { goal: "run-only", experience: "beginner", weeklyHours: 3, birthYear: 1990 };
const complete = () => parsePlanningSetup({adultConfirmed:true,profileConfirmed:true,goalDescription:"Run comfortably for general fitness",baselineWeeklyMinutes:120,baselineObservedAt:"2026-10-01",interruptions:"none",restrictions:"none",qualifiedReview:"none_needed",trainingDays:[1,3,6],maxSessionMinutes:45,equipmentAccess:"Shoes and outdoor path",planWeeks:4},now);
test("missing setup never invents Olympic goal, beginner experience, horizon or race",()=>{
 const input=starterPlanInputs(null); assert.equal(input.distance,null);assert.equal(input.level,null);assert.equal(input.weeks,null);assert.equal(input.hasRace,false);assert.equal(input.ready,false);
 assert.equal(starterPlanInputs({goal:"unrecognized"}).distance,null);
 assert.equal(starterPlanInputs({goal:"boxing"}).distance,"boxing");
});
test("adult manual setup with no devices, weight, HRV or benchmarks can become ready",()=>{
 const setup=complete();assert.deepEqual(assessPlanningSetup(profile,setup,now),{ready:true,missing:[],review:[],ruleId:"manual-setup-v1"});
 assert.equal(setup.source,"athlete_reported");assert.equal(setup.planWeeks,4);
});
test("missing goal, baseline, restrictions and time remain blocking unknowns",()=>{
 for(const patch of [{baselineWeeklyMinutes:null},{baselineObservedAt:null},{restrictions:"unknown" as const},{maxSessionMinutes:null},{adultConfirmed:false},{profileConfirmed:false},{trainingDays:[]}]) assert.equal(assessPlanningSetup(profile,{...complete(),...patch},now).ready,false);
 assert.equal(assessPlanningSetup({...profile,goal:null},complete(),now).ready,false);
});
test("stale history and safety context cannot silently progress; unsupported cases require review",()=>{
 assert.equal(assessPlanningSetup(profile,{...complete(),baselineObservedAt:"2026-08-01"},now).ready,false);
 assert.equal(assessPlanningSetup(profile,{...complete(),confirmedAt:"2026-09-01T00:00:00Z"},now).ready,false);
 for(const patch of [{interruptions:"yes" as const},{restrictions:"present" as const},{qualifiedReview:"required" as const}]) assert.ok(assessPlanningSetup(profile,{...complete(),...patch},now).review.length);
 assert.ok(assessPlanningSetup({...profile,birthYear:2015},complete(),now).review.length);
});
test("explicit future event date stays distinct from missing or past event",()=>{
 assert.equal(starterPlanInputs({...profile,raceDate:new Date(Date.now()+86400000)}).hasRace,true);
 assert.equal(starterPlanInputs({...profile,raceDate:new Date(0)}).hasRace,false);
});
test("invalid setup is rejected rather than normalized into a safe baseline",()=>{
 for(const patch of [{baselineWeeklyMinutes:-1},{maxSessionMinutes:NaN},{trainingDays:[9]},{baselineObservedAt:"2099-01-01"}]) assert.throws(()=>parsePlanningSetup({...complete(),...patch},now));
});
test("setup numeric answers reject boolean/array/object coercion",()=>{
 for(const key of ["baselineWeeklyMinutes","maxSessionMinutes","planWeeks"]) for(const value of [true,false,[60],[],{},"NaN","Infinity","1e2"]) assert.throws(()=>parsePlanningSetup({...complete(),[key]:value},now),`${key}: ${JSON.stringify(value)}`);
});
test("daily safety flow is not blocked by plan-replacement-only seven-day freshness",()=>{
 const setup={...complete(),confirmedAt:"2026-09-20T12:00:00Z"};
 assert.equal(assessPlanningSetup(profile,setup,now).ready,false);
 assert.equal(assessPlanningSetup(profile,setup,now,"daily").ready,true);
});
test("malformed saved setup and future confirmations fail closed",()=>{
 for(const patch of [{confirmedAt:"invalid"},{confirmedAt:"2099-01-01"},{trainingDays:null},{baselineWeeklyMinutes:true},{maxSessionMinutes:[45]}]) assert.equal(assessPlanningSetup(profile,{...complete(),...patch} as any,now).ready,false);
});
test("structured performance targets are goals only and require coaching review",()=>{
 const setup=parsePlanningSetup({...complete(),targetGoal:{metric:"power",sport:"bike",value:250,unit:"W",targetDate:"2026-12-01"}},now);
 assert.equal(setup.targetGoal?.kind,"goal_not_capacity");
 assert.equal(setup.targetGoal?.value,250);
 assert.ok(assessPlanningSetup(profile,setup,now).review.some(reason=>/not a benchmark/.test(reason)));
 const fitness=parsePlanningSetup({...complete(),targetGoal:{metric:"fitness",sport:"run"}},now);
 assert.equal(assessPlanningSetup(profile,fitness,now).ready,true);
 for(const targetGoal of [{metric:["fitness"],sport:"run"},{metric:"fitness",sport:["run"]},{metric:"fitness",sport:"run",targetDate:["2026-12-01"]},{metric:"power",sport:"bike",value:true,unit:"W"},{metric:"pace",sport:"run",value:[300],unit:"sec/km"},{metric:"pace",sport:"run",value:300,unit:"sec/100m"},{metric:"speed",sport:"run",value:999,unit:"km/h"},{metric:"completion",sport:"run",value:3,unit:"W"}]) assert.throws(()=>parsePlanningSetup({...complete(),targetGoal},now));
});
