import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {ONBOARDING_STEP as S,onboardingNext} from "./onboarding-flow";
test("onboarding progresses through every visible stage, blocking failed saves",()=>{
 assert.equal(onboardingNext(S.welcome),S.profile);
 assert.equal(onboardingNext(S.profile,false),S.profile);
 assert.equal(onboardingNext(S.profile,true),S.devices);
 assert.equal(onboardingNext(S.devices),S.race);
 assert.equal(onboardingNext(S.race,false),S.race);
 assert.equal(onboardingNext(S.race,true),S.done);
 assert.equal(onboardingNext(S.done),S.done);
});
test("wizard has exactly one rendered panel per reachable step",()=>{
 const source=readFileSync("src/app/onboard/page.tsx","utf8");
 const guards=[...source.matchAll(/step === ONBOARDING_STEP\.(\w+)/g)].map(x=>x[1]);
 assert.deepEqual(guards,Object.keys(S));
});
