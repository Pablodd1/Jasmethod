import test from "node:test";
import assert from "node:assert/strict";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { savedWorkoutPreview } from "./saved-workout-preview";
import { isSavedWorkoutPreview, validSavedSessionId } from "./saved-workout-preview-contract";
import { fetchSavedWorkoutPreview, savedPreviewPresentation } from "./saved-workout-preview-client";
import { evidencedTargetProfile } from "./anchor-evidence";
import { isUniversalWorkoutCard } from "./universal-workout-card";
import { SavedWorkoutPreviewView, SavedWorkoutPreviewCard } from "../components/daily-training/SavedWorkoutPreviewCard";

const step = { name: "Saved block", phase: "active", zone: "z2", seconds: 600 };
const workout = { id: "synthetic", userId: "athlete-a", planned: true, sport: "bike", date: "2026-10-13T12:00:00Z", title: "Saved ride", durationMin: 10,
  prescription: JSON.stringify({ sport: "bike", durationMin: 10, steps: [step] }) };
const preview = () => savedWorkoutPreview(workout, "athlete-a", "UTC");

test("saved preview projects stored structure without executable metadata or invented nutrition", () => {
  const p = savedWorkoutPreview(workout, "athlete-a", "UTC", { ftp: 200 });
  assert.equal(p.available, true);
  assert.equal(isSavedWorkoutPreview(p), true);
  assert.equal(p.session?.steps.length, 1);
  assert.match(p.session!.steps[0].target.label, /150 W/);
  assert.match(p.reason, /does not confirm/);
  assert.doesNotMatch(JSON.stringify(p), /"(?:capability|verdict|revision|athleteId|nutrition|breathing|delivery|sourceRevision)":/);
  const card = savedPreviewPresentation(p, false)!;
  assert.equal(card.session.verdict, "blocked");
  assert.equal(card.session.capability.available, false);
  assert.equal(card.session.revision, "");
  assert.equal(card.nutrition, null);
  assert.deepEqual(card.content.before, []);
  assert.equal(isUniversalWorkoutCard(card), false);
});

test("malformed, other-athlete, non-plan, off-day, and injury restrictions fail closed", () => {
  for (const [w, id, profile] of [
    [null, "athlete-a", null], [[], "athlete-a", null],
    [{ ...workout, prescription: null }, "athlete-a", null],
    [{ ...workout, prescription: "garbage" }, "athlete-a", null],
    [{ ...workout, date: "not-a-date" }, "athlete-a", null],
    [{ ...workout, planned: false }, "athlete-a", null],
    [{ ...workout, userId: undefined }, "athlete-a", null],
    [workout, "athlete-b", null],
    [{ ...workout, planDay: { dayOff: true } }, "athlete-a", null],
    [{ ...workout, dayOff: true }, "athlete-a", null],
    [workout, "athlete-a", { injured: true }],
    [{ ...workout, durationMin: 0 }, "athlete-a", null],
  ] as const) {
    const p = savedWorkoutPreview(w, id, "UTC", profile);
    assert.equal(p.available, false); assert.equal(p.session, null);
    assert.equal(savedPreviewPresentation(p, false), null);
  }
  assert.equal(savedWorkoutPreview(workout, "athlete-a", "Bad/Timezone").available, false);
  for (const prescription of [
    { detail: { main: "Ride 10 minutes at 150 W" }, durationMin: 10 },
    { steps: [step], durationMin: 11 },
    { steps: [{ ...step, seconds: -1 }] },
    { steps: [{ ...step, target: { type: "power", low: 300, high: 200 } }] },
    { steps: [step], verdict: "rest" },
    { steps: [step], verdict: "unknown" },
    { steps: [step], sport: "run" },
  ]) assert.equal(savedWorkoutPreview({ ...workout, prescription }, "athlete-a", "UTC").available, false);
});

test("missing, stale, unapplied, and sport-ambiguous anchors leave numeric targets unknown", () => {
  const now = new Date("2026-10-12T12:00:00Z");
  const base = { id: "benchmark", date: now, type: "ftp", result: 200, completed: true, skipped: false };
  for (const profile of [
    null,
    evidencedTargetProfile({ ftp: 200, lthr: 170 }, [], [], now),
    evidencedTargetProfile({ ftp: 200 }, [base], [], now),
    evidencedTargetProfile({ ftp: 200 }, [{ ...base, date: new Date("2020-01-01") }], [base.id], now),
    evidencedTargetProfile({ ftp: 250 }, [base], [base.id], now),
    evidencedTargetProfile({ lthr: 170 }, [{ ...base, type: "lthr", result: 170 }], [base.id], now),
  ]) {
    const p = savedWorkoutPreview(workout, "athlete-a", "UTC", profile);
    assert.equal(p.session?.steps[0].target.type, "open");
    assert.equal(p.session?.steps[0].target.high, undefined);
    assert.match(p.session!.steps[0].target.missingReason!, /No validated/);
    assert.match(savedPreviewPresentation(p, false)!.content.steps[0], /No validated/);
  }
  const validated = evidencedTargetProfile({ ftp: 200 }, [base], [base.id], now);
  assert.equal(savedWorkoutPreview(workout, "athlete-a", "UTC", validated).session?.steps[0].target.high, 150);
});

