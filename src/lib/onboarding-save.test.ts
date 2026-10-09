import test from "node:test";
import assert from "node:assert/strict";
import { onboardingSectionPayload as payload } from "./onboarding-save";

const saved = { profile: { weightKg: 70, ftp: 200, experience: "beginner", weeklyHours: 4 }, setup: { profileConfirmed: true, goalDescription: "Saved goal", restrictions: "none", travel: { destinationTimezone: "Europe/London" } } };
const draft = { birthYear: "1990", sex: "", heightCm: "180", weightKg: "99", ftp: "400", lthr: "160", maxHr: "190", runPaceBase: "300", swimPaceBase: "120", experience: "pro", goal: "hyrox", weeklyHours: "20" };
const draftSetup = { profileConfirmed: true, goalDescription: "Unsaved goal", restrictions: "present", travel: { destinationTimezone: "Asia/Tokyo" } };

test("profile and zone saves exclude every unrelated draft and never rewrite setup", () => {
  assert.deepEqual(payload("profile", draft, draftSetup, saved, "s1"), { birthYear: "1990", sex: null, heightCm: "180", weightKg: "99" });
  assert.deepEqual(payload("zones", draft, draftSetup, saved, "s1"), { ftp: "400", lthr: "160", maxHr: "190", runPaceBase: "300", swimPaceBase: "120" });
});

test("skip edited profile and goals then save travel sends only scoped travel context", () => {
  const result = payload("travel", draft, draftSetup, saved, "s1");
  assert.deepEqual(result, { setupSection: "travel", setup: { travel: draftSetup.travel }, expectedSetupRevision: "s1" });
  assert.equal("weightKg" in result, false);
  assert.equal("ftp" in result, false);
  assert.equal(saved.setup.goalDescription, "Saved goal");
});

test("goal save preserves stored travel while excluding skipped profile/zone drafts", () => {
  assert.deepEqual(payload("goals", draft, draftSetup, saved, "s1"), { experience: "pro", goal: "hyrox", weeklyHours: "20", setup: { ...draftSetup, profileAnswers: { experience: true, weeklyHours: true }, travel: saved.setup.travel }, expectedSetupRevision: "s1" });
});

test("first travel save does not promote unsaved planning answers or profile defaults", () => {
  assert.deepEqual(payload("travel", draft, draftSetup, { profile: {}, setup: null }, null), { setupSection: "travel", setup: { travel: draftSetup.travel }, expectedSetupRevision: null });
  assert.deepEqual(payload("travel", draft, { travel: null }, saved, "s2"), { setupSection: "travel", setup: { travel: null }, expectedSetupRevision: "s2" });
});


test("saved unconfirmed answers have explicit presence and untouched defaults stay unconfirmed", () => {
  const result = payload("goals", {experience:"advanced",weeklyHours:"5",goal:"cycle"}, {profileConfirmed:false}, {profile:{},setup:null}, null);
  assert.deepEqual((result.setup as Record<string,unknown>).profileAnswers,{experience:true,weeklyHours:true});
  const blank = payload("goals", {experience:"",weeklyHours:"",goal:""}, {}, {profile:{},setup:null}, null);
  assert.deepEqual((blank.setup as Record<string,unknown>).profileAnswers,{experience:false,weeklyHours:false});
  assert.equal("experience" in blank,false);
  assert.equal("weeklyHours" in blank,false);
});

test("an unchanged legacy goal is not erased or resubmitted as a new unsupported goal", () => {
  const result = payload("goals", {experience:"advanced",weeklyHours:"5",goal:"boxing"}, {}, {profile:{goal:"boxing"},setup:null}, null);
  assert.equal("goal" in result,false);
  const changed = payload("goals", {experience:"advanced",weeklyHours:"5",goal:"run-only"}, {}, {profile:{goal:"boxing"},setup:null}, null);
  assert.equal(changed.goal,"run-only");
});
