import test from "node:test";
import assert from "node:assert/strict";
import { athleteHistoryCoverage, athleteHistorySummary } from "./athlete-history-coverage";

test("restricted, missing or malformed origin never turns empty model input into zero observed history",()=>{
  for (const origin of ["insufficient",undefined,null,"unknown","strava"]) {
    const coverage=athleteHistoryCoverage(origin,0);
    assert.deepEqual(coverage,{status:"withheld",days:null});
    assert.match(athleteHistorySummary(coverage,true,false),/Coverage is unknown/);
    assert.match(athleteHistorySummary(coverage,true,true),/cobertura es desconocida/);
    assert.doesNotMatch(athleteHistorySummary(coverage,true,false),/0 days|no history|without overload/);
  }
  for(const value of [-1,NaN,Infinity,null,"0",1.5]) assert.equal(athleteHistoryCoverage("allowed",value).status,"withheld");
});

test("positively eligible zero coverage stays distinct from withheld records, without guarantees",()=>{
  const empty=athleteHistoryCoverage("allowed",0);
  assert.deepEqual(empty,{status:"available",days:0});
  assert.match(athleteHistorySummary(empty,true,false),/Usable history: 0 days/);
  const known=athleteHistoryCoverage("allowed",30);
  assert.deepEqual(known,{status:"available",days:30});
  assert.doesNotMatch(athleteHistorySummary(known,true,false),/without overload|Garmin\/COROS/);
});
