import {test} from "node:test";
import assert from "node:assert/strict";
import {effectiveSessionFromRecords} from "./effective-prescription";
import {localDate} from "./dates";
import {unitsOf} from "./units";
test("canonical workout cannot retain stale metric summaries beside current imperial step labels",()=>{
 const now=new Date("2026-10-12T12:00:00Z"),date=localDate("2026-10-12","UTC");
 const workout={id:"fixture",userId:"athlete",date,sport:"run",title:"Easy run",type:"endurance",intensity:"z2",durationMin:10,prescription:JSON.stringify({title:"Easy run",sport:"run",type:"endurance",intensity:"z2",verdict:"full",durationMin:10,targets:{pace:"6:00/km"},steps:[{name:"Easy",seconds:600,zone:"z2",phase:"active",target:{type:"pace",low:360,high:360}}]})};
 const result=effectiveSessionFromRecords({userId:"athlete",timezone:"UTC",now,workout,profile:{units:unitsOf("auto","en")},planning:{ready:true,missing:[],review:[],ruleId:"fixture"},checkin:{date,answers:JSON.stringify({sleep:5,soreness:1,motivation:5,energy:5,stress:1,sick:false,newPain:false,urgentSymptoms:false,availableMin:60}),adaptation:JSON.stringify({verdict:"full",durationFactor:1,intensityCap:"z7"})}});
 assert.equal(result.canonical.verdict,"ready");assert.match(result.canonical.steps[0].target.label,/9:39\/mi/);assert.deepEqual(result.prescription.targets,{});
});
