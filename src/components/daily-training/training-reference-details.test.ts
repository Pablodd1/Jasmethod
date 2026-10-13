import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DailyTrainingScreen, TrainingReferenceDetails } from "./DailyTrainingScreen";
import type { DailyTraining } from "./training-contract";
import { universalWorkoutExample } from "../../lib/universal-workout-example";

function fixture(): DailyTraining {
  const plan = JSON.parse(readFileSync("src/components/daily-training/sample-session.json", "utf8"));
  plan.session.sport = "run";
  plan.language = "en";
  plan.session.calories = { kcal: null, method: "none", asOf: null, missingReason: "No energy expenditure measurement is available" };
  plan.profile.paces['5k'] = { secondsPerMile: 420, measuredAt: null, status: "estimated", note: "Formula-derived planning reference, not a measured personal best or a race prediction." };
  return plan;
}
function render(element: React.ReactElement) {
  const prior = (globalThis as any).React;
  (globalThis as any).React = React;
  try { return renderToStaticMarkup(element); } finally { (globalThis as any).React = prior; }
}

test("supplemental references remain closed and disclose formula provenance and unknown energy", () => {
  const html = render(React.createElement(TrainingReferenceDetails, { plan: fixture() }));
  assert.match(html, /Training references, density &amp; energy/);
  assert.doesNotMatch(html, /<details[^>]*\bopen/);
  for (const text of [/5K/, /10K/, /Half marathon/, /Marathon/, /estimated/, /not a measured personal best/, /No energy expenditure measurement/]) assert.match(html, text);
  assert.doesNotMatch(html, /<svg|1000 kcal/);
});

test("wearable energy is not marked estimated and held cards explain their zero executable duration", () => {
  const plan = fixture(); plan.session.calories = { kcal: 400, method: "wearable", asOf: "2026-10-12", missingReason: null };
  let html = render(React.createElement(TrainingReferenceDetails, { plan }));
  assert.match(html, /400 kcal/); assert.doesNotMatch(html, /~400/);
  plan.session.calories.method = "estimate";
  assert.match(render(React.createElement(TrainingReferenceDetails, { plan })), /~400 kcal/);
  plan.session.verdict = "blocked"; plan.session.totalMinutes = 0;
  html = render(React.createElement(TrainingReferenceDetails, { plan }));
  assert.match(html, /no executable prescription/); assert.doesNotMatch(html, /7 \/ 10/);
});

test("non-running sessions keep running race paces hidden and canonical missing-target reasons remain visible", () => {
  const plan = fixture(); plan.session.sport = "bike"; plan.workoutCard = universalWorkoutExample();
  plan.workoutCard.session.steps[0].target.missingReason = "No validated cycling power reference is available";
  const html = render(React.createElement(TrainingReferenceDetails, { plan }));
  assert.match(html, /No validated cycling power reference/);
  assert.match(html, /Running race-pace references do not apply/);
  assert.doesNotMatch(html, /Half marathon|Formula-derived/);
});

test("both card variants render supplemental references once without replacing the universal card", () => {
  for (const universal of [false, true]) {
    const plan = fixture(); if (universal) plan.workoutCard = universalWorkoutExample();
    const html = render(React.createElement(DailyTrainingScreen, { plan, onFocusReady: async () => {}, onCompletion: async () => {} }));
    assert.equal((html.match(/data-training-references="true"/g) || []).length, 1);
    if (universal) { assert.match(html, /THE FLOW/); assert.doesNotMatch(html, /Session map|Your workout, step by step/); }
  }
});

test("training calendar uses authored live card today and read-only previews otherwise, preserving unknown intensity", () => {
  const source = readFileSync("src/app/training/page.tsx", "utf8");
  assert.ok(source.includes('import "@/components/daily-training/universal-workout-card.css"'));
  assert.doesNotMatch(source, /workoutDetail|WorkoutStructure|intensity: s.intensity \|\| "z2"/);
  assert.match(source, /new Date\(day.date\).*?=== dateKey\(new Date\(\), user\?\.timezone\).*?UniversalWorkoutCardLoader.*?: <SavedWorkoutPreviewCard/);
  assert.match(source, /\.\.\.\(f.intensity \? \{ intensity: f.intensity \} : \{\}\)/);
  assert.match(source, /intensity: s.intensity \|\| ""/);
  assert.match(source, /Unchanged \/ unknown/);
  assert.match(source, /aria-expanded=\{isExpanded\}/);
});
