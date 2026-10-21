import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DailyRecoveryCard, type DailyRecoveryView } from "../daily-recovery-card";

const rest: DailyRecoveryView = { mode: "planned-rest", allowMovement: true, safetyStatus: "clear", recoveryNeedsReview: false, noAdditionalTraining: true, optionalMovementMinutes: 20 };
const render = (recovery?: DailyRecoveryView | null, es = false, offline = false) => renderToStaticMarkup(React.createElement(DailyRecoveryCard, { recovery, es, offline }));

test("current scoped review shows daily support without asking the same selected session's full scales again",()=>{
  const scoped={...rest,mode:"training" as const,safetyStatus:"unknown" as const,allowMovement:false,optionalMovementMinutes:null,reviewedSessionId:"selected"};
  const html=render(scoped);assert.match(html,/Only the selected easy session/);assert.match(html,/Subjective scales remain unanswered/);assert.doesNotMatch(html,/Check-in needed|not yet cleared to follow/);
  assert.match(render({...scoped,mode:"review-needed"}),/Review training/);assert.match(render(scoped,false,true),/Reconnect and update/);
});

test("Planned recovery remains visible without a workout and allows only explicitly cleared optional movement", () => {
  const html = render(rest);
  assert.match(html, /Recovery day/);
  assert.match(html, /up to 20 min very easy Z1/);
  assert.match(html, /Complete rest is valid/);
  assert.match(html, /not a no-training rest day for J Metrics/);
  assert.match(html, /creates no workout and marks nothing completed/);
  assert.doesNotMatch(html, /<button|<form|<input/);
  assert.match(html, /href="\/calendar"/);
});

test("Hold, urgent, unknown, low-recovery and offline states never offer the movement dose", () => {
  for (const recovery of [
    { ...rest, mode: "hold" as const },
    { ...rest, safetyStatus: "hold" as const },
    { ...rest, safetyStatus: "urgent" as const },
    { ...rest, safetyStatus: "unknown" as const },
    { ...rest, recoveryNeedsReview: true },
    { ...rest, allowMovement: false },
    { ...rest, optionalMovementMinutes: null },
  ]) {
    const html = render(recovery);
    assert.doesNotMatch(html, /20 min|20 minutes/);
    assert.doesNotMatch(html, /Log actual activity/);
  }
  assert.doesNotMatch(render(rest, false, true), /20 min|20 minutes/);
  assert.match(render(rest, false, true), /Reconnect and update your check-in/);
  assert.match(render({ ...rest, safetyStatus: "unknown" }), /href="\/checkin"/);
});

test("Training and easy days get daily recovery choices without additional exercise or false rest-day prescription", () => {
  for (const mode of ["training", "easy-day"] as const) {
    const html = render({ ...rest, mode });
    assert.match(html, /add no exercise to your reviewed training/);
    assert.doesNotMatch(html, /20 min|20 minutes|No workout is prescribed/);
    for (const topic of ["Protect sleep", "Eat and hydrate", "Optional meditation", "Life demands count too", "VISUALIZATION"]) assert.ok(html.includes(topic), topic);
  }
});

test("Unavailable recovery input shows unknown state and links check-in without inventing clearance", () => {
  const html = render(null);
  assert.match(html, /Check-in needed/);
  assert.match(html, /not yet cleared to follow/);
  assert.match(html, /href="\/checkin"/);
  assert.doesNotMatch(html, /20 min|20 minutes/);
});

test("missing readiness gets a compact check-in notice above the saved plan instead of a recovery prescription", () => {
  for (const es of [false, true]) {
    const html = render({ ...rest, mode: "checkin-needed", safetyStatus: "unknown", allowMovement: false, optionalMovementMinutes: null }, es);
    assert.match(html, es ? /Falta el check-in/ : /Check-in needed/);
    assert.match(html, es ? /entrenamiento guardado/ : /saved workout/);
    assert.match(html, /href="\/checkin"/);
    assert.doesNotMatch(html, /<details|<h3|20 min|training on hold|entrenamiento en pausa|VISUALIZATION|Visualización opcional/);
    assert.ok(html.length < 1500);
  }
  const offline = render({ ...rest, mode: "training" }, false, true);
  assert.match(offline, /Reconnect and update your check-in/);
  assert.doesNotMatch(offline, /<details|<h3/);
});

test("a canonical block with answered safety questions shows review guidance without medical or rest claims", () => {
  for (const es of [false, true]) {
    const html = render({ ...rest, mode: "review-needed", safetyStatus: "clear", allowMovement: false, optionalMovementMinutes: null }, es);
    assert.match(html, es ? /Revisar entrenamiento/ : /Review training/);
    assert.match(html, es ? /no anula un bloqueo pendiente/ : /does not override an unresolved block/);
    assert.match(html, /href="\/checkin"/);
    assert.doesNotMatch(html, /<details|<h3|20 min|training on hold|entrenamiento en pausa|Recovery day/);
    assert.ok(html.length < 1500);
  }
});

test("Spanish recovery includes safety limits, optional mental rehearsal and inspectable sources", () => {
  const html = render({ ...rest, mode: "hold", safetyStatus: "urgent" }, true);
  assert.match(html, /entrenamiento en pausa/);
  assert.match(html, /No se ofrece ejercicio/);
  assert.match(html, /Visualización opcional paso a paso/);
  assert.match(html, /href="https:\/\/pubmed.ncbi.nlm.nih.gov\//);
  assert.match(html, /href="\/science"/);
  assert.doesNotMatch(html, /20 min|20 minutos/);
});

test("Urgent recovery provides an immediate safety alert without requiring a workout card", () => {
  const recovery: DailyRecoveryView = { ...rest, mode: "hold", safetyStatus: "urgent", allowMovement: false, optionalMovementMinutes: null };
  const en = render(recovery);
  assert.match(en, /role="alert"[^>]*>Stop exercise\./);
  assert.match(en, /contact local emergency services now/);
  assert.match(en, /not a diagnosis or clearance to resume training/);
  const es = render(recovery, true);
  assert.match(es, /role="alert"[^>]*>Detén el ejercicio\./);
  assert.match(es, /contacta ahora con los servicios de emergencia locales/);
  assert.match(es, /no es un diagnóstico ni autorización para volver a entrenar/);
  assert.doesNotMatch(en + es, /20 min|20 minutes|20 minutos/);
});
