import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyInputContext, readDailyInputContext, applyDailyExecutionContext, type DailyInputObservation, type DailyInputWorkout, type DailyInputContextOptions } from "./daily-input-context";
import { adaptSession } from "./adaptive";
import { deviceMetricSnapshot } from "./device-metric-snapshot";
import { activityFingerprint, type ActivityDecision } from "./activity-evidence";

const now = new Date("2026-10-21T12:00:00Z");
const context = (extra: Partial<DailyInputContextOptions> = {}) => buildDailyInputContext({ athleteId:"owner",timezone:"America/New_York",now,...extra });
const observation = (extra: Partial<DailyInputObservation> = {}): DailyInputObservation => ({ id:"reading",userId:"owner",metricType:"sleep_hours",value:7.5,unit:"h",source:"oura",measurementMethod:"device_sync",qualityFlag:"ok",observedAt:new Date("2026-10-21T04:00Z"),createdAt:new Date("2026-10-21T11:00Z"),...extra });
const workout = (extra: Partial<DailyInputWorkout> = {}): DailyInputWorkout => ({ id:"activity",userId:"owner",date:new Date("2026-10-20T15:00Z"),createdAt:new Date("2026-10-21T11:00Z"),sport:"bike",source:"garmin",externalId:"garmin:synthetic",planned:false,completed:true,durationMin:45,actualDurationMin:45,distanceKm:20,...extra });
const full = () => adaptSession({ sleep:5,soreness:1,energy:5,motivation:5,stress:1,sick:false,newPain:false,urgentSymptoms:false,availableMin:90 });

