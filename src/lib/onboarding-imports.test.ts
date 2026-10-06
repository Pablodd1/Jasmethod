import test from "node:test";
import assert from "node:assert/strict";
import {onboardingObservations} from "./onboarding-imports";
test("onboarding review excludes stale, suspect, future and incompatible-unit measurements",()=>{
  const now=new Date("2026-10-06T12:00:00Z"), base={id:"a",metricType:"weight_kg",value:70,unit:"kg",source:"intervals",observedAt:new Date("2026-10-05"),qualityFlag:"ok"};
  const rows=[base,{...base,id:"new",value:72,observedAt:now},{...base,id:"bad",qualityFlag:"suspect"},{...base,id:"future",observedAt:new Date("2027-01-01")},{...base,id:"unit",unit:"lb"},{...base,id:"stale",observedAt:new Date("2020-01-01")}];
  const result=onboardingObservations(rows,now);
  assert.equal(result.length,1);assert.equal(result[0].id,"new");assert.equal(result[0].source,"intervals");
});
test("single HRV observation is reported as observation without a derived baseline or threshold",()=>{
  const now=new Date();const result=onboardingObservations([{id:"h",metricType:"hrv_rmssd",value:60,unit:"ms",source:"oura",observedAt:now,qualityFlag:"ok"}],now);
  assert.equal(result[0].metricType,"hrv_rmssd"); assert.equal("hrvBaseline" in result[0],false);
});
