import {test} from "node:test";
import assert from "node:assert/strict";
import {boundPlanWeeks} from "./planning-bounds";
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
 const bounded=boundPlanWeeks([first,next],setup,20,0);
 assert.equal(bounded.weeks[0].sessions.filter(s=>s.zone==="z4").length,1);
 assert.equal(bounded.weeks[1].sessions.filter(s=>s.zone==="z4").length,0);
});
