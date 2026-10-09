import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EMPTY_PROFILE, EMPTY_SETUP, EMPTY_RACE, hydrateOnboarding, onboardingDraftKey, restoreOnboardingDraft, clearOnboardingDrafts, type OnboardingDraft } from "./onboarding-form";
import { parsePlanningSetup } from "./planning-setup";
import { ONBOARDING_STEP } from "./onboarding-flow";

const profile = { birthYear: 1987, sex: "female", heightCm: 167, weightKg: 62.5, experience: "advanced", weeklyHours: 6, goal: "run-only", ftp: null };
test("saved explicit experience and time survive reload without eligibility confirmation", () => {
  const setup = parsePlanningSetup({profileConfirmed:false,profileAnswers:{experience:true,weeklyHours:true},goalDescription:"Run consistently",planWeeks:12,trainingDays:[1,3,6]});
  const form = hydrateOnboarding(profile, setup as unknown as Record<string,unknown>);
  assert.equal(form.profile.experience,"advanced");
  assert.equal(form.profile.weeklyHours,"6");
  assert.equal(form.profile.weightKg,"62.5");
  assert.equal(form.setup.profileConfirmed,false);
  assert.equal(form.setup.planWeeks,"12");
  assert.equal(form.setup.baselineObservedAt,"");
  assert.deepEqual(form.setup.trainingDays,[1,3,6]);
});
test("database defaults are never invented answers and known references stay visible", () => {
  const form = hydrateOnboarding({...profile,experience:"beginner",weeklyHours:8},null);
  assert.equal(form.profile.experience,"");
  assert.equal(form.profile.weeklyHours,"");
  assert.equal(form.profile.sex,"female");
  assert.equal(form.profile.ftp,"");
  assert.equal(form.setup.adultConfirmed,false);
  assert.equal(form.setup.restrictions,"unknown");
});
test("legacy confirmed answers and unsupported goals are retained for review", () => {
  const form = hydrateOnboarding({...profile,goal:"boxing"},{profileConfirmed:true});
  assert.equal(form.profile.experience,"advanced");
  assert.equal(form.profile.weeklyHours,"6");
  assert.equal(form.profile.goal,"boxing");
});
function draft(overrides: Partial<OnboardingDraft> = {}): OnboardingDraft {
  return {version:1,userId:"athlete-a",revision:"profile-1",setupRevision:"setup-1",profile:{...EMPTY_PROFILE,sex:"female"},setup:{...EMPTY_SETUP,goalDescription:"My draft",planWeeks:"24"},race:{...EMPTY_RACE,name:"My event"},raceId:null,reviewedWeightId:"review-1",step:ONBOARDING_STEP.race,...overrides};
}
test("interrupted section and race drafts round-trip with a matching user and reviewed revisions", () => {
  const original = draft();
  assert.deepEqual(restoreOnboardingDraft(JSON.stringify(original),"athlete-a","profile-1","setup-1"),original);
  assert.notEqual(onboardingDraftKey("athlete-a"),onboardingDraftKey("athlete-b"));
});
test("another user or newer server profile/setup cannot inherit a stale tab draft", () => {
  const raw = JSON.stringify(draft());
  assert.equal(restoreOnboardingDraft(raw,"athlete-b","profile-1","setup-1"),null);
  assert.equal(restoreOnboardingDraft(raw,"athlete-a","profile-2","setup-1"),null);
  assert.equal(restoreOnboardingDraft(raw,"athlete-a","profile-1","setup-2"),null);
  for (const invalid of ["{", "null", "[]", JSON.stringify({...draft(),version:2}), JSON.stringify({...draft(),profile:{sex:4}})]) assert.equal(restoreOnboardingDraft(invalid,"athlete-a","profile-1","setup-1"),null);
});
test("sign-out cleanup removes only onboarding drafts and tolerates changing storage indexes", () => {
  const values = new Map([[onboardingDraftKey("a"),"private"],["other-tab-state","retain"],[onboardingDraftKey("b"),"private"]]);
  clearOnboardingDrafts({get length(){return values.size;},key:index=>[...values.keys()][index] ?? null,removeItem:key=>{values.delete(key);}});
  assert.deepEqual([...values.keys()],["other-tab-state"]);
});
test("default onboarding uses the shared complete flow with connections first and a saved plan route", () => {
  const pilot = readFileSync("src/components/pilot-onboarding.tsx","utf8");
  const detailed = readFileSync("src/components/detailed-athlete-setup.tsx","utf8");
  assert.match(pilot, /return <DetailedAthleteSetup/);
  assert.doesNotMatch(pilot, /weight|sex/);
  assert.match(detailed, /useState<OnboardingStep>\(ONBOARDING_STEP.devices\)/);
  assert.match(detailed, /3 months · 12 weeks/);
  assert.match(detailed, /6 months · 24 weeks/);
  assert.match(detailed, /View my saved training plan/);
  assert.doesNotMatch(detailed, /<option value="boxing"/);
  assert.match(detailed, /importReview\.suggestions\?\.map/);
});
