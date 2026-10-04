import {test} from "node:test";
import assert from "node:assert/strict";
import {boundPlanWeeks,levelRecoveryPolicy} from "./planning-bounds";
import {parsePlanningSetup} from "./planning-setup";
import type {GeneratedWeek,PlanSession} from "./science";
const session=(zone:"z2"|"z4"="z2"):PlanSession=>({sport:"run",title:"Run",minutes:60,zone,type:"endurance",description:"Run by effort"});
const week=(sessions:PlanSession[]):GeneratedWeek=>({week:1,theme:"Base",sessions,totalMinutes:sessions.length*60});
test("bounds never invent available days or make up missed work",()=>{
 const setup=parsePlanningSetup({trainingDays:[1,3],maxSessionMinutes:45,baselineWeeklyMinutes:80});
 const bounded=boundPlanWeeks([week(Array.from({length:7},()=>session()))],setup,10,0);
 assert.deepEqual(bounded.weeks[0].sessions.map(s=>s.daySlot),[1,3]);
 assert.ok(bounded.weeks[0].totalMinutes<=80);assert.ok(bounded.weeks[0].sessions.every(s=>s.minutes<=45));
});
test("hard sessions are not stacked on the same or adjacent days",()=>{
 const setup=parsePlanningSetup({trainingDays:[0,1,2,3,4,5,6],maxSessionMinutes:120,baselineWeeklyMinutes:800});
 const bounded=boundPlanWeeks([week(Array.from({length:14},()=>session("z4")))],setup,20,0);
 const slots=bounded.weeks[0].sessions.map(s=>s.daySlot);
 assert.equal(new Set(slots).size,slots.length);
 for(const a of slots) for(const b of slots) if(a!==b) assert.ok(Math.min(Math.abs(a-b),7-Math.abs(a-b))>1);
});

test("adjacent hard sessions are also blocked across different week templates",()=>{
 const setup=parsePlanningSetup({trainingDays:[0,1,2,3,4,5,6],maxSessionMinutes:120,baselineWeeklyMinutes:800});
 const first=week(Array.from({length:7},(_,i)=>session(i===6?"z4":"z2")));
 const next={...week([session("z4")]),week:2};
 const bounded=boundPlanWeeks([first,next],setup,20,0,"pro");
 assert.equal(bounded.weeks[0].sessions.filter(s=>s.zone==="z4").length,1);
 assert.equal(bounded.weeks[1].sessions.filter(s=>s.zone==="z4").length,0);
});

test("level recovery defaults limit new schedules without making professional training mandatory",()=>{
 const setup=parsePlanningSetup({trainingDays:[0,1,2,3,4,5,6],maxSessionMinutes:120,baselineWeeklyMinutes:800});
 for(const [level,rest] of [["beginner",2],["amateur",1],["intermediate",1],["advanced",1],["pro",0],["unknown",2],[undefined,2]] as const){
  assert.equal(levelRecoveryPolicy(level).minimumRestDays,rest);
  const result=boundPlanWeeks([week(Array.from({length:7},()=>session()))],setup,20,0,level).weeks[0];
  assert.equal(result.restDaySlots.length,rest);
  assert.equal(new Set(result.sessions.map(s=>s.daySlot)).size,7-rest);
  assert.equal(result.totalMinutes,(7-rest)*60);
 }
 const sparse=boundPlanWeeks([week([session(),session()])],setup,20,0,"pro").weeks[0];
 assert.equal(sparse.sessions.length,2);
 assert.equal(sparse.restDaySlots.length,5);
});

test("chosen unavailable days and template rest remain off without adding compulsory recovery",()=>{
 const setup=parsePlanningSetup({trainingDays:[1,3,5],maxSessionMinutes:90,baselineWeeklyMinutes:400});
 const raw=week(Array.from({length:7},()=>session()));
 const before=JSON.stringify(raw);
 for(const level of ["beginner","amateur","advanced","pro"]){
  const result=boundPlanWeeks([raw],setup,10,0,level).weeks[0];
  assert.deepEqual(result.sessions.map(s=>s.daySlot),[1,3,5]);
  assert.deepEqual(result.restDaySlots,[0,2,4,6]);
 }
 assert.equal(JSON.stringify(raw),before,"Bounding must not mutate the source plan");
 const all=parsePlanningSetup({trainingDays:[0,1,2,3,4,5,6],maxSessionMinutes:90,baselineWeeklyMinutes:400});
 const rest:PlanSession={sport:"recovery",title:"Rest or walk",minutes:20,zone:"z1",type:"recovery",description:"Optional walking"};
 const result=boundPlanWeeks([week([session(),rest,session()])],all,10,0,"pro").weeks[0];
 assert.deepEqual(result.sessions.map(s=>s.daySlot),[0,2]);
 assert.ok(result.restDaySlots.includes(1));
 assert.equal(result.totalMinutes,120);
});

test("default rest placement preserves explicit race and baseline-test purpose before ordinary sessions",()=>{
 const setup=parsePlanningSetup({trainingDays:[0,1,2,3,4,5,6],maxSessionMinutes:120,baselineWeeklyMinutes:800});
 const sessions=Array.from({length:7},()=>session());
 sessions[6]={...session(),type:"race",title:"Event"};
 sessions[2]={...session(),type:"test",title:"Baseline assessment"};
 const result=boundPlanWeeks([week(sessions)],setup,20,0,"beginner").weeks[0];
 assert.equal(result.restDaySlots.length,2);
 assert.ok(result.sessions.some(s=>s.daySlot===6&&s.type==="race"));
 assert.ok(result.sessions.some(s=>s.daySlot===2&&s.type==="test"));
});

test("race priority never invents availability or relocates an unavailable event",()=>{
 const setup=parsePlanningSetup({trainingDays:[1,3],maxSessionMinutes:120,baselineWeeklyMinutes:400});
 const sessions=Array.from({length:7},()=>session());
 sessions[6]={...session(),type:"race",title:"Unavailable event date"};
 const result=boundPlanWeeks([week(sessions)],setup,20,0,"pro").weeks[0];
 assert.deepEqual(result.sessions.map(s=>s.daySlot),[1,3]);
 assert.ok(result.sessions.every(s=>s.type!=="race"));
 assert.ok(result.restDaySlots.includes(6));
});
