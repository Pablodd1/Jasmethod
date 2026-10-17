import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { additionalStepInstruction, readableStepInstruction, stepExecutionGuide } from "./workout-execution-guide";
import { universalWorkoutExample } from "./universal-workout-example";
import { WorkoutIntervalDetails } from "../components/daily-training/UniversalWorkoutCard";

test("sport execution guidance preserves canonical units, endpoints and targets without fabricating measurements", () => {
  const original = universalWorkoutExample().session.steps[0];
  for (const [sport, target] of [["run", { type: "power", label: "220–240 W", low: 220, high: 240 }], ["bike", { type: "heartRate", label: "120–130 bpm", low: 120, high: 130 }], ["swim", { type: "pace", label: "1:45/100m", low: 1050, high: 1050 }], ["hyrox", { type: "open", label: "Open effort · RPE 5/10" }]] as const) {
    const step = { ...original, target: { ...target, source: "explicit" as const } };
    const before = JSON.stringify(step); const guide = stepExecutionGuide(step, sport);
    assert.equal(guide.target, target.label); assert.match(guide.effort, /RPE/); assert.equal(JSON.stringify(step), before);
    if (sport === "run") assert.match(guide.technique, /cycling FTP is not used/);
    if (sport === "swim") assert.match(guide.technique, /swim-specific/);
  }
});
test("execution detail renders instructions outside collapsed panels and preserves actual recovery count", () => {
  const card = universalWorkoutExample();
  const html = renderToStaticMarkup(createElement(WorkoutIntervalDetails, { card }));
  assert.match(html, /uwc-execution-instructions/); assert.match(html, /Start gently/); assert.match(html, /5 × 3 min/); assert.match(html, /4 × 3 min/);
  assert.match(html, /RPE 8\/10/); assert.match(html, /Recovery/);
  assert.doesNotMatch(html, /\[explicit\]|\[profile_reference\]|\[effort\]/);
  assert.equal(readableStepInstruction("active: Run · 300 s · 200 W [profile_reference] · Keep technique"), "Work: Run · 300 s · 200 W · Keep technique");
  assert.equal(additionalStepInstruction("active: Run · 300 s · 200 W [profile_reference] · Keep technique"), "Keep technique");
  assert.equal(additionalStepInstruction("warmup: Warm-up · 60 s [explicit]"), "");
  assert.equal(additionalStepInstruction("Warm-up · Z1 · Open effort · RPE 2/10 (effort guidance) · No validated benchmark is available."), "");
  assert.equal(additionalStepInstruction("Calentamiento · Z1 · RPE 2/10 (esfuerzo orientativo)"), "");
  assert.equal(additionalStepInstruction("Keep the prescribed stroke and the full recovery."), "Keep the prescribed stroke and the full recovery.");
  card.language = "es";
  const es = renderToStaticMarkup(createElement(WorkoutIntervalDetails, { card }));
  assert.match(es, /Empieza suave/); assert.match(es, /Recuperación/);
});
test("adjacent triathlon components with the same group name remain separate and labeled", () => {
  const card = universalWorkoutExample(); const step = card.session.steps[0];
  card.session.sport = "brick";
  card.session.steps = [{ ...step, group: "Main set", componentSport: "swim" }, { ...step, group: "Main set", componentSport: "bike" }, { ...step, group: "Main set", componentSport: "run" }];
  card.content.steps = ["", "", ""];
  const html = renderToStaticMarkup(createElement(WorkoutIntervalDetails, { card }));
  for (const sport of ["SWIM", "BIKE", "RUN"]) assert.match(html, new RegExp(`${sport} · .*?Main set`));
  assert.equal((html.match(/<article/g) ?? []).length, 3);
});
