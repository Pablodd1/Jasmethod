import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React, { createElement } from "react";
import { universalWorkoutExample } from "./universal-workout-example";
import { UniversalWorkoutCard } from "../components/daily-training/UniversalWorkoutCard";
import { ActivityAnalysisCard, StoredStreamsPanel, StreamConsentCheckbox } from "../components/activity-streams";
import { applyIntervalPatch, parseIntervalRequest, summarizeSet, toEditableSteps } from "./workout-interval-edit";
import { parseWorkoutCardEdit } from "./workout-card-edit";
import { DailyTrainingScreen } from "../components/daily-training/DailyTrainingScreen";
import dailySample from "../components/daily-training/sample-session.json";

function html(element: React.ReactElement): string {
  const previous = (globalThis as any).React;
  (globalThis as any).React = React;
  try { return renderToStaticMarkup(element); } finally { (globalThis as any).React = previous; }
}

test("actual-workout reporting remains understandable in both languages without changing stored field values", () => {
  for (const lang of ["en", "es"] as const) {
    const plan = { ...dailySample, language: lang, workoutCard: universalWorkoutExample(lang) };
    const text = html(createElement(DailyTrainingScreen, { plan: plan as any, onFocusReady: async () => {}, onCompletion: async () => {} }));
    assert.match(text, lang === "es" ? /Cuéntanos cómo fue/ : /Close the loop/);
    assert.match(text, lang === "es" ? /Guardar comentario del entrenamiento/ : /Save workout feedback/);
    assert.match(text, /value="completed"/);
    assert.match(text, /value="unknown"/);
  }
});

test("the interval coach editor is part of the editable card, in EN and ES", () => {
  for (const [lang, title] of [["en", "Change intervals with your coach"], ["es", "Cambiar intervalos con tu coach"]] as const) {
    const card = universalWorkoutExample(lang);
    const withEditor = html(createElement(UniversalWorkoutCard, { card, onSaved: () => {} }));
    assert.match(withEditor, /data-testid="interval-coach-editor"/);
    assert.match(withEditor, new RegExp(title));
    assert.equal(html(createElement(UniversalWorkoutCard, { card })).includes("interval-coach-editor"), false, "read-only card has no editor");
  }
});

test("a held (non-ready) card offers no interval editing", () => {
  const card = universalWorkoutExample("en");
  const held = { ...card, session: { ...card.session, verdict: "blocked" as const, steps: [] } } as typeof card;
  assert.equal(html(createElement(UniversalWorkoutCard, { card: held, onSaved: () => {} })).includes("interval-coach-editor"), false);
});

test("real session fixture (56 min, 5 × 5K efforts): reductions apply, additions over the time budget are refused, output passes the save route's validation", () => {
  const card = universalWorkoutExample("en");
  const steps = toEditableSteps(card.session.steps as any);
  const before = summarizeSet(steps)!;
  assert.equal(before.repeats, 5, "the 4 strides are a separate set; the 5 × 3 min efforts are the main set");
  assert.equal(before.workSeconds, 180);
  const budget = card.session.durationMin * 60;

  const fewer = applyIntervalPatch(steps, { repeatsDelta: -1 }, { budgetSeconds: budget, intensityCapZone: null });
  assert.equal(fewer.ok, true);
  if (fewer.ok) {
    assert.equal(fewer.after.repeats, 4);
    assert.equal(fewer.requiresConfirmation, false);
    const edit = parseWorkoutCardEdit({ id: card.session.id, expectedRevision: "a".repeat(64), steps: fewer.steps }, card.session.sport as "run" | "bike");
    assert.equal(edit.seconds, fewer.after.totalSeconds);
  }
  const more = applyIntervalPatch(steps, { repeatsDelta: 1 }, { budgetSeconds: budget, intensityCapZone: 5 });
  assert.equal(more.ok === false && more.code, "exceeds_time_budget");
  const parsed = parseIntervalRequest("quita un intervalo");
  assert.equal(parsed.ok, true);
});

test("analysis card, consent checkbox and deletion panel: wording, defaults and visibility", () => {
  const consentEn = html(createElement(StreamConsentCheckbox, { lang: "en", retentionDays: 180, checked: false, onChange: () => {} }));
  assert.doesNotMatch(consentEn, /checked/);
  assert.match(consentEn, /No GPS is stored/);
  assert.match(consentEn, /Strava-origin activities are never stored/);
  assert.match(consentEn, /180 days/);
  const consentEs = html(createElement(StreamConsentCheckbox, { lang: "es", retentionDays: 90, checked: false, onChange: () => {} }));
  assert.match(consentEs, /No se guarda GPS/);
  assert.match(consentEs, /90 días/);

  const off = html(createElement(StoredStreamsPanel, { lang: "en", status: { enabled: false, retentionDays: null, workoutIds: [] }, reload: () => {}, recentIds: ["w1"] }));
  assert.equal(off, "", "nothing is shown when storage is disabled");
  const on = html(createElement(StoredStreamsPanel, { lang: "en", status: { enabled: true, retentionDays: 180, workoutIds: ["w1", "w2"] }, reload: () => {}, recentIds: [] }));
  assert.match(on, /Delete all my second-by-second data/);
  assert.match(on, /Stored for 2 activities/);
  const none = html(createElement(StoredStreamsPanel, { lang: "es", status: { enabled: true, retentionDays: 180, workoutIds: [] }, reload: () => {}, recentIds: [] }));
  assert.doesNotMatch(none, /Borrar todos/);
  assert.match(html(createElement(ActivityAnalysisCard, { workoutId: "w1", lang: "en" })), /Analysing/);
});


test("interval commands explain held, unsupported-sport and non-time sessions without offering writes",()=>{
  for(const lang of ["en","es"] as const){
    const card=universalWorkoutExample(lang);
    for(const patch of [{verdict:"blocked",steps:[]},{sport:"swim"},{steps:[{...card.session.steps[0],endpoint:{type:"distance",meters:100}}]},{steps:[]}]){
      const text=html(createElement(UniversalWorkoutCard,{card:{...card,session:{...card.session,...patch}} as any,onSaved:()=>{}}));
      assert.match(text,/data-testid="interval-coach-unavailable"/);assert.doesNotMatch(text,/data-testid="interval-coach-editor"/);
    }
  }
});
