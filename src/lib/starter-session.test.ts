import test from "node:test";
import assert from "node:assert/strict";
import { starterSession, isStarterSession, starterRestriction } from "./starter-session";
import { effectiveSessionFromRecords } from "./effective-prescription";
import { prescribeToday } from "./adaptive";
import { deviceMetricSnapshot } from "./device-metric-snapshot";
import { onboardingObservations } from "./onboarding-imports";
const now=new Date("2026-10-12T12:00:00Z"), date=new Date("2026-10-12T00:00:00Z");
const answers={sleep:3,soreness:3,motivation:3,energy:3,stress:3,sick:false,newPain:false,urgentSymptoms:false,availableMin:20};
const adaptation={verdict:"full",durationFactor:1,intensityCap:"z1"};
function records() {
 const base=starterSession("run-only");
 return {userId:"athlete",timezone:"UTC",now,profile:null,planning:{ready:false,missing:["Optional context"],review:[],ruleId:"fixture"},
   workout:{...base,id:"starter",userId:"athlete",date,source:"starter",originalPlan:JSON.stringify(base),prescription:JSON.stringify(prescribeToday({session:base,adaptation}))},
   checkin:{date,answers:JSON.stringify(answers),adaptation:JSON.stringify(adaptation)}};
}
test("day-zero sport suggestions never invent numeric athlete anchors or loaded HYROX work",()=>{
 for(const [goal,sport] of [["cycle","bike"],["swim-only","swim"],["hyrox","mobility"],["sprint","run"],[null,"mobility"]]) {
   const base=starterSession(goal);assert.equal(base.sport,sport);assert.equal(base.durationMin,20);assert.equal(base.intensity,"z1");
   assert.equal(isStarterSession({source:"starter",originalPlan:JSON.stringify(base)}),true);
 }
 assert.equal(starterSession(null,"bike").sport,"bike");
 assert.equal(starterRestriction({injured:true},null),true);
 assert.equal(starterRestriction({birthYear:2015},null,now),true);
});
test("incomplete profile permits only a bounded starter after current check-in; missing safety, symptoms and events still hold",()=>{
 const input=records();const ready=effectiveSessionFromRecords(input).canonical;
 assert.equal(ready.verdict,"ready");assert.equal(ready.durationMin,20);assert.ok(ready.steps.every(s=>s.zone==="z1"));
 for(const changed of [
   {...input,checkin:null},
   {...input,checkin:{...input.checkin,answers:JSON.stringify({...answers,sick:true})}},
   {...input,currentEvents:[{id:"race",userId:"athlete",date}]},
   {...input,workout:{...input.workout,source:"manual"}},
   {...input,workout:{...input.workout,originalPlan:JSON.stringify({...starterSession("run-only"),durationMin:60})}},
 ]) assert.notEqual(effectiveSessionFromRecords(changed).canonical.verdict,"ready");
 const limited={...input,checkin:{...input.checkin,answers:JSON.stringify({...answers,availableMin:10})}};
 assert.notEqual(effectiveSessionFromRecords(limited).canonical.verdict,"ready","a read must not silently truncate authoritative steps");
});
test("usable device and uploaded values reach onboarding with separate HRV methods; invalid readings never become quality-ok",()=>{
 const good=deviceMetricSnapshot("athlete",date,"whoop",{hrv:44,restingHr:52,sleepHours:7.5},"uploaded_file",now);
 assert.equal(good.observations.length,3);
 assert.equal(onboardingObservations(good.observations.map((o,i)=>({...o,id:String(i)})),now).length,3);
 const sdnn=deviceMetricSnapshot("athlete",date,"apple",{hrv:55,hrvType:"sdnn"},"uploaded_file",now);
 assert.equal(sdnn.observations[0].metricType,"hrv_sdnn");assert.equal(sdnn.data.hrvType,"sdnn");
 const bad=deviceMetricSnapshot("athlete",date,"oura",{hrv:NaN,restingHr:500,sleepHours:25,recoveryScore:101},"device_sync",now);
 assert.equal(bad.observations.length,0);assert.equal(bad.data.hrv,undefined);
 assert.equal(deviceMetricSnapshot("athlete",new Date("2026-10-13"),"oura",{hrv:55},"device_sync",now).observations.length,0);
});
