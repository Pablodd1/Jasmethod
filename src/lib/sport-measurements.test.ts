import test from "node:test";
import assert from "node:assert/strict";
import { parseSportEntry,providerSportMeasurements,readSportMeasurements,mergeProviderMeasurements } from "./sport-measurements";
import { sportEvidence,type SportRow } from "./sport-evidence";
import { isAiEligible } from "./strava-provenance";
import { derivedActivityPolicy } from "./derived-activity-policy";
import { personalCoachFacts } from "./coach-personal-context";
const now=new Date("2026-10-28T12:00Z");
const entry=(extra:Record<string,unknown>={})=>({sport:"bike",date:"2026-10-27",mode:"distance_duration",distance:"30",distanceUnit:"km",duration:"1:00:00",speed:"",speedUnit:"km/h",durationBasis:"elapsed",...extra});
test("hand-entered sport measurements have explicit local-only provenance rather than presumed AI permission",()=>{
  const p=parseSportEntry(entry(),"UTC",now),origin={source:p.workout.source,externalId:"manual-sport:synthetic"};
  assert.equal(origin.source,"manual_sport_local");assert.equal(derivedActivityPolicy([origin]).status,"allowed");assert.equal(isAiEligible(origin),false);
  assert.equal(derivedActivityPolicy([{source:origin.source}]).status,"insufficient");
  assert.equal(readSportMeasurements(p.workout.actualDetails,"bike",origin.source)?.durationSeconds,3600);
  assert.equal(personalCoachFacts(null,false,[{...p.workout,externalId:origin.externalId,matchedPlanId:null}],"2026-10-28").recentManualActuals.length,0);
  assert.equal(parseSportEntry(entry({durationBasis:"reported_unconfirmed"}),"UTC",now).measurements.durationBasis,"reported_unconfirmed");
});
test("three manual entry modes preserve exact units and identify reported versus calculated quantities",()=>{
  const bike=parseSportEntry(entry(),"UTC",now);assert.equal(bike.measurements.averageSpeedKmh,30);assert.equal(bike.workout.actualDurationMin,60);assert.deepEqual(bike.measurements.reported,["distance","duration"]);
  const run=parseSportEntry(entry({sport:"run",mode:"distance_speed",distance:"6",duration:"",speed:"12"}),"UTC",now);assert.equal(run.measurements.durationSeconds,1800);
  const swim=parseSportEntry(entry({sport:"swim",mode:"duration_speed",distance:"",duration:"0:30:00",speed:"3",distanceUnit:"m",environment:"pool",poolLength:"25",poolUnit:"yd",cadence:"30"}),"UTC",now);
  assert.equal(swim.measurements.distanceKm,1.5);assert.equal(swim.measurements.poolLengthM,22.86);assert.equal(swim.measurements.cadence,30);
  const imperial=parseSportEntry(entry({distance:"10",distanceUnit:"mi",mode:"distance_speed",duration:"",speed:"20",speedUnit:"mph"}),"UTC",now);
  assert.equal(imperial.measurements.durationSeconds,1800);assert.equal(imperial.measurements.distanceKm,16.09344);assert.equal(imperial.measurements.averageSpeedKmh,32.18688);
});
test("invalid, contradictory, future and hidden sport fields never produce a saved interpretation",()=>{
  for(const extra of [{duration:"3:90"},{distance:""},{distance:true},{distanceUnit:"watts"},{speed:"30"},{mode:"distance_speed",duration:"",speed:"0"},{date:"2026-10-29"},{date:"2026-02-30"},{durationBasis:""},{cadence:-2},{sport:"swim",environment:"outdoor"},{poolLength:25,poolUnit:"m"},{sport:"run",np:200},{avgHr:180,maxHr:140},{userId:"other"}])
    assert.throws(()=>parseSportEntry(entry(extra),"UTC",now),JSON.stringify(extra));
});
test("sub-minute reports retain exact observations while the planning budget rounds conservatively",()=>{
  const p=parseSportEntry(entry({sport:"swim",distance:25,distanceUnit:"m",duration:"0:30"}),"UTC",now);
  assert.equal(p.measurements.durationSeconds,30);assert.equal(p.workout.actualDurationMin,1);assert.equal(p.measurements.averageSpeedKmh,3);
});
test("new Garmin summaries preserve exact duration without inventing cadence, timing basis or pool detail",()=>{
  const p=providerSportMeasurements("swim",91,.125)!;
  assert.equal(p.averageSpeedKmh,.125*3600/91);assert.equal(p.durationBasis,"provider_duration");assert.equal(p.cadence,null);assert.equal(p.poolLengthM,null);
  const old=JSON.stringify({schemaVersion:1,source:"athlete_report",values:{distanceKm:.12},feedback:"retained"});
  const merged=mergeProviderMeasurements(old,JSON.stringify({schemaVersion:1,providerEvidence:p}));
  assert.equal(JSON.parse(merged).feedback,"retained");assert.equal(JSON.parse(merged).values.distanceKm,.12);
  assert.equal(readSportMeasurements(merged,"swim","garmin_direct")?.durationSeconds,91);
  assert.equal(readSportMeasurements(merged,"run","garmin_direct"),null);assert.equal(mergeProviderMeasurements("not-json",merged),"not-json");
});
function row(id:string,sport:string,extra:Partial<SportRow>={}):SportRow{return {id,userId:"owner",date:new Date("2026-10-27T12:00Z"),sport,source:"manual",planned:false,completed:true,durationMin:30,actualDurationMin:30,distanceKm:5,...extra};}
test("sport history excludes plans, other athletes and future activity; newest measured date wins over insertion",()=>{
  const rows=[row("bike","bike",{distanceKm:15}),row("swim","swim",{distanceKm:1}),row("run-old","run"),row("run-new","run",{date:new Date("2026-10-28T10:00Z"),distanceKm:6}),row("foreign","run",{userId:"other"}),row("plan","run",{planned:true,completed:false,actualDurationMin:null}),row("future","run",{date:new Date("2026-11-01")})];
  const result=sportEvidence(rows,"owner",[],now),run=result.find(s=>s.sport==="run")!;
  assert.equal(run.records.length,2);assert.equal(run.records[0].id,"run-new");assert.equal(run.latest.averageSpeedKmh?.value,12);assert.equal(run.records[0].precision,"whole_minutes");
  assert.equal(result.find(s=>s.sport==="bike")!.latest.averageSpeedKmh?.value,30);assert.equal(result.find(s=>s.sport==="swim")!.latest.averageSpeedKmh?.value,2);
});
test("restricted, unknown and unresolved copies do not become new derived speed or complete training totals",()=>{
  for(const source of ["strava","unknown"]){const r=sportEvidence([row("restricted","run",{source,notes:"PRIVATE_SPORT_CANARY"})],"owner",[],now).find(s=>s.sport==="run")!;
    assert.equal(r.records[0].averageSpeedKmh,null);assert.equal(r.recent.sessions,null);assert.doesNotMatch(JSON.stringify(r),/PRIVATE_SPORT_CANARY/);}
  const copied=sportEvidence([row("a","run",{source:"fit"}),row("b","run",{source:"whoop",distanceKm:null})],"owner",[],now).find(s=>s.sport==="run")!;
  assert.ok(copied.coverage.unresolvedGroups);assert.equal(copied.recent.sessions,null);assert.equal(copied.latest.averageSpeedKmh,null);
});
test("precise manual and direct Garmin observations keep provenance; incomplete history is never a complete aggregate",()=>{
  const parsed=parseSportEntry(entry({sport:"run",distance:"5",duration:"25:00"}),"UTC",now);
  const exact=row("exact","run",{date:parsed.workout.date,durationMin:25,actualDurationMin:25,distanceKm:5,actualDetails:parsed.workout.actualDetails});
  const p=sportEvidence([exact],"owner",[],now,true).find(s=>s.sport==="run")!;
  assert.equal(p.records[0].precision,"exact");assert.equal(p.latest.averageSpeedKmh?.calculated,true);assert.equal(p.recent.sessions,null);
  const garmin=row("garmin","bike",{source:"garmin_direct",externalId:"garmin:synthetic",distanceKm:30,durationMin:60,actualDurationMin:60,actualDetails:JSON.stringify({schemaVersion:1,providerEvidence:providerSportMeasurements("bike",3591,30)})});
  const g=sportEvidence([garmin],"owner",[],now).find(s=>s.sport==="bike")!;assert.equal(g.records[0].precision,"exact");assert.equal(g.records[0].averageSpeedKmh,30*3600/3591);
});
test("fueling preserves exact provider timing but an actual-duration correction invalidates old precision",()=>{
  const providerEvidence=providerSportMeasurements("bike",3591,30);
  const base=row("garmin","bike",{source:"garmin_direct",externalId:"garmin:synthetic",distanceKm:30,durationMin:60,actualDurationMin:60,
    actualDetails:JSON.stringify({schemaVersion:1,source:"athlete_report",values:{},providerEvidence,actualFueling:{carbsG:45}})});
  const view=(r:SportRow)=>sportEvidence([r],"owner",[],now).find(s=>s.sport==="bike")!.records[0];
  assert.equal(view(base).durationSeconds,3591);assert.equal(view(base).precision,"exact");
  for(const actualDurationMin of [59,61]){const corrected=view({...base,actualDurationMin});assert.equal(corrected.precision,"whole_minutes");assert.equal(corrected.durationSeconds,actualDurationMin*60);assert.equal(corrected.averageSpeedKmh,30*60/actualDurationMin);}
  const manual=parseSportEntry(entry({duration:"59:51"}),"UTC",now);
  const corrected=view(row("manual","bike",{durationMin:60,actualDurationMin:59,distanceKm:30,actualDetails:manual.workout.actualDetails}));
  assert.equal(corrected.precision,"whole_minutes");assert.equal(corrected.durationSeconds,3540);
});