test("explicit HR, distance/reps endpoints, and authored repeated intervals remain intact", () => {
  const hr = savedWorkoutPreview({ ...workout, prescription: { steps: [{ ...step, target: { type: "heartRate", low: 120, high: 140 } }] } }, "athlete-a", "UTC");
  assert.deepEqual(hr.session?.steps[0].target, { type: "heartRate", low: 120, high: 140, label: "120–140 bpm", source: "explicit" });
  for (const endpoint of [{ type: "distance", meters: 2000 }, { type: "reps", reps: 12 }, { type: "lap" }]) {
    const p = savedWorkoutPreview({ ...workout, prescription: { steps: [{ ...step, endpoint }] } }, "athlete-a", "UTC");
    assert.equal(p.available, true); assert.equal(p.session?.exactTimeSeconds, null);
    assert.deepEqual(p.session?.steps[0].endpoint, endpoint);
  }
  const p = savedWorkoutPreview({ ...workout, prescription: { steps: [{ repeat: 5, steps: [{ ...step, seconds: 120 }] }] } }, "athlete-a", "UTC");
  assert.equal(p.session?.steps.length, 5); assert.equal(p.session?.exactTimeSeconds, 600);
});

test("arbitrary step names retain localized phases and target provenance, including brick sports", () => {
  const named = { ...workout, prescription: { steps: [
    { ...step, name: "A", phase: "warmup", seconds: 150, target: { type: "open" } },
    { ...step, name: "B", phase: "active", seconds: 150 },
    { ...step, name: "C", phase: "recovery", seconds: 150, target: { type: "heartRate", low: 100, high: 120 } },
    { ...step, name: "D", phase: "cooldown", seconds: 150 },
  ] } };
  const p = savedWorkoutPreview(named, "athlete-a", "UTC", { ftp: 200 });
  const en = savedPreviewPresentation(p, false)!;
  assert.match(en.content.steps[0], /Warm-up.*saved explicit target/);
  assert.match(en.content.steps[1], /Main effort.*profile-derived reference/);
  assert.match(en.content.steps[2], /Recovery.*saved explicit target/);
  assert.match(en.content.steps[3], /Cool-down/);
  const es = savedPreviewPresentation(p, true)!;
  assert.match(es.content.steps[0], /Calentamiento.*objetivo explícito guardado/);
  assert.match(es.content.steps[1], /Trabajo principal.*referencia derivada del perfil/);
  assert.match(es.content.steps[2], /Recuperación/); assert.match(es.content.steps[3], /Vuelta a la calma/);
  assert.match(savedPreviewPresentation(preview(), false)!.content.steps[0], /effort guidance/);
  const brick = savedWorkoutPreview({ ...workout, sport: "brick", durationMin: 2, prescription: { durationMin: 2, sportStructure: {
    schemaVersion: 1, kind: "brick", components: [
      { id: "a", title: "First", sport: "bike", durationMin: 1, steps: [{ ...step, name: "A", seconds: 60 }] },
      { id: "b", title: "Second", sport: "run", durationMin: 1, steps: [{ ...step, name: "B", seconds: 60 }] },
    ], transitions: [{ afterComponentId: "a", instruction: "Change shoes", endpoint: { type: "lap" } }],
  } } }, "athlete-a", "UTC");
  assert.equal(brick.available, true);
  assert.deepEqual(brick.session!.steps.map(s => s.componentSport), ["bike", undefined, "run"]);
  assert.match(savedPreviewPresentation(brick, false)!.content.steps.join(" "), /Component: Bike.*Component: Run/);
  assert.match(savedPreviewPresentation(brick, true)!.content.steps.join(" "), /Componente: Ciclismo.*Componente: Carrera/);
});

test("preview DTO strictly rejects malformed fields, coercion, mismatched totals, and execution fields", () => {
  const edit = (mutate: (p: any) => void) => { const p = structuredClone(preview()); mutate(p); assert.equal(isSavedWorkoutPreview(p), false); };
  for (const key of ["sport", "title", "timezone", "dateLocal"]) edit(p => { p.session[key] = [p.session[key]]; });
  for (const key of ["phase", "zone", "name"]) edit(p => { p.session.steps[0][key] = [p.session.steps[0][key]]; });
  for (const key of ["type", "source", "label"]) edit(p => { p.session.steps[0].target[key] = [p.session.steps[0].target[key]]; });
  edit(p => { p.session.steps[0].target = { type: "swimStroke", source: "explicit", label: "freestyle", stroke: ["freestyle"] }; });
  for (const sport of [["bike"], "invented", null, 1]) edit(p => { p.session.steps[0].componentSport = sport; });
  edit(p => { p.session.steps[0].endpoint = { type: ["time"], seconds: 600 }; });
  edit(p => { p.session.steps[0].seconds = "600"; });
  edit(p => { p.session.steps[0].seconds = Infinity; });
  edit(p => { p.session.steps[0].target = { type: "heartRate", source: "explicit", label: "bad", low: 150, high: 100 }; });
  edit(p => { p.session.steps[0].target = { type: "power", source: "explicit", label: "bad", low: 100.5, high: 150 }; });
  edit(p => { p.session.steps[0].endpoint.seconds = 601; });
  edit(p => { p.session.exactTimeSeconds = 601; });
  edit(p => { p.session.durationMin = 11; });
  edit(p => { p.session.dateLocal = "2026-02-31"; });
  edit(p => { p.session.timezone = "Bad/Timezone"; });
  edit(p => { p.available = false; });
  edit(p => { p.session.steps = []; });
  edit(p => { p.session.steps = Array(1001).fill(p.session.steps[0]); });
  edit(p => { p.sessionId = "other/invalid"; });
  for (const key of ["capability", "verdict", "revision", "nutrition"]) {
    edit(p => { p[key] = "ready"; }); edit(p => { p.session[key] = "ready"; });
  }
  for (const id of [null, "", "../path", "has space", "a".repeat(201), ["id"]]) assert.equal(validSavedSessionId(id), false);
});

