import test from "node:test";
import assert from "node:assert/strict";
import { recordSportHeartRate, readSportHeartRate, sportHeartRateTarget, SPORT_HR_SPORTS } from "./sport-heart-rate";
import { buildZoneTable } from "./science";
import { resolveStepTarget, canonicalSession } from "./canonical-session";
import { zoneTargets } from "./prescription";
import { evidencedTargetProfile } from "./anchor-evidence";
import { planTargetPreview } from "./plan-target-preview";
const today=new Date().toISOString().slice(0,10),now=new Date(today+"T12:00Z");
const save=(raw:unknown,sport:"run"|"bike"|"swim"|"hyrox",metric:"maxHr"|"lthr",value:number,date=today)=>recordSportHeartRate(raw,{sport,metric,value,observedOn:date},today);

test("sport-specific reports preserve unrelated PRs and dated observations; same-date corrections stay idempotent",()=>{
  const prior=[{label:"5K actual result",value:20,unit:"min",date:today}];
  let raw=save(prior,"run","maxHr",179);raw=save(raw,"bike","maxHr",171);raw=save(raw,"run","maxHr",180);raw=save(raw,"run","maxHr",180);
  assert.equal(JSON.parse(raw).length,3);assert.deepEqual(JSON.parse(raw)[0],prior[0]);
  assert.deepEqual(readSportHeartRate(raw,"bike","maxHr",now),{sport:"bike",metric:"maxHr",value:171,unit:"bpm",observedAt:today,source:"athlete_reported_reference"});
  for(const sport of SPORT_HR_SPORTS){const input=save(null,sport,"lthr",150);assert.equal(readSportHeartRate(input,sport,"lthr",now)?.sport,sport);}
});
test("unknown, future, stale, malformed, wrong-unit and conflicting reports stay unavailable",()=>{
  const row={label:"JMM manual run maxHr reference",value:180,unit:"bpm",date:today};
  for(const raw of [null,"bad",{},[{...row,unit:"W"}],[{...row,value:"180"}],[{...row,date:"2000-01-01"}],[{...row,date:"2099-01-01"}],[{...row,date:"2026-02-30"}],[row,{...row,value:181}]])assert.equal(readSportHeartRate(raw,"run","maxHr",now),null);
  assert.equal(readSportHeartRate([{...row,label:"Device peak run HR"}],"run","maxHr",now),null);
  assert.equal(readSportHeartRate([row],"bike","maxHr",now),null);
});
test("write validates existing bpm bounds and actual dates without discarding malformed existing records",()=>{
  for(const value of [NaN,Infinity,79,241,180.5,"180",true])assert.throws(()=>save(null,"run","maxHr",value as number));
  for(const date of ["", "2099-01-01","2026-02-30"])assert.throws(()=>save(null,"run","maxHr",180,date));
  assert.throws(()=>save("bad","bike","lthr",160));
  assert.throws(()=>save(save(null,"bike","maxHr",160),"bike","lthr",170));
  assert.throws(()=>save(save(null,"bike","lthr",170),"bike","maxHr",160));
});
test("generic maximum and resting HR never invent cycling HR or auto-estimated VO2max",()=>{
  const generic=buildZoneTable({maxHr:168,restingHr:45,lthr:160});
  assert.deepEqual(generic.hr?.z2,{low:123,high:134});assert.equal(generic.bikeHr,undefined);assert.equal(generic.vo2maxHr,undefined);assert.deepEqual(generic.sportHr,{});
  assert.equal(buildZoneTable({maxHr:NaN}).hr,undefined);
  const raw=save(save(null,"run","maxHr",180),"bike","maxHr",170);
  const table=buildZoneTable({maxHr:168,manualPrs:raw,referenceNow:now});
  assert.deepEqual(table.sportHr?.run?.zones.z2,{low:131,high:144});assert.deepEqual(table.bikeHr?.z2,{low:124,high:136});
  assert.equal(table.sportHr?.bike?.reference.observedAt,today);assert.equal(table.sportHr?.bike?.reference.source,"athlete_reported_reference");
});
test("canonical run/bike HR targets require dated matching sport reports; generic LTHR and device peaks cannot substitute",()=>{
  for(const sport of ["run","bike"]){assert.equal(resolveStepTarget({zone:"z2"},sport,{lthr:170}).type,"open");assert.equal(zoneTargets("z2",sport,{lthr:170}).hr,undefined);}
  const raw=save(null,"run","lthr",170),profile={manualPrs:raw,referenceAsOf:now.toISOString()};
  const run=resolveStepTarget({zone:"z2"},"run",profile);assert.equal(run.type,"heartRate");assert.deepEqual([run.low,run.high],[137,151]);assert.equal(run.reference?.observedAt,today);assert.match(run.label,/run threshold HR · athlete-reported/);
  assert.equal(resolveStepTarget({zone:"z2"},"bike",profile).type,"open");
  assert.equal(resolveStepTarget({zone:"z7"},"run",profile).type,"open");
  assert.deepEqual(resolveStepTarget({zone:"z2",target:{type:"heartRate",low:120,high:140}},"bike",profile),{type:"heartRate",low:120,high:140,label:"120–140 bpm",source:"explicit"});
  const maxProfile={manualPrs:save(null,"bike","maxHr",170),referenceAsOf:now.toISOString()};
  assert.equal(resolveStepTarget({zone:"z2"},"bike",maxProfile).high,136);assert.equal(resolveStepTarget({zone:"z6"},"bike",maxProfile).type,"open");
});
test("future projections expire references and canonical revision changes when the matching sport report changes",()=>{
  const raw=save(null,"run","lthr",170),steps=[{name:"Easy",seconds:1800,zone:"z2",phase:"active" as const}],profile={manualPrs:raw};
  const future=new Date(now.getTime()+91*86400000);
  const old=evidencedTargetProfile(profile,[],[],future);assert.equal(resolveStepTarget({zone:"z2"},"run",old).type,"open");
  const preview=planTargetPreview({profile,steps,sport:"run",tests:[],appliedIds:[],now,sessionDate:now,timezone:"UTC"});assert.equal(preview.steps[0].reference?.source,"athlete_reported_reference");
  const expired=planTargetPreview({profile,steps,sport:"run",tests:[],appliedIds:[],now,sessionDate:future,timezone:"UTC"});assert.equal(expired.steps[0].reference,null);
  const input={athleteId:"a",dateLocal:today,timezone:"UTC",workout:{id:"w",sport:"run",title:"Easy run",durationMin:30,type:"endurance",intensity:"z2"},prescription:{sport:"run",durationMin:30,verdict:"full",steps}};
  const first=canonicalSession({...input,profile}),second=canonicalSession({...input,profile:{manualPrs:save(raw,"run","lthr",160)}});
  assert.equal(first.verdict,"ready");assert.notEqual(first.revision,second.revision);assert.equal(first.steps[0].target.reference?.value,170);
});
