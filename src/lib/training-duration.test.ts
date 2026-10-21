import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Decoder, Stream } from "@garmin/fitsdk";
import { canonicalSession } from "./canonical-session";
import { buildFitWorkout } from "./fit-export";
import { endpointText } from "./universal-workout-card";
import { buildUniversalWorkoutCard } from "./universal-workout-card-server";
import { renderUniversalWorkoutSvg } from "./universal-workout-render";
import { manualWorkoutEmailContent, manualWorkoutCalendarDescription } from "./manual-workout-email-content";
import { calendarDescription, gmailPlanHtml, stepEndpointLabel, telegramPlan } from "./plan-formats";
import { endpointLabel } from "../components/daily-training/training-contract";
import { UniversalWorkoutCard } from "../components/daily-training/UniversalWorkoutCard";
import { savedTrainingReply } from "./coach-saved-training";
import { buildCoachReply } from "./coach-conversation";

const cases = [[2700, "45 min"], [180, "3 min"], [90, "1 min 30 sec"], [30, "30 sec"], [15, "15 sec"], [90.5, "1 min 30.5 sec"], [60.001, "1 min 0.001 sec"]] as const;
function session() {
  const steps = cases.slice(0, 5).map(([seconds], i) => ({ name: `Step ${i + 1}`, seconds, endpoint: { type: "time", seconds }, phase: "active", zone: "z2", target: { type: "open" } }));
  const durationMin = steps.reduce((sum, step) => sum + step.seconds, 0) / 60;
  return canonicalSession({ athleteId: "synthetic-athlete", workout: { id: "synthetic-session", userId: "synthetic-athlete", title: "Synthetic easy session", sport: "run", durationMin },
    prescription: { sport: "run", durationMin, verdict: "full", steps }, dateLocal: "2026-10-21", timezone: "UTC" });
}

test("one endpoint formatter preserves precise short intervals, whole minutes, unknowns and display-only conversion", () => {
  for (const [seconds, label] of cases) {
    const step = { seconds, name: "Work", zone: "z2", endpoint: { type: "time" as const, seconds } };
    const before = JSON.stringify(step);
    assert.equal(endpointText(step), label);
    assert.equal(endpointLabel(step.endpoint), label);
    assert.equal(stepEndpointLabel(step), label);
    assert.equal(JSON.stringify(step), before);
  }
  assert.equal(endpointText({ endpoint: { type: "time", seconds: 1.1 * 60 } }), "1 min 6 sec");
  assert.equal(endpointText({ endpoint: { type: "time", seconds: 0 } }), "0 min");
  assert.equal(endpointText({ endpoint: { type: "time", seconds: NaN } }), "—");
  assert.equal(endpointText({ endpoint: { type: "time", seconds: 90.5 } }, "es"), "1 min 30,5 s");
  assert.equal(endpointLabel({ type: "time", seconds: 90 }, true, "run", "es"), "1 min 30 s");
  assert.equal(endpointLabel(undefined), "Endpoint unavailable");
  assert.equal(stepEndpointLabel({ name: "Lengths", zone: "z2", seconds: 2700, endpoint: { type: "distance", meters: 400 } }), "400 m");
  assert.equal(endpointText({ endpoint: { type: "reps", reps: 8 } }), "8 reps");
});

test("card, email, calendar and export previews render the same durations and preserve canonical/FIT seconds", () => {
  const current = session(), before = JSON.stringify(current);
  const created = new Date("2026-10-21T12:00:00Z"), fitBefore = buildFitWorkout(current, created);
  for (const language of ["en", "es"] as const) {
    const card = buildUniversalWorkoutCard(current, null, language);
    const plan = manualWorkoutEmailContent(current, null, null, false, language).plan;
    const calendar = manualWorkoutCalendarDescription(current, null, null, language);
    const svg = renderUniversalWorkoutSvg(card);
    const prior = (globalThis as any).React; (globalThis as any).React = React;
    let html: string;
    try { html = renderToStaticMarkup(React.createElement(UniversalWorkoutCard, { card })); } finally { (globalThis as any).React = prior; }
    for (const [seconds, expected] of cases.slice(0, 5)) {
      const label = language === "es" ? expected.replace("sec", "s") : expected;
      for (const surface of [plan.steps.join(" "), calendar, svg, html!]) assert.ok(surface.includes(label), `${language}: ${seconds} seconds missing from display`);
    }
    assert.ok(plan.summary.includes("50 min 15"));
    assert.doesNotMatch(plan.steps.join(" "), /2700 (?:s|sec)|180 (?:s|sec)|90 (?:s|sec)/);
  }
  assert.equal(JSON.stringify(current), before);
  assert.deepEqual(buildFitWorkout(current, created), fitBefore);
  const decoded = new Decoder(Stream.fromByteArray(fitBefore)).read();
  assert.deepEqual(decoded.errors, []);
  assert.deepEqual(decoded.messages.workoutStepMesgs!.map((step: any) => step.durationTime), [2700, 180, 90, 30, 15]);
});

test("Telegram, legacy email and calendar summaries share the formatter for every long and short interval", () => {
  for (const [seconds, label] of cases.slice(0, 5)) {
    const saved = { title: "Synthetic session", sport: "run", durationMin: seconds / 60, steps: [{ name: "Work", seconds, zone: "z2", phase: "active" as const }] };
    for (const output of [telegramPlan("Synthetic athlete", "Today", [saved]), gmailPlanHtml("Synthetic athlete", "Today", [saved]).html, calendarDescription(saved)]) assert.ok(output.includes(label), `${seconds} seconds missing`);
  }
});

test("calendar UI duration adapter and coach saved/actual readouts preserve fractions and real zero", () => {
  const source = fs.readFileSync("src/app/calendar/page.tsx", "utf8");
  const compiled = ts.transpileModule(`${source}\nexport { fmtMin as durationForTest };`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  const mod = { exports: {} as any };
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require: (id: string) => id === "@/lib/universal-workout-card" ? { endpointText } : {}, React });
  assert.equal(mod.exports.durationForTest(45), "45 min");
  assert.equal(mod.exports.durationForTest(1.5), "1 min 30 sec");
  assert.equal(mod.exports.durationForTest(0), "0 min");
  for (const language of ["en", "es"] as const) {
    const label = language === "es" ? "1 min 30 s" : "1 min 30 sec";
    const context = { localToday: "2026-10-21", language, savedTodaySessions: [{ date: "2026-10-21", title: "Synthetic run", sport: "run", durationMin: 1.5, completed: false }] };
    assert.ok(savedTrainingReply("Show my workout", context)?.answer.includes(label));
    const latest = buildCoachReply("How was my last workout?", { ...context, recentFeedback: [{ date: "2026-10-21", feedbackStatus: "completed", actualDurationMin: 1.5, rpe: 2 }] });
    assert.ok(latest.answer.includes(label));
  }
});
