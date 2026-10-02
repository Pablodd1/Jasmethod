import { test } from "node:test";
import assert from "node:assert/strict";
import { supplementAllowed, SUPPLEMENT_DB, SPORT_PROTOCOLS } from "./supplement-db";
import { progressionAdvice, recommendErgogenics } from "./adaptive";
import { generateTrackSprint } from "./science";

test("supplement preferences: master switch, aliases and invalid saved data are respected", () => {
  assert.equal(supplementAllowed("caffeine", { enabled: false }), false);
  assert.equal(supplementAllowed("beta_alanine", { optsOut: '["betaAlanine"]' }), false);
  assert.equal(supplementAllowed("creatine", { dislikes: '["creatine_mono"]' }), false);
  assert.equal(supplementAllowed("caffeine", { optsOut: '{bad' }), false);
  assert.equal(supplementAllowed("caffeine", { optsOut: '{}' }), false);
  assert.equal(supplementAllowed("caffeine", { optsOut: '[42]' }), false);
  assert.equal(supplementAllowed("caffeine", { optsOut: '["creatine"]' }), true);
});

test("daily and catalogue recommendations cannot reintroduce brain-protection protocol", () => {
  assert.ok(SUPPLEMENT_DB.every(s => s.category !== "neuroprotection"));
  assert.ok(Object.values(SPORT_PROTOCOLS).flat().every(s => !/neuroprotec|brain protection/i.test(s.reason)));
  const result = recommendErgogenics({ enabled: true, likes: [], dislikes: [], optsOut: ["creatine_mono", "beta_alanine"] }, { sport: "boxing", type: "interval", durationMin: 60 });
  assert.ok(result.recommended.every(s => !["creatine", "betaAlanine", "dha"].includes(s.key)));
  assert.equal(new Set(result.recommended.map(s => s.key)).size, result.recommended.length);
});

test("one completed week does not establish three-week adaptation or authorize a dose change", () => {
  const result = progressionAdvice([{ weekStart: new Date("2026-09-21"), planned: 4, completed: 4 }]);
  assert.equal(result.status, "on_track");
  assert.match(result.message, /1 recorded week/);
  assert.doesNotMatch(result.message, /absorbing|last 3|pushes|auto-scales/);
  const missed = progressionAdvice([{ weekStart: new Date("2026-09-21"), planned: 4, completed: 1 }]);
  assert.equal(missed.status, "on_track");
  assert.match(missed.message, /Review missed/);
});

test("novice or unknown sprint experience never inherits maximal elite templates", () => {
  for (const level of ["beginner", "unknown", ""]) {
    const weeks = generateTrackSprint({ level, event: "400m", weeks: 12, startDate: new Date("2026-09-27") });
    assert.equal(weeks.length, 12);
    assert.ok(weeks.every(w => w.totalMinutes === 0 && w.sessions.every(s => s.sport === "recovery")));
    assert.match(weeks[0].sessions[0].description, /No automatic sprint dose/);
  }
});

import { personalizedDailyMotivation, dailyMotivation, MOTIVATION_LIBRARY } from "./reference";

test("daily encouragement is deterministic, personalized and disabled on request", () => {
  const context = { date: "2026-09-27", name: "Alex", goal: "5K", sessionTitle: "Easy run", checkinComplete: true };
  assert.deepEqual(personalizedDailyMotivation(context), personalizedDailyMotivation(context));
  assert.match(personalizedDailyMotivation(context)!.message, /Alex,.*Easy run.*5K/);
  assert.equal(personalizedDailyMotivation({ ...context, enabled: false }), null);
  assert.match(personalizedDailyMotivation({ ...context, rest: true })!.message, /Today is for recovery/);
  assert.match(personalizedDailyMotivation({ ...context, checkinComplete: false })!.message, /Complete your daily check-in/);
  assert.equal(personalizedDailyMotivation(context)!.source, "JMM coaching cue");
  assert.doesNotThrow(() => dailyMotivation(-1));
  assert.doesNotMatch(JSON.stringify(MOTIVATION_LIBRARY), /Pain is temporary|hours others spend sleeping|raise the bar|crawl if you have to/);
});

import { getEvidence } from "./evidence-registry";
test("study protocol cannot be presented as outcome evidence", () => {
  const source = getEvidence("beauregard-omega3-2025")!;
  assert.equal(source.PMID, "40273177");
  assert.equal(source.tier, "implementation_reference");
  assert.match(source.studyDesign, /study protocol/);
  assert.match(source.effect!, /No clinical efficacy results/);
  assert.doesNotMatch(source.limitations!, /EPA alone may interfere/);
});
