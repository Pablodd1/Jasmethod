import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ONBOARDING_STEP as S,onboardingNext,onboardingResume} from "./onboarding-flow";
test("onboarding takes the short connections-to-goals path and blocks failed saves",()=>{
 assert.equal(onboardingNext(S.welcome),S.devices);
 assert.equal(onboardingNext(S.profile,false),S.profile);
 assert.equal(onboardingNext(S.profile,true),S.race);
 assert.equal(onboardingNext(S.devices),S.profile);
 assert.equal(onboardingNext(S.zones),S.race);
 assert.equal(onboardingNext(S.race,false),S.race);
 assert.equal(onboardingNext(S.race,true),S.done);
 assert.equal(onboardingNext(S.travel),S.done);
 assert.equal(onboardingNext(S.done),S.done);
});
test("wizard has exactly one rendered panel per reachable step",()=>{
 const source=readFileSync("src/components/detailed-athlete-setup.tsx","utf8");
 const guards=[...source.matchAll(/step === ONBOARDING_STEP\.(\w+)/g)].map(x=>x[1]);
 assert.deepEqual(guards.sort(),Object.keys(S).sort());
});
test("resuming accepts only actual steps and rejects inherited or malformed names",()=>{
 assert.equal(onboardingResume("devices"),S.devices);assert.equal(onboardingResume("3"),S.zones);
 for(const v of ["constructor","-1","99","bad",null]) assert.equal(onboardingResume(v),S.welcome);
});