test("fresh snapshot evidence exposes units/source/record times without inventing sensor precision or upstream provenance",()=>{
  const snapshot=deviceMetricSnapshot("owner",new Date("2026-10-21T04:00Z"),"oura",{sleepHours:7.5,hrv:44,restingHr:52},"device_sync",now);
  const observations=snapshot.observations.map((row,i)=>({...row,id:String(i),createdAt:new Date("2026-10-21T11:00Z")}));
  const value=context({observations});
  assert.equal(value.metrics.sleepHours.status,"usable");
  assert.equal(value.metrics.sleepHours.selected?.value,7.5);assert.equal(value.metrics.sleepHours.selected?.unit,"h");
  assert.equal(value.metrics.sleepHours.selected?.source,"oura");assert.equal(value.metrics.sleepHours.selected?.originalSource,null);
  assert.equal(value.metrics.sleepHours.selected?.observedAt,"2026-10-21T04:00:00.000Z");
  assert.equal(value.metrics.sleepHours.selected?.importedAt,"2026-10-21T11:00:00.000Z");
  assert.equal(value.metrics.sleepHours.selected?.measurementTimePrecision,"unknown");
  assert.equal(value.metrics.sleepHours.selected?.classification,"provider_reported");
  assert.equal(value.objectiveFields.sleepHours,false);assert.equal(value.objectiveFields.hrv,false);assert.equal(value.objectiveFields.restingHr,false);
  for(const question of ["sleepQuality","soreness","energy","stress","motivation","illness","newPain","urgentSymptoms","availableMinutes"] as const) assert.equal(value.questions[question],true);
  assert.equal(Object.hasOwn(value,"readinessScore"),false);assert.match(value.questions.reason,/duration is not sleep quality/i);
});
test("missing, stale, invalid and real zero remain distinct; source outages never turn missing values normal",()=>{
  assert.equal(context().metrics.sleepHours.status,"missing");assert.equal(context().metrics.sleepHours.selected,null);
  const stale=context({observations:[observation({observedAt:new Date("2026-10-20T04:00Z")})],connectors:[{provider:"oura",status:"error",lastSyncAt:now}]});
  assert.equal(stale.metrics.sleepHours.status,"stale");assert.equal(stale.metrics.sleepHours.selected,null);assert.equal(stale.objectiveFields.sleepHours,true);assert.equal(stale.sync[0].status,"failed");
  for(const extra of [{qualityFlag:null},{qualityFlag:"incomplete"},{qualityFlag:"suspect"},{unit:"min"},{value:25},{value:NaN}]) {
    const invalid=context({observations:[observation(extra)]});assert.equal(invalid.metrics.sleepHours.status,"invalid");assert.equal(invalid.metrics.sleepHours.selected,null);
  }
  const zero=context({observations:[observation({value:0}),observation({id:"hrv-zero",metricType:"hrv_rmssd",value:0,unit:"ms"})]});
  assert.equal(zero.metrics.sleepHours.selected?.value,0);assert.equal(zero.objectiveFields.sleepHours,false);assert.equal(zero.metrics.hrvRmssd.status,"invalid");
  assert.equal(context({observations:[observation({observedAt:new Date("2026-10-22T04:00Z")})]}).metrics.sleepHours.selected,null);
});
test("conflicting current providers require review without averaging; a same-source correction uses the latest created record",()=>{
  const conflict=context({observations:[observation(),observation({id:"other",source:"whoop",value:6})]});
  assert.equal(conflict.metrics.sleepHours.status,"conflicting");assert.equal(conflict.metrics.sleepHours.selected,null);assert.equal(conflict.metrics.sleepHours.conflicts.length,2);assert.equal(conflict.objectiveFields.sleepHours,true);
  const corrected=context({observations:[observation(),observation({id:"corrected",value:8,createdAt:new Date("2026-10-21T11:30Z")})]});
  assert.equal(corrected.metrics.sleepHours.status,"usable");assert.equal(corrected.metrics.sleepHours.selected?.value,8);
  const agreed=context({observations:[observation(),observation({id:"whoop",source:"whoop",value:7.5})]});assert.equal(agreed.metrics.sleepHours.status,"usable");assert.equal(agreed.metrics.sleepHours.selected?.value,7.5);
});
test("RMSSD and SDNN remain separate and sleep scores never answer subjective sleep quality",()=>{
  const value=context({observations:[observation({metricType:"hrv_rmssd",value:44,unit:"ms"}),observation({id:"sdnn",metricType:"hrv_sdnn",value:90,unit:"ms",source:"apple"}),observation({id:"score",metricType:"sleep_score",value:99,unit:"score"})]});
  assert.equal(value.metrics.hrvRmssd.selected?.value,44);assert.equal(value.metrics.hrvSdnn.selected?.value,90);
  assert.equal(value.metrics.hrvRmssd.conflicts.length,0);assert.equal(value.metrics.sleepHours.status,"missing");assert.equal(value.questions.sleepQuality,true);
});
test("restricted and unknown measured metrics remain raw history without becoming usable coaching values or suppressing questions",()=>{
  for(const origin of [{source:"strava"},{source:"unknown-importer"},{source:"intervals"},{source:"oura",originalSource:"STRAVA"}]) {
    const value=context({observations:[observation({...origin,measurementMethod:"optical_sensor"}),observation({id:"hrv",metricType:"hrv_rmssd",value:44,unit:"ms",...origin,measurementMethod:"chest_strap"}),observation({id:"rhr",metricType:"resting_hr",value:52,unit:"bpm",...origin,measurementMethod:"optical_sensor"})]});
    for(const key of ["sleepHours","hrvRmssd","restingHr"] as const){const metric=value.metrics[key];assert.equal(metric.status,"invalid");assert.equal(metric.selected,null);assert.equal(metric.provenanceRestricted,true);assert.ok(metric.latest);assert.notEqual(metric.latest.aiEligibility,"allowed");assert.match(metric.reason,/not evidence of normal recovery/);}
    assert.deepEqual(value.objectiveFields,{sleepHours:true,hrv:true,restingHr:true});
  }
  const own=context({observations:[observation({source:"manual",measurementMethod:"manual_entry"})]});assert.equal(own.metrics.sleepHours.selected?.aiEligibility,"allowed");assert.equal(own.metrics.sleepHours.provenanceRestricted,false);
});
test("manual/estimated/uploaded observations retain their classification and a missing import timestamp stays null",()=>{
  for(const [method,source,kind] of [["manual_entry","manual","self_reported"],["derived","oura","estimated"],["uploaded_file","garmin","unverified"],["optical_sensor","garmin","measured"]] as const) {
    const value=context({observations:[observation({measurementMethod:method,source,createdAt:null})]}).metrics.sleepHours.selected;
    assert.ok(value);assert.equal(value.classification,kind);assert.equal(value.importedAt,null);assert.equal(value.measurementTimePrecision,"unknown");
  }
});
test("athlete-local days and DST boundaries determine freshness and completion dates",()=>{
  const value=context({now:new Date("2026-11-01T04:30Z"),observations:[observation({id:"today",observedAt:new Date("2026-11-01T04:00Z")}),observation({id:"yesterday",value:5,observedAt:new Date("2026-10-31T04:00Z")})],completedWorkouts:[workout({date:new Date("2026-11-01T03:55Z")}),workout({id:"after-midnight",date:new Date("2026-11-01T04:05Z")})]});
  assert.equal(value.dateLocal,"2026-11-01");assert.equal(value.metrics.sleepHours.selected?.id,"today");
  assert.deepEqual(value.completedWorkouts.map(row=>row.dateLocal).sort(),["2026-10-31","2026-11-01"]);
});
test("imported completion suppresses redundant duration while missing RPE reaches the existing conservative decision engine",()=>{
  const value=context({completedWorkouts:[workout()]});assert.equal(value.completedWorkouts.length,1);
  assert.equal(value.completedWorkouts[0].outcome,"completed");assert.equal(value.completedWorkouts[0].durationMinutes,45);
  assert.equal(value.completedWorkouts[0].questions.durationMinutes,false);assert.equal(value.completedWorkouts[0].questions.rpe,true);
  const decision=applyDailyExecutionContext(full(),value);
  assert.equal(decision.inputs[0].actualDurationMin,45);assert.equal(decision.inputs[0].outcome,"completed");assert.equal(decision.inputs[0].rpe,null);
  assert.equal(decision.adaptation.verdict,"easy");assert.equal(decision.adaptation.durationFactor,.6);
  const withRpe=context({completedWorkouts:[workout({rpe:3,feedbackStatus:"completed",feedbackAt:new Date("2026-10-20T16:00Z")})]});
  assert.equal(withRpe.completedWorkouts[0].questions.rpe,false);assert.equal(applyDailyExecutionContext(full(),withRpe).adaptation.verdict,"full");
  const hard=context({completedWorkouts:[workout({rpe:9,feedbackStatus:"completed",feedbackAt:new Date("2026-10-20T16:00Z")})]});
  assert.equal(applyDailyExecutionContext(full(),hard).adaptation.durationFactor,.85);
});
test("matched plan and completed import count once, retain comparison and do not borrow or invent subjective RPE",()=>{
  const actual=workout({id:"imported",actualDurationMin:42,durationMin:42});
  const planned=workout({id:"plan",source:"plan",planned:true,durationMin:40,actualDurationMin:null,matchedPlanId:"imported",createdAt:new Date("2026-10-01")});
  const value=context({completedWorkouts:[actual,planned]});assert.equal(value.completedWorkouts.length,1);assert.equal(value.activity.reportedMinutes,42);
  assert.equal(value.completedWorkouts[0].comparison?.plannedMinutes,40);assert.equal(value.completedWorkouts[0].comparison?.differenceMinutes,2);
  assert.equal(value.completedWorkouts[0].questions.durationMinutes,false);assert.equal(value.completedWorkouts[0].questions.rpe,true);
});
test("two legitimate sessions and brick work remain separate; absent sync is unknown rather than rest",()=>{
  const value=context({completedWorkouts:[workout(),workout({id:"evening",externalId:"garmin:evening",date:new Date("2026-10-20T22:00Z"),sport:"brick",actualDurationMin:60,durationMin:60})]});
  assert.equal(value.completedWorkouts.length,2);assert.equal(value.activity.reportedMinutes,105);assert.equal(value.activity.coverage,"unknown");
  const missing=context({completedWorkouts:[workout({completed:false,planned:true,actualDurationMin:null})]});
  assert.equal(missing.completedWorkouts.length,0);assert.equal(missing.activity.reportedMinutes,null);assert.match(missing.activity.reason,/does not mean no training/);
});
test("cross-provider ambiguity stays unknown and explicit reconciliation never mutates imported records",()=>{
  const rows=[workout({id:"a"}),workout({id:"b",source:"whoop",actualDurationMin:50,durationMin:50,distanceKm:null})];const original=JSON.stringify(rows);
  const pending=context({completedWorkouts:rows});assert.equal(pending.activity.requiresReconciliation,true);assert.equal(pending.activity.reportedMinutes,null);assert.ok(pending.completedWorkouts.every(row=>row.durationMinutes===null));
  const decision:ActivityDecision={version:1,userId:"owner",kind:"same_session",primaryId:"a",members:rows.map(row=>({id:row.id,fingerprint:activityFingerprint(row)}))};
  const reviewed=context({completedWorkouts:rows,activityDecisions:[decision]});assert.equal(reviewed.activity.reportedMinutes,45);assert.equal(reviewed.completedWorkouts.length,1);assert.equal(JSON.stringify(rows),original);
});
test("an explicit primary with missing RPE never borrows effort from another source record",()=>{
  const rows=[workout({id:"primary"}),workout({id:"other",source:"whoop",rpe:4,feedbackStatus:"completed",feedbackAt:now})];
  const decision:ActivityDecision={version:1,userId:"owner",kind:"same_session",primaryId:"primary",members:rows.map(row=>({id:row.id,fingerprint:activityFingerprint(row)}))};
  const value=context({completedWorkouts:rows,activityDecisions:[decision]});assert.equal(value.completedWorkouts.length,1);assert.equal(value.completedWorkouts[0].rpe,null);assert.equal(value.completedWorkouts[0].questions.rpe,true);
  assert.equal(applyDailyExecutionContext(full(),value).inputs[0].rpe,null);
});
test("restricted upstream origins and private free text are never laundered into AI-safe context",()=>{
  const value=context({observations:[observation({source:"intervals",qualityFlag:"incomplete"})],completedWorkouts:[workout({source:"intervals",notes:"Original source: STRAVA. PRIVATE_MEDICAL_NOTE",originalSource:null})]});
  assert.equal(value.metrics.sleepHours.status,"invalid");assert.equal(value.completedWorkouts[0].sourceRecords[0].originalSource,"STRAVA");assert.equal(value.completedWorkouts[0].sourceRecords[0].aiEligibility,"strava");
  assert.equal(value.usage,"athlete_view_and_existing_local_execution_only");assert.doesNotMatch(JSON.stringify(value),/PRIVATE_MEDICAL_NOTE/);
  const unknown=context({completedWorkouts:[workout({source:"intervals",notes:"Original source: PRIVATE_MEDICAL_NOTE"})]});assert.equal(unknown.completedWorkouts[0].sourceRecords[0].originalSource,null);assert.doesNotMatch(JSON.stringify(unknown),/PRIVATE_MEDICAL_NOTE/);
  const foreign=context({observations:[observation({userId:"other"})],completedWorkouts:[workout({userId:"other"})]});assert.equal(foreign.metrics.sleepHours.status,"missing");assert.equal(foreign.completedWorkouts.length,0);
});
test("pure context bounds records and never reports a complete total from truncated history",()=>{
  const value=context({observations:Array.from({length:110},(_,i)=>observation({id:String(i)})),completedWorkouts:Array.from({length:110},(_,i)=>workout({id:String(i),source:"manual"}))});
  assert.equal(value.bounded.observationsTruncated,true);assert.equal(value.bounded.workoutsTruncated,true);assert.equal(value.activity.rawRecordCount,100);assert.equal(value.activity.reportedMinutes,null);
});
test("duplicate dry run flags repeated provider identity without removing records or treating uncertain totals as zero",()=>{
  const rows=[workout({id:"one"}),workout({id:"two"})],before=JSON.stringify(rows);
  const value=context({completedWorkouts:rows});
  assert.equal(value.duplicateReview.destructiveChanges,0);assert.equal(value.duplicateReview.groups.length,1);
  assert.deepEqual(value.duplicateReview.groups[0].recordIds.sort(),["one","two"]);assert.equal(value.duplicateReview.groups[0].proposedAction,"review");
  assert.equal(value.completedWorkouts.length,2);assert.equal(value.activity.reportedMinutes,null);assert.equal(value.activity.requiresReconciliation,true);
  assert.ok(value.completedWorkouts.every(row=>row.durationMinutes===45));assert.equal(JSON.stringify(rows),before);
  assert.equal(value.executionFeedback.length,2,"dry run does not rewrite the existing decision service inputs or source records");
});
test("dry run retains linked plan/activity records and distinct provider sessions without proposing deletion",()=>{
  const actual=workout({id:"actual"}),plan=workout({id:"plan",source:"plan",planned:true,externalId:null,actualDurationMin:null,matchedPlanId:"actual"});
  const linked=context({completedWorkouts:[actual,plan]});assert.equal(linked.duplicateReview.groups.length,1);assert.equal(linked.duplicateReview.groups[0].proposedAction,"retain_linked_records");assert.equal(linked.duplicateReview.destructiveChanges,0);
  const distinct=context({completedWorkouts:[workout({id:"morning",externalId:"garmin:1"}),workout({id:"evening",externalId:"garmin:2",date:new Date("2026-10-20T22:00Z")})]});
  assert.equal(distinct.duplicateReview.groups.length,0);assert.equal(distinct.activity.reportedMinutes,90);
});
test("duplicate dry run honors current explicit identity decisions without contradictory review proposals",()=>{
  const rows=[workout({id:"one"}),workout({id:"two"})];
  const decision:ActivityDecision={version:1,userId:"owner",kind:"same_session",primaryId:"one",members:rows.map(row=>({id:row.id,fingerprint:activityFingerprint(row)}))};
  const linked=context({completedWorkouts:rows,activityDecisions:[decision]});
  assert.equal(linked.activity.reportedMinutes,45);assert.equal(linked.duplicateReview.groups.length,1);assert.equal(linked.duplicateReview.groups[0].proposedAction,"retain_linked_records");
  const distinct=context({completedWorkouts:rows,activityDecisions:[{...decision,kind:"different_sessions",primaryId:null}]});
  assert.equal(distinct.activity.reportedMinutes,90);assert.equal(distinct.duplicateReview.groups.length,0);assert.equal(distinct.duplicateReview.destructiveChanges,0);
});
test("neither imported recovery evidence nor an easy completion can clear an existing symptom hold",()=>{
  const value=context({observations:[observation()],completedWorkouts:[workout({feedbackStatus:"completed",rpe:1,feedbackAt:now})]});
  const held=adaptSession({sleep:5,soreness:1,energy:5,motivation:5,stress:1,sick:true,newPain:false,urgentSymptoms:false,availableMin:90});
  assert.deepEqual(applyDailyExecutionContext(held,value).adaptation,held);
});
test("restricted raw history stays visible without aggregate, comparison or execution analytics and cannot turn empty feedback into clearance",()=>{
  for(const origin of [{source:"strava"},{source:"intervals",notes:"Original source: STRAVA."},{source:"intervals"},{source:undefined}]) {
    const actual=workout({id:"actual",...origin}),plan=workout({id:"plan",source:"plan",planned:true,actualDurationMin:null,durationMin:40,matchedPlanId:"actual"});
    const rows=[actual,plan],before=JSON.stringify(rows),value=context({completedWorkouts:rows});
    assert.equal(value.completedWorkouts[0].durationMinutes,45);assert.equal(value.completedWorkouts[0].durationBasis,"source_record");assert.equal(value.completedWorkouts[0].comparison,null);
    assert.equal(value.activity.reportedMinutes,null);assert.equal(value.activity.derivedActivityPolicy.status,"insufficient");assert.match(value.activity.reason,/origin/);assert.deepEqual(value.executionFeedback,[]);
    const decision=applyDailyExecutionContext(full(),value);assert.equal(decision.adaptation.verdict,"rest");assert.equal(decision.adaptation.durationFactor,0);assert.equal(decision.adaptation.safetyStatus,"unknown");assert.deepEqual(decision.inputs,[]);
    assert.equal(applyDailyExecutionContext({...full(),safetyStatus:undefined},value).adaptation.verdict,"rest","legacy adaptation without an explicit safety status is not clearance");
    const urgent=adaptSession({urgentSymptoms:true});assert.deepEqual(applyDailyExecutionContext(urgent,value).adaptation,urgent);assert.equal(JSON.stringify(rows),before);
  }
});
test("an allowed explicit primary cannot authorize analytics of a restricted source member",()=>{
  const rows=[workout({id:"manual",source:"manual",externalId:null}),workout({id:"strava",source:"strava",externalId:"strava:1"})];
  const decision:ActivityDecision={version:1,userId:"owner",kind:"same_session",primaryId:"manual",members:rows.map(row=>({id:row.id,fingerprint:activityFingerprint(row)}))};
  const value=context({completedWorkouts:rows,activityDecisions:[decision]});assert.equal(value.completedWorkouts[0].id,"manual");assert.equal(value.activity.reportedMinutes,null);assert.deepEqual(value.executionFeedback,[]);assert.equal(value.activity.derivedActivityPolicy.restrictedRecords.strava,1);
});
test("optional observation schema absence degrades only measurements while retaining saved history and honest unknowns",async()=>{
  const db=(code:string):any=>({metricObservation:{findMany:async()=>{throw {code,message:"PRIVATE_DB_DETAIL"};}},workout:{findMany:async()=>[workout()]},connector:{findMany:async()=>[]},auditLog:{findMany:async()=>[]}});
  for(const code of ["P2021","P2022"]) {
    const value=await readDailyInputContext("owner","America/New_York",db(code),now);assert.equal(value.readStatus,"unavailable");assert.equal(value.dataAvailability.observations,"unavailable");assert.equal(value.metrics.sleepHours.selected,null);assert.equal(value.objectiveFields.sleepHours,true);assert.equal(value.completedWorkouts.length,1);assert.doesNotMatch(JSON.stringify(value),/PRIVATE_DB_DETAIL/);
  }
  for(const code of ["P1001","P2002","UNAUTHORIZED"]) await assert.rejects(readDailyInputContext("owner","America/New_York",db(code),now),(error:any)=>error.code===code);
  const workoutFailure=db("P2021");workoutFailure.workout.findMany=async()=>{throw {code:"P2021",target:"workout"};};
  await assert.rejects(readDailyInputContext("owner","America/New_York",workoutFailure,now),(error:any)=>error.target==="workout");
  const pure=context({observations:[observation()],observationsUnavailable:true});assert.equal(pure.metrics.sleepHours.selected,null);assert.equal(pure.dataAvailability.observations,"unavailable");assert.equal(context().dataAvailability.observations,"available");
});
test("DB reader uses owner-scoped projected evidence with bounded observation and local-day activity windows",async()=>{
  const calls:any[]=[];const db:any={
    metricObservation:{findMany:async(q:any)=>{calls.push(["metrics",q]);return [observation()];}},
    workout:{findMany:async(q:any)=>{calls.push(["workouts",q]);return [workout()];}},
    connector:{findMany:async(q:any)=>{calls.push(["connectors",q]);return []; }},
    auditLog:{findMany:async(q:any)=>{calls.push(["decisions",q]);return []; }},
  };
  const value=await readDailyInputContext("owner","America/New_York",db,now);assert.equal(value.metrics.sleepHours.selected?.value,7.5);
  const metrics=calls.find(([name])=>name==="metrics")[1],workouts=calls.find(([name])=>name==="workouts")[1];
  assert.equal(metrics.where.userId,"owner");assert.equal(metrics.take,100);assert.equal(metrics.where.observedAt.gte.toISOString(),"2026-10-08T04:00:00.000Z");assert.equal(metrics.where.observedAt.lte,now);
  assert.equal(workouts.where.userId,"owner");assert.equal(workouts.take,100);assert.equal(workouts.where.date.gte.toISOString(),"2026-10-20T04:00:00.000Z");assert.equal(workouts.where.date.lt.toISOString(),"2026-10-22T04:00:00.000Z");
  assert.equal(workouts.select.feedbackNote,undefined);assert.equal(workouts.select.actualDetails,undefined);assert.equal(workouts.select.title,undefined);
  assert.equal(calls.find(([name])=>name==="decisions")[1].where.subjectId,"owner");
});
