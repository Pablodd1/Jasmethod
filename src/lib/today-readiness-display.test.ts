import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildDailyInputContext } from "./daily-input-context";
import { resolveCheckinSafety } from "./checkin-safety";
import { DailyReadinessPath, hasCurrentHealthReadings } from "../components/daily-training/DailyReadinessPath";
import { sportConsistentTitle } from "./session-purpose-title";
import { canonicalSession } from "./canonical-session";
import { updateWorkout, workoutRevision } from "./workout-update";
import { UniversalWorkoutCard } from "../components/daily-training/UniversalWorkoutCard";
import { universalWorkoutExample } from "./universal-workout-example";
import { DailyRecoveryCard, type DailyRecoveryView } from "../components/daily-recovery-card";

const now = new Date("2026-10-30T12:00:00Z");
const observation = (source="whoop",value=7.5,observedAt=now) => ({id:source,userId:"owner",metricType:"sleep_hours",value,unit:"h",source,observedAt,qualityFlag:"ok",measurementMethod:"device_sync"});
test("Planned view suppresses only a duplicate unanswered check-in demand, not actual holds or offline warnings",()=>{
 const recovery:DailyRecoveryView={mode:"checkin-needed",safetyStatus:"unknown",allowMovement:false,recoveryNeedsReview:false,noAdditionalTraining:true,optionalMovementMinutes:null};
 const render=(patch:Partial<DailyRecoveryView>={},offline=false)=>renderToStaticMarkup(React.createElement(DailyRecoveryCard,{recovery:{...recovery,...patch},plannedView:true,offline}));
 assert.equal(render(),"");assert.match(render({},true),/Reconnect/);
 assert.match(render({mode:"hold",safetyStatus:"hold"}),/training on hold/);
 assert.match(render({mode:"hold",safetyStatus:"urgent"}),/training on hold/);
});
test("Automatic planned view requires current usable sleep, resting HR and one HRV method; it grants no readiness",()=>{
 const observations=[observation(),{...observation(),id:"rhr",metricType:"resting_hr",value:52,unit:"bpm"},{...observation(),id:"hrv",metricType:"hrv_sdnn",value:80,unit:"ms"}];
 const context=buildDailyInputContext({athleteId:"owner",timezone:"UTC",now,observations});
 assert.equal(hasCurrentHealthReadings(context,"2026-10-30"),true);
 assert.equal(hasCurrentHealthReadings(context,"2026-10-31"),false);
 for(const removed of observations){const incomplete=buildDailyInputContext({athleteId:"owner",timezone:"UTC",now,observations:observations.filter(row=>row.id!==removed.id)});assert.equal(hasCurrentHealthReadings(incomplete,"2026-10-30"),false);}
 assert.equal(hasCurrentHealthReadings({...context,readStatus:"unavailable"},"2026-10-30"),false);
 assert.equal(hasCurrentHealthReadings({...context,bounded:{...context.bounded,observationsTruncated:true}},"2026-10-30"),false);
 assert.equal(resolveCheckinSafety(null).status,"unknown");
});
function markup(observations:ReturnType<typeof observation>[], options:{es?:boolean;offline?:boolean;skipped?:boolean;mode?:string}={}) {
 const context=buildDailyInputContext({athleteId:"owner",timezone:"UTC",now,observations});
 return renderToStaticMarkup(React.createElement(DailyReadinessPath,{es:false,date:"2026-10-30",offline:false,hasSession:true,mode:"checkin-needed",context,onSkip:()=>{},...options}));
}
test("Today identifies current health sources first without treating sync as symptom answers",()=>{
 const html=markup([observation()]);
 assert.match(html,/WHOOP · 1 current measurements/);assert.ok(html.indexOf("Health data")<html.indexOf(">Your week</summary>"));
 assert.match(html,/Daily adaptation not reviewed/);assert.doesNotMatch(html,/Device or optional app test|Your answers are still needed/);
 assert.equal(resolveCheckinSafety(null).status,"unknown");
 for(const options of [{offline:true},{},{skipped:true}])assert.doesNotMatch(markup([observation("oura",7,new Date("2026-10-29T10:00Z"))],options),/Oura · 1 current/);
 assert.doesNotMatch(markup([observation("oura",7),observation("whoop",9)]),/current measurements/);
 assert.match(markup([observation("apple_health")]),/Apple Health/);
});
test("Skipped view is explicit and does not hide an actual illness or injury hold",()=>{
 assert.match(markup([],{skipped:true}),/Showing the planned workout/);
 assert.doesNotMatch(markup([],{skipped:true}),/>Skip for now</);
 const held=markup([observation()],{mode:"hold"});assert.match(held,/Training held for review/);assert.doesNotMatch(held,/>Skip for now</);
 assert.equal(resolveCheckinSafety({newPain:true}).status,"hold");
 for(const mode of ["planned-rest","event-day"]){assert.doesNotMatch(markup([],{mode}),/>Skip for now</);assert.doesNotMatch(markup([],{mode,skipped:true}),/Showing the planned workout/);}
});
test("Sport edits cannot retain another sport's generated headline or reconstruct steps",async()=>{
 assert.equal(sportConsistentTitle("Run: Easy + Strides","swim"),"Swim session");
 assert.equal(sportConsistentTitle("My race preparation","swim"),"My race preparation");
 const athlete={id:"owner",timezone:"UTC"};let current:any={id:"session",userId:"owner",planned:true,completed:false,date:new Date(),sport:"run",title:"Run: Easy + Strides",durationMin:30,intensity:"z2",type:"endurance",approved:true,prescription:null,planDay:null};
 const tx:any={workout:{findFirst:async()=>current,update:async({data}:any)=>(current={...current,...data})},auditLog:{create:async()=>({})}};
 await updateWorkout(athlete.id,athlete,{sessionId:current.id,sport:"swim",expectedRevision:workoutRevision(current)},tx);
 assert.equal(current.title,"Swim session");assert.equal(current.approved,false);assert.equal(current.prescription,null);
 const legacy=canonicalSession({athleteId:athlete.id,timezone:"UTC",dateLocal:"2026-10-30",workout:{...current,title:"Run: Easy + Strides",originalPlan:null},prescription:null});
 assert.equal(legacy.title,"Swim session");assert.equal(legacy.verdict,"blocked");assert.deepEqual(legacy.steps,[]);
});

test("compact rest cards keep their reason without a misleading missing-steps preview",()=>{
 const card=universalWorkoutExample();card.session.verdict="rest";card.session.reason="Rest day has no workout to export.";
 const previous=(globalThis as any).React;(globalThis as any).React=React;
 let html:string;try{html=renderToStaticMarkup(React.createElement(UniversalWorkoutCard,{card,compactReadiness:true,heldPreview:React.createElement("p",null,"MISSING_STEPS_CANARY")}));}finally{(globalThis as any).React=previous;}
 assert.match(html,/Rest day has no workout to export/);assert.doesNotMatch(html,/MISSING_STEPS_CANARY|Review today&#x27;s check-in/);
});
