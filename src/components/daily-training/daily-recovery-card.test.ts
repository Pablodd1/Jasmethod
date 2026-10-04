import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DailyRecoveryCard, type DailyRecoveryView } from "../daily-recovery-card";

const rest: DailyRecoveryView = { mode: "planned-rest", allowMovement: true, safetyStatus: "clear", recoveryNeedsReview: false, noAdditionalTraining: true, optionalMovementMinutes: 20 };
const render = (recovery?: DailyRecoveryView | null, es = false, offline = false) => renderToStaticMarkup(React.createElement(DailyRecoveryCard, { recovery, es, offline }));

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
  assert.match(html, /Your daily recovery/);
  assert.match(html, /safety information is missing/);
  assert.match(html, /href="\/checkin"/);
  assert.doesNotMatch(html, /20 min|20 minutes/);
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
