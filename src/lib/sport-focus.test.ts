import test from "node:test";
import assert from "node:assert/strict";
import { profilePatch } from "./profile-update";
import { generateSingleSport } from "./science";
import { PLANNABLE_GOALS } from "./planning-setup";

test("primary goals exclude boxing and lifting while retaining all five sport families",()=>{
 for(const goal of ["boxing","lifting"])assert.throws(()=>profilePatch({goal},"UTC"));
 for(const goal of ["sprint","olympic","half","full","hyrox","cycle","run-only","track-sprint","swim-only"]){assert.ok(PLANNABLE_GOALS.includes(goal));assert.equal(profilePatch({goal},"UTC").goal,goal);}
});
test("swimming cycling and running still contain supporting strength sessions",()=>{
 for(const sport of ["swim","bike","run"] as const){const plan=generateSingleSport({sport,level:"beginner",weeks:4,startDate:new Date("2026-10-06T12:00:00Z"),weeklyHours:4,hasRace:false});assert.match(JSON.stringify(plan),/"sport":"strength"/);}
});
