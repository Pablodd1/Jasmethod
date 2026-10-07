import test from "node:test";
import assert from "node:assert/strict";
import {pilotProfilePatch} from "./pilot-profile";
test("editing sex cannot relabel an untouched imported weight as manual",()=>{
  assert.deepEqual(pilotProfilePatch({sex:"female",weight:"70"},{sex:"",weight:"70"},null),{sex:"female"});
});
test("reviewed adoption keeps observation identity even if the value is unchanged",()=>{
  assert.deepEqual(pilotProfilePatch({sex:"",weight:"70"},{sex:"",weight:"70"},"owned-observation"),{weightKg:"70",reviewedWeightObservationId:"owned-observation"});
  assert.deepEqual(pilotProfilePatch({sex:"",weight:""},{sex:"",weight:""},null),{});
});