test("preview presentation keeps shared graphics and missing-target reasons without execution or delivery UI", () => {
  for (const es of [false, true]) {
    const html = renderToStaticMarkup(createElement(SavedWorkoutPreviewView, { preview: preview(), es }));
    assert.match(html, /<svg/);
    assert.match(html, es ? /SOLO LECTURA/ : /READ ONLY/);
    assert.match(html, es ? /LA SECUENCIA/ : /THE FLOW/);
    assert.match(html, es ? /OBJETIVOS POR PASO/ : /STEP TARGETS/);
    assert.match(html, /No validated, dated FTP/);
    assert.match(html, /uwc-controls:not\(\[aria-label\]\)/);
    assert.match(html, /<button disabled="">(?:Start local guide|Iniciar guía local)<\/button>/);
    assert.doesNotMatch(html, /(?:READY|LISTO|FUEL &amp; SUPPORT|ALIMENTACIÓN Y APOYO|Export FIT|Copy link|Copiar enlace|WorkoutEditor|workout-email\/settings|href=)/);
  }
  assert.match(renderToStaticMarkup(createElement(SavedWorkoutPreviewCard, { sessionId: workout.id })), /role="status"/);
});

test("compact planned view keeps structure visible with one status and collapses explanations",()=>{
 const html=renderToStaticMarkup(createElement(SavedWorkoutPreviewView,{preview:preview(),compact:true,embedded:true}));
 assert.match(html,/PLANNED WORKOUT · NOT ADAPTED/);assert.match(html,/<svg/);assert.doesNotMatch(html,/<header|<h1/);
 assert.match(html,/<details[^>]*><summary>About this view/);
 const missing=renderToStaticMarkup(createElement(SavedWorkoutPreviewView,{preview:{...preview(),available:false,session:null},compact:true,plannedSession:{sport:"swim",title:"Run: Easy + Strides",durationMin:30}}));
 assert.match(missing,/Swim session/);assert.match(missing,/30 min/);assert.doesNotMatch(missing,/Run: Easy|<svg|READY/);assert.match(missing,/Review structure/);
});

test("preview fetch requests only its ID and rejects stale IDs, malformed JSON, auth failures, aborts and timeouts", async () => {
  const signal = () => new AbortController().signal;
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++; assert.equal(url, "/api/plan/preview?sessionId=synthetic"); assert.equal(init?.cache, "no-store"); assert.ok(init?.signal);
    return Response.json(preview());
  };
  assert.equal((await fetchSavedWorkoutPreview(workout.id, { signal: signal(), fetcher })).sessionId, workout.id);
  assert.equal(calls, 1);
  await assert.rejects(fetchSavedWorkoutPreview("../bad", { signal: signal(), fetcher }), /Invalid/);
  assert.equal(calls, 1);
  for (const response of [Response.json({ ...preview(), sessionId: "other" }), Response.json({ kind: "saved_plan_preview" }), new Response("bad json"), Response.json({ error: "private details" }, { status: 401 })]) {
    await assert.rejects(fetchSavedWorkoutPreview(workout.id, { signal: signal(), fetcher: async () => response }));
  }
  let innerSignal: AbortSignal | undefined;
  const hanging: typeof fetch = async (_url, init) => { innerSignal = init?.signal as AbortSignal; return new Promise(() => {}); };
  await assert.rejects(fetchSavedWorkoutPreview(workout.id, { signal: signal(), fetcher: hanging, timeoutMs: 5 }), /too long/);
  assert.equal(innerSignal?.aborted, true);
  const abort = new AbortController();
  const pending = fetchSavedWorkoutPreview(workout.id, { signal: abort.signal, fetcher: hanging });
  abort.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(innerSignal?.aborted, true);
  // A new request succeeds after a cancelled request; cancellation is not cached.
  assert.equal((await fetchSavedWorkoutPreview(workout.id, { signal: signal(), fetcher })).available, true);
});
