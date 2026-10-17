import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { stepExecutionGuide } from "./workout-execution-guide";
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
  card.language = "es";
  const es = renderToStaticMarkup(createElement(WorkoutIntervalDetails, { card }));
  assert.match(es, /Empieza suave/); assert.match(es, /Recuperación/);
});
