import test from "node:test";
import assert from "node:assert/strict";
import { profileUnitFormValues, profileUnitPatch } from "./profile-unit-fields";
import { unitsOf,fmtHeight,weightToDisplay,weightFromDisplay,heightToFeetInches,heightFromFeetInches } from "./units";
import { profilePatch } from "./profile-update";
import { plannedAerobicDistribution } from "./training-distribution";

test("admin profile form uses the athlete's effective units and retains exact canonical measurements on save/reload",()=>{
  const profile={weightKg:70.12345,heightCm:178.123,runPaceBase:300.123,swimPaceBase:90.123};
  for(const language of ["en","es","fr"])for(const preference of ["auto","metric","imperial"]) {
    const units=unitsOf(preference,language),form=profileUnitFormValues(profile,units),before=JSON.stringify(profile);
    const saved=profilePatch(profileUnitPatch(form,profile,units),"UTC");
    for(const key of Object.keys(profile))assert.equal(saved[key],profile[key as keyof typeof profile],`${language}/${preference}/${key}`);
    assert.deepEqual(profileUnitFormValues(saved,units),form);assert.equal(JSON.stringify(profile),before);
  }
  assert.equal(profileUnitFormValues(profile,"imperial").runPaceBase,"8:03");
  assert.equal(profileUnitFormValues(profile,"imperial").swimPaceBase,"1:22");
  assert.equal(fmtHeight(182.8,"imperial"),`6'0"`);
});

test("edited imperial weight, height and clock paces convert exactly once and never relabel canonical values",()=>{
  const patch=profileUnitPatch({weightKg:"154.3234",heightFeet:"5",heightInches:"10",runPaceBase:"8:03",swimPaceBase:"1:30",units:"metric"},{},"imperial");
  assert.ok(Math.abs(patch.weightKg-70)<1e-6);assert.equal(patch.heightCm,177.8);
  assert.ok(Math.abs(patch.runPaceBase-483/1.609344)<1e-9);assert.ok(Math.abs(patch.swimPaceBase-90/.9144)<1e-9);
  assert.equal(patch.units,"metric");assert.equal("heightFeet" in patch,false);
  assert.equal(profileUnitPatch({runPaceBase:"3:00"},{},"metric").runPaceBase,180);
  for(const runPaceBase of ["180","3:60","0:00","abc"])assert.throws(()=>profilePatch(profileUnitPatch({runPaceBase},{},"imperial"),"UTC"));
  assert.throws(()=>profileUnitPatch({heightFeet:"5",heightInches:"12"},{},"imperial"));
  const cleared=profileUnitPatch({weightKg:"",heightFeet:"",heightInches:"",runPaceBase:"",swimPaceBase:""},{},"imperial");
  assert.equal(profilePatch(cleared,"UTC").heightCm,null);
  assert.equal(weightFromDisplay(weightToDisplay(70,"imperial"),"imperial"),70);
  const height=heightToFeetInches(178);assert.equal(heightFromFeetInches(height.feet,height.inches),178);
});

test("planned easy allocation follows the aerobic denominator, excludes station work and never invents measured distribution",()=>{
  const result=plannedAerobicDistribution([{sport:"run",intensity:"z2",durationMin:10},{sport:"bike",intensity:"z4",durationMin:10},{sport:"strength",intensity:"z1",durationMin:30},{sport:"swim",planned:false,intensity:"z1",durationMin:30}]);
  assert.deepEqual(result,{totalMinutes:20,easyMinutes:10,easyPct:50,sessionCount:2});
  assert.equal(plannedAerobicDistribution([{sport:"run",durationMin:20}]).easyPct,null);
  assert.equal(plannedAerobicDistribution([]).easyPct,null);
});
