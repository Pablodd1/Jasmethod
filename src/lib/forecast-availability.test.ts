import {test} from "node:test";
import assert from "node:assert/strict";
import {forecastRace,illustrativeRaceScenario} from "./raceforecast";
import {buildForecastBundle} from "./race-forecast-service";
import {raceFuelPlan} from "./race-fuel";
test("personalized race predictions are disabled even with numeric anchors",()=>{
 for(const athlete of [{},{ftp:250,runPaceBase:300,swimPaceBase:100,weightKg:70}]) assert.equal(forecastRace({athlete,fitness:null,distance:"olympic",venue:{}}),null);
});
test("forecast bundle fails closed before database/weather/snapshot work",async()=>{
 const bundle=await buildForecastBundle("synthetic-no-db-user",{distance:"olympic"});
 assert.equal(bundle.forecast,null);assert.equal(bundle.pacing,null);assert.equal(bundle.predictionSnapshot,null);assert.equal(bundle.reason,"personalized_forecasts_disabled");assert.match(bundle.message!,/Dated/);
});
test("isolated scenarios reject missing required anchors and avoid hidden calorie weight",()=>{
 for(const distance of ["10k","40k","750m","olympic"]) assert.equal(illustrativeRaceScenario({athlete:{},fitness:null,distance,venue:{}}),null);
 const run=illustrativeRaceScenario({athlete:{runPaceBase:300},fitness:null,distance:"10k",venue:{}})!;
 assert.equal(run.fuelTotal?.estimatedKcalBurned,null);
});
test("race caffeine also requires explicit opt-in",()=>{
 assert.equal(raceFuelPlan({durationMin:180,weightKg:70}).caffeineMg,null);
 assert.equal(raceFuelPlan({durationMin:180,caffeineOptIn:true}).caffeineMg,null);
 assert.equal(raceFuelPlan({durationMin:180,weightKg:70,caffeineOptIn:true}).caffeineMg,210);
});
