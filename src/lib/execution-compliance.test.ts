import test from "node:test";
import assert from "node:assert/strict";
import { analyzeCompliance } from "./execution-compliance";
import type { ActivityStreams } from "./activity-streams";
import type { WorkoutStep } from "./prescription";

test("steady relative outputs cannot claim that prescribed absolute targets were met",()=>{
  const steps=[{seconds:120,phase:"active",zone:"z4"},{seconds:120,phase:"active",zone:"z4"}] as WorkoutStep[];
  for(const sport of ["bike","run","swim","hyrox"]){
    const streams={t:Array.from({length:241},(_,i)=>i),power:Array(241).fill(50),speedMs:Array(241).fill(.5),hr:Array(241).fill(100)} as ActivityStreams;
    const result=analyzeCompliance(steps,streams,{sport});
    assert.equal(result.verdict,"on_target"); // legacy machine enum: relative consistency only
    assert.match(result.note,/relatively consistent/);assert.match(result.note,/target attainment was not assessed/);
  }
});
test("fade reports observations without diagnosing a too-high dose or inferring improvement",()=>{
  const steps=[{seconds:120,phase:"active",zone:"z4"},{seconds:120,phase:"active",zone:"z4"}] as WorkoutStep[];
  const streams={t:Array.from({length:241},(_,i)=>i),power:Array.from({length:241},(_,i)=>i<120?200:150),speedMs:Array(241).fill(null),hr:Array(241).fill(null)} as ActivityStreams;
  const result=analyzeCompliance(steps,streams,{sport:"bike"});
  assert.equal(result.verdict,"faded");assert.match(result.note,/cause is not established/);assert.doesNotMatch(result.note,/were too high/);
  streams.power.fill(100);
  const easy=analyzeCompliance(steps,streams,{sport:"bike",rpe:2,intendedRpe:7});
  assert.equal(easy.verdict,"too_easy");assert.match(easy.note,/fitness improvement is not established/);
});
