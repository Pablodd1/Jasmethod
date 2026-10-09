import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { settingsProfileForm, settingsProfilePatch } from "./settings-profile";

test("missing profile values never become an invented goal, experience or weekly time",()=>{
  const form=settingsProfileForm(null);
  assert.equal(form.goal,"");assert.equal(form.experience,"");assert.equal(form.weeklyHours,"");assert.equal(form.units,"auto");
  assert.deepEqual(settingsProfilePatch(form,form),{});
});
test("an unrelated height edit only submits height and preserves null goal and profile defaults",()=>{
  const saved=settingsProfileForm({heightCm:170,goal:null,experience:"beginner",weeklyHours:8,weightKg:62,weightSource:"apple_health",units:"imperial"});
  assert.deepEqual(settingsProfilePatch({...saved,heightCm:"171"},saved),{heightCm:171});
  assert.deepEqual(settingsProfilePatch({...saved,heightCm:"170.0"},saved),{});
});
test("an unrelated edit never resubmits a historical unsupported goal",()=>{
  const saved=settingsProfileForm({goal:"boxing",heightCm:178,experience:"advanced",weeklyHours:6});
  assert.equal(saved.goal,"boxing");
  assert.deepEqual(settingsProfilePatch({...saved,heightCm:"179"},saved),{heightCm:179});
  assert.deepEqual(settingsProfilePatch({...saved,goal:"run-only"},saved),{goal:"run-only"});
});
test("clearing optional data is explicit null intent while required fields cannot be silently cleared",()=>{
  const saved=settingsProfileForm({weightKg:65,goal:"cycle",weeklyHours:7,experience:"amateur"});
  assert.deepEqual(settingsProfilePatch({...saved,weightKg:"",goal:""},saved),{weightKg:null,goal:null});
  assert.throws(()=>settingsProfilePatch({...saved,weeklyHours:""},saved),/weekly training time/);
  assert.throws(()=>settingsProfilePatch({...saved,experience:""},saved),/experience level/);
});
test("integer inputs are not truncated before validation and injury/units changes remain explicit",()=>{
  const saved=settingsProfileForm({birthYear:1990,injured:false,units:"imperial"});
  assert.deepEqual(settingsProfilePatch({...saved,birthYear:"1990.5"},saved),{birthYear:1990.5});
  assert.deepEqual(settingsProfilePatch({...saved,injured:true,units:"auto"},saved),{units:"auto",injured:true});
});
test("profile race dates round-trip in the athlete timezone without an unrelated write",()=>{
  const tokyo=settingsProfileForm({raceDate:"2027-03-19T15:00:00.000Z"},"Asia/Tokyo");
  assert.equal(tokyo.raceDate,"2027-03-20");
  assert.deepEqual(settingsProfilePatch(tokyo,tokyo),{});
});
test("Profile navigation offers guided setup, saved plan, associated basic labels and truthful status",()=>{
  const page=readFileSync("src/app/settings/page.tsx","utf8");
  for(const field of ["birthYear","sex","heightCm","weightKg","experience","goal","weeklyHours","raceDate","trainingWindow","units"]) {
    assert.match(page,new RegExp(`htmlFor="profile-${field}"`));
    assert.match(page,new RegExp(`id="profile-${field}"`));
  }
  assert.match(page,/href="\/onboard\?redo=1&step=race&return=training"/);
  assert.match(page,/View my saved plan/);
  assert.match(page,/settingsProfilePatch\(form, loadedForm.current\)/);
  assert.match(page,/No changes to save/);
  assert.doesNotMatch(page,/zones updated|d.profile.goal \|\| "olympic"/);
});
