import test from "node:test";
import assert from "node:assert/strict";
import { customTriathlonFromInputs, customTriathlonLabel, formatCustomTriathlonDistance, parseCustomTriathlonDistance, triathlonCoachingDistance, raceKilometres } from "./race-distances";
import { parseRaceCreate, parseRaceUpdate } from "./race-update";
import { classifyDistance } from "./raceforecast";
import { generatePlan } from "./science";

test("custom Daytona event preserves three exact miles-based legs through create and update", () => {
  const distance = customTriathlonFromInputs({swim:"1",bike:"35",run:"9"},{swim:"mi",bike:"mi",run:"mi"});
  assert.equal(distance,"triathlon-custom:1609.344:56327.04:14484.096");
  assert.deepEqual(parseCustomTriathlonDistance(distance),{swimM:1609.344,bikeM:56327.04,runM:14484.096});
  assert.equal(parseRaceCreate({name:"Synthetic custom event",date:"2026-12-06",distance}).distance,distance);
  assert.equal(parseRaceUpdate({id:"owned-race",distance}).data.distance,distance);
  assert.equal(classifyDistance(distance),null,"legacy prediction must not substitute 70.3 assumptions");
  assert.equal(triathlonCoachingDistance(distance),"custom");
  assert.equal(triathlonCoachingDistance("half"),"half");
  assert.equal(triathlonCoachingDistance("triathlon-custom:1:2"),null);
  assert.equal(triathlonCoachingDistance("10k"),null);
});

test("custom race legs reject incomplete, invalid and unreasonable distances at server boundary",()=>{
  for(const distance of ["custom-triathlon","triathlon-custom:1:2","triathlon-custom:1:2:0","triathlon-custom:-1:2:3","triathlon-custom:NaN:2:3","triathlon-custom:1:Infinity:3","triathlon-custom:100001:2:3","triathlon-custom:1:2000001:3","triathlon-custom:1:2:500001","triathlon-custom:1e3:2:3"]){
    assert.equal(parseCustomTriathlonDistance(distance),null);
    assert.throws(()=>parseRaceUpdate({id:"owned",distance}));
  }
  assert.throws(()=>customTriathlonFromInputs({swim:"",bike:"35",run:"9"},{swim:"mi",bike:"mi",run:"mi"}));
  assert.throws(()=>customTriathlonFromInputs({swim:"1",bike:"35",run:"9"},{swim:"yards",bike:"mi",run:"mi"}));
  assert.throws(()=>formatCustomTriathlonDistance({swimM:NaN,bikeM:35000,runM:9000}));
  assert.equal(parseCustomTriathlonDistance("half"),null);
});

test('custom distance labels and edit values omit binary float noise without changing stored metres',()=>{
  const encoded='triathlon-custom:1609.344:56327.04:14484.096';
  assert.equal(raceKilometres(56327.04),56.32704);
  assert.equal(customTriathlonLabel(encoded),'Custom triathlon: 1.609344 km swim · 56.32704 km bike · 14.484096 km run');
  assert.equal(customTriathlonLabel(encoded,true),'Triatlón personalizado: 1.609344 km natación · 56.32704 km bici · 14.484096 km carrera');
  const metres=parseCustomTriathlonDistance(encoded)!;
  assert.equal(formatCustomTriathlonDistance(metres),encoded);
  assert.equal(customTriathlonFromInputs({swim:String(raceKilometres(metres.swimM)),bike:String(raceKilometres(metres.bikeM)),run:String(raceKilometres(metres.runM))},{swim:'km',bike:'km',run:'km'}),encoded);
});

test("custom event selects a triathlon coaching template without standard forecast substitution",()=>{
  const raw=customTriathlonFromInputs({swim:"1",bike:"35",run:"9"},{swim:"mi",bike:"mi",run:"mi"});
  const coachingDistance=triathlonCoachingDistance(raw);
  assert.equal(coachingDistance,"custom");
  const weeks=generatePlan({reviewedCycle:true,level:"advanced",distance:coachingDistance!,weeks:2,startDate:new Date("2026-11-02T12:00:00Z"),weeklyHours:8});
  assert.equal(weeks.length,2);
  for(const week of weeks){
    for(const sport of ["swim","bike","run","brick"]) assert.ok(week.sessions.some(session=>session.sport===sport),`missing ${sport}`);
    assert.ok(week.totalMinutes<=480);
  }
  assert.deepEqual(parseCustomTriathlonDistance(raw),{swimM:1609.344,bikeM:56327.04,runM:14484.096},"retain original legs alongside generic coaching category");
  assert.equal(classifyDistance(raw),null);
});
