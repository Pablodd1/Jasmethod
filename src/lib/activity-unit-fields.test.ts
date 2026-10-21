import test from "node:test";
import assert from "node:assert/strict";
import {actualActivityFormValues,actualActivityUnitPatch} from "./activity-unit-fields";
import {unitsOf} from "./units";
import {parseCheckinTranscript} from "./voice-parse";
import {dailyEnvironmentGuidance,type DailyEnvironmentAssessment} from "./daily-environment";
import {buildReminder} from "./notify";

test("actual feedback edit/save/reload preserves exact source values in both units and retains zero versus unknown",()=>{
  for(const language of ["en","es","fr"])for(const preference of ["auto","imperial","metric"])for(const original of [{distanceKm:21.123456789,loadKg:70.123456789},{distanceKm:0,loadKg:0},{distanceKm:null,loadKg:null}]) {
    const units=unitsOf(preference,language),form=actualActivityFormValues(original,units),saved=actualActivityUnitPatch(form,original,units);
    assert.deepEqual(saved,original);assert.deepEqual(actualActivityFormValues(saved,units),form);
  }
  const changed=actualActivityUnitPatch({actualDistanceKm:"1",actualLoadKg:"154.3234"},{distanceKm:null,loadKg:null},"imperial");
  assert.equal(changed.distanceKm,1.609344);assert.ok(Math.abs(changed.loadKg!-70)<1e-9);
  for(const value of ["-1","Infinity","NaN","x"])assert.throws(()=>actualActivityUnitPatch({actualDistanceKm:value},{distanceKm:null,loadKg:null},"imperial"));
});

test("voice accepts explicit pound or kilogram units but never invents an unspoken unit or symptom answer",()=>{
  const pounds=parseCheckinTranscript("weight 154.3234 pounds");assert.ok(Math.abs(pounds.weightKg!-70)<1e-9);assert.equal(pounds.sick,undefined);
  assert.equal(parseCheckinTranscript("weight 70 kilograms").weightKg,70);
  assert.equal(parseCheckinTranscript("weight 154").weightKg,undefined);
});

test("weather and reminder formatting follow automatic and explicit units without changing numeric evidence or sending",()=>{
  const environment={status:"forecast",conditions:{temperatureC:25,humidityPct:60,windMs:5}} as DailyEnvironmentAssessment,before=JSON.stringify(environment);
  assert.match(dailyEnvironmentGuidance(environment,"en"),/77°F/);assert.match(dailyEnvironmentGuidance(environment,"en"),/mph/);
  assert.match(dailyEnvironmentGuidance(environment,"es"),/25°C/);assert.match(dailyEnvironmentGuidance(environment,"en","metric"),/25°C/);
  assert.match(dailyEnvironmentGuidance(environment,"es","imperial"),/77°F/);assert.equal(JSON.stringify(environment),before);
  assert.match(buildReminder("Synthetic",null,25).text,/77°F/);
  assert.match(buildReminder("Synthetic",null,25,{units:"metric",language:"en"}).text,/25°C/);
});
