import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyInputContext, type DailyInputObservation } from "./daily-input-context";
import { deviceCheckinEvidence, verifiedDeviceReview, deviceReviewRequiresManual } from "./device-checkin";
import { adaptSession } from "./adaptive";
import { dailyRecoveryContext } from "./daily-recovery";
import { effectiveSessionFromRecords } from "./effective-prescription";

const now = new Date("2026-11-02T12:00:00Z");
const observations: DailyInputObservation[] = [
  ["sleep_hours", 7.5, "h"], ["resting_hr", 52, "bpm"], ["hrv_rmssd", 60, "ms"],
].map(([metricType,value,unit],i) => ({id:String(i),userId:"owner",metricType:String(metricType),value:Number(value),unit:String(unit),source:"whoop",measurementMethod:"device_sync",qualityFlag:"ok",observedAt:new Date("2026-11-02T10:00:00Z")}));
const context = (rows = observations) => buildDailyInputContext({athleteId:"owner",timezone:"America/New_York",now,observations:rows});
const answers = {sick:false,newPain:false,urgentSymptoms:false,availableMin:60};
test("fresh owner-scoped typed measurements permit a short review without invented ratings",()=>{
  const c=context(), evidence=deviceCheckinEvidence(c,"owner",now)!;
  assert.ok(evidence); assert.equal(evidence.source,"whoop");
  const saved={...answers,inputMetadata:{recordedAt:now.toISOString(),deviceReview:{...evidence,athleteId:"owner",recoveryUnchanged:true}}};
  assert.equal(verifiedDeviceReview(saved,c,"owner",now),true);
  const adaptation=adaptSession(answers,true);
  assert.equal(adaptation.safetyStatus,"clear"); assert.equal(adaptation.scoreAvailable,false);
  assert.equal(adaptation.durationFactor,1); assert.equal(adaptation.missingFields?.length,5);
  assert.equal(adaptSession(answers).safetyStatus,"unknown");
  assert.equal(verifiedDeviceReview(saved,c,"other",now),false);
  assert.equal(deviceCheckinEvidence(c,"other",now),null);
  assert.equal(verifiedDeviceReview(saved,c,"owner",new Date("2026-11-03T12:00:00Z")),false);
  assert.equal(verifiedDeviceReview({...saved,inputMetadata:{...saved.inputMetadata,deviceReview:{...saved.inputMetadata.deviceReview,revision:"forged"}}},c,"owner",now),false);
});
test("device contact, incomplete/stale/conflicting/unknown/estimated/mixed readings do not enable the shortcut",()=>{
  for (const rows of [[],observations.slice(1),observations.map(r=>({...r,source:"strava"})),observations.map(r=>({...r,source:"unknown"})),observations.map(r=>({...r,measurementMethod:"estimated"})),observations.map(r=>({...r,observedAt:new Date("2026-11-01T10:00Z")})),observations.map((r,i)=>({...r,source:i===0?"oura":"whoop"})),[...observations,{...observations[0],id:"conflict",value:5,source:"oura"}]]) assert.equal(deviceCheckinEvidence(context(rows),"owner",now),null);
  const c=context();c.bounded.observationsTruncated=true;
  assert.equal(deviceCheckinEvidence(c,"owner",now),null);
  const changed=context();changed.activity.requiresReconciliation=true;
  assert.equal(deviceCheckinEvidence(changed,"owner",now),null);
});
test("evidence revision changes with corrected readings or newly reported activity",()=>{
  const initial=deviceCheckinEvidence(context(),"owner",now)!;
  assert.notEqual(deviceCheckinEvidence(context(observations.map((r,i)=>({...r,value:i===0?6:r.value}))),"owner",now)?.revision,initial.revision);
  const c=context();c.activity.rawRecordCount=1;
  assert.notEqual(deviceCheckinEvidence(c,"owner",now)?.revision,initial.revision);
});
test("device evidence cannot answer symptoms/time or erase earlier restrictions",()=>{
  for (const key of ["sick","newPain","urgentSymptoms"] as const) assert.notEqual(adaptSession({...answers,[key]:true},true).safetyStatus,"clear");
  assert.equal(adaptSession({...answers,availableMin:undefined},true).safetyStatus,"unknown");
  assert.equal(adaptSession({...answers,urgentSymptoms:undefined},true).safetyStatus,"unknown");
  assert.equal(deviceReviewRequiresManual({...answers,soreness:5}),true);
  assert.equal(deviceReviewRequiresManual(answers,{safetyStatus:"clear",verdict:"trim",durationFactor:.85}),true);
  assert.equal(deviceReviewRequiresManual(answers,null,90),true);
  assert.equal(deviceReviewRequiresManual(answers,null,45),false);
});
test("Today recognizes only canonically ready device reviews and preserves holds",()=>{
  const base={plannedRest:false,answers,sessions:[{id:"session",durationMin:45,intensity:"z2",verdict:"ready"}]};
  assert.equal(dailyRecoveryContext(base).mode,"checkin-needed");
  assert.equal(dailyRecoveryContext({...base,deviceReviewVerified:true}).mode,"training");
  assert.notEqual(dailyRecoveryContext({...base,deviceReviewVerified:true,sessions:[{...base.sessions[0],verdict:"blocked"}]}).mode,"training");
  assert.equal(dailyRecoveryContext({...base,deviceReviewVerified:true,answers:{...answers,newPain:true}}).mode,"hold");
});
test("shared workout read/export resolution rechecks device evidence rather than trusting saved metadata",()=>{
  const c=context(), evidence=deviceCheckinEvidence(c,"owner",now)!;
  const date=new Date("2026-11-02T05:00:00Z");
  const workout={id:"session",userId:"owner",date,planned:true,completed:false,approved:false,sport:"bike",type:"endurance",intensity:"z2",title:"Easy ride",durationMin:30,
    prescription:JSON.stringify({sport:"bike",verdict:"full",durationMin:30,steps:[{name:"Easy",zone:"z2",phase:"active",seconds:1800,target:{type:"open"}}]})};
  const saved={...answers,inputMetadata:{recordedAt:now.toISOString(),deviceReview:{...evidence,athleteId:"owner",recoveryUnchanged:true}}};
  const input={userId:"owner",timezone:"America/New_York",now,workout,profile:{ftp:200},checkin:{date,answers:JSON.stringify(saved),adaptation:JSON.stringify(adaptSession(answers,true))},
    planning:{ready:true,missing:[],review:[],ruleId:"fixture"},maxDailyMinutes:60,currentPrescription:true,sameDaySessions:[workout],deviceContext:c};
  assert.equal(effectiveSessionFromRecords(input).canonical.verdict,"ready");
  assert.equal(effectiveSessionFromRecords({...input,deviceContext:null}).canonical.verdict,"blocked");
  assert.equal(effectiveSessionFromRecords({...input,deviceContext:context(observations.slice(1))}).canonical.verdict,"blocked");
  assert.equal(effectiveSessionFromRecords({...input,profile:{...input.profile,injured:true}}).canonical.verdict,"rest");
});
