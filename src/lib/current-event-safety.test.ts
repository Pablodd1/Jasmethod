import test from "node:test";
import assert from "node:assert/strict";
import { effectiveSessionFromRecords } from "./effective-prescription";
import { localDate } from "./dates";
const now=new Date("2026-11-01T17:00:00Z"), timezone="America/New_York", date=localDate("2026-11-01",timezone);
const workout={id:"workout",userId:"athlete",sport:"bike",title:"Easy ride",intensity:"z2",type:"endurance",date,durationMin:1,prescription:JSON.stringify({sport:"bike",durationMin:1,verdict:"full",steps:[{name:"Easy",seconds:60,zone:"z2",phase:"active"}]})};
const answers={sleep:5,soreness:1,motivation:5,energy:5,stress:1,sick:false,newPain:false,urgentSymptoms:false,availableMin:60};
const base={userId:"athlete",timezone,now,workout,profile:{ftp:200},planning:{ready:true,missing:[],review:[],ruleId:"fixture"},checkin:{date,answers:JSON.stringify(answers),adaptation:JSON.stringify({verdict:"full",intensityCap:"z7",durationFactor:1})}};
test("saved event added after planning blocks extra workout and changes canonical revision on stored UTC calendar day",()=>{
 const ready=effectiveSessionFromRecords(base);assert.equal(ready.canonical.verdict,"ready");
 const blocked=effectiveSessionFromRecords({...base,currentEvents:[{id:"event",userId:"athlete",date:new Date("2026-11-01T00:00:00Z")}]});
 assert.equal(blocked.canonical.verdict,"blocked");assert.equal(blocked.prescription.durationMin,0);assert.equal(blocked.canonical.steps.length,0);assert.notEqual(blocked.canonical.revision,ready.canonical.revision);assert.match(blocked.canonical.reason,/saved event/);
 assert.equal(effectiveSessionFromRecords({...base,currentEvents:[{id:"other",userId:"other-athlete",date:new Date("2026-11-01T00:00:00Z")}]}).canonical.verdict,"ready");
});
test("event guard does not replace urgent symptom guidance",()=>{
 const result=effectiveSessionFromRecords({...base,currentEvents:[{id:"event",userId:"athlete",date:new Date("2026-11-01T00:00:00Z")}],checkin:{...base.checkin,answers:JSON.stringify({...answers,urgentSymptoms:true})}});
 assert.match(result.canonical.reason,/Stop exercise|emergency/);assert.notEqual(result.canonical.verdict,"ready");
});
