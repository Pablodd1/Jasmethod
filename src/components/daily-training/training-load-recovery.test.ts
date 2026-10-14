import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readTrainingJson, TrainingReadError, isSavedPlanResponse, isTrainingProfileResponse, isTodayTrainingResponse } from "./training-read";
import { readinessReasonText } from "./readiness-copy";
import { UniversalWorkoutCard, WorkoutHeader } from "./UniversalWorkoutCard";
import { universalWorkoutExample } from "../../lib/universal-workout-example";
import { buildUniversalWorkoutCard } from "../../lib/universal-workout-card-server";
import { resolveCheckinSafety } from "../../lib/checkin-safety";

const options = () => ({ signal: new AbortController().signal, label: "Saved training", validate: isSavedPlanResponse });
const jsonResponse = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });
function render(element: React.ReactElement) {
  const previous = (globalThis as any).React;
  (globalThis as any).React = React;
  try { return renderToStaticMarkup(element); } finally { (globalThis as any).React = previous; }
}

function heldCard(es = false) {
  const example = universalWorkoutExample(es ? "es" : "en");
  return buildUniversalWorkoutCard({ ...example.session, verdict: "blocked", durationMin: 0, exactTimeSeconds: null,
    steps: [], reason: resolveCheckinSafety(null).message,
    capability: { ...example.session.capability, available: false, mode: "unavailable" },
  }, null, es ? "es" : "en");
}

test("training reads bypass cache and validate saved empty plans rather than guessing emptiness", async () => {
  let request: RequestInit | undefined;
  const value = await readTrainingJson("/api/plan", { ...options(), fetcher: async (_url, init) => {
    request = init; return jsonResponse({ plans: [], cycle: null });
  } });
  assert.deepEqual(value.plans, []);
  assert.equal(request?.cache, "no-store");
  assert.ok(request?.signal);
  assert.equal(request?.method, undefined);
  for (const value of [null, {}, { plans: null }, { plans: [null] }, { plans: [{}] }]) {
    await assert.rejects(readTrainingJson("/api/plan", { ...options(), fetcher: async () => jsonResponse(value) }), /could not be verified/);
  }
});


test("an explicit daily 204 means no session; other screens do not turn it into an empty plan", async () => {
  const empty = await readTrainingJson<{plans:any[]} | null>("/api/v1/training/today", { ...options(),
    validate: (value): value is {plans:any[]} | null => isSavedPlanResponse(value), emptyValue: null,
    fetcher: async () => new Response(null, { status: 204 }),
  });
  assert.equal(empty, null);
  await assert.rejects(readTrainingJson("/api/plan", { ...options(), fetcher: async () => new Response(null, { status: 204 }) }), /unreadable/);
});

test("a stuck request or JSON body ends in a retryable timeout", async () => {
  for (const fetcher of [
    async () => new Promise<Response>(() => {}),
    async () => ({ ok: true, json: async () => new Promise<unknown>(() => {}) }) as Response,
  ]) {
    await assert.rejects(readTrainingJson("/api/plan", { ...options(), fetcher, timeoutMs: 5 }), /took too long.*retry/);
  }
});

test("cancelling a superseded read rejects even if the transport ignores abort", async () => {
  const controller = new AbortController();
  const read = readTrainingJson("/api/plan", { ...options(), signal: controller.signal, fetcher: async () => new Promise<Response>(() => {}) });
  controller.abort();
  await assert.rejects(read, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  let requested = false;
  await assert.rejects(readTrainingJson("/api/plan", { ...options(), signal: controller.signal, fetcher: async () => { requested = true; return jsonResponse({plans:[]}); } }), /closed/);
  assert.equal(requested, false);
});

test("sign-in failures stay distinct from transient errors and malformed responses", async () => {
  for (const status of [401, 403, 503]) {
    await assert.rejects(readTrainingJson("/api/plan", { ...options(), fetcher: async () => new Response("not json", { status }) }),
      (error: unknown) => error instanceof TrainingReadError && error.status === status && (status === 503 ? /retry/i : /sign in/i).test(error.message));
  }
  await assert.rejects(readTrainingJson("/api/plan", { ...options(), fetcher: async () => new Response("not json") }), /unreadable/);
  await assert.rejects(readTrainingJson("/api/plan", { ...options(), fetcher: async () => { throw new TypeError("fetch failed"); } }), /connection and retry/);
});

test("a delayed planning profile does not delay an independent saved plan", async () => {
  let resolveProfile!: (response: Response) => void;
  let planShown = false;
  const profile = readTrainingJson("/api/profile", { signal: new AbortController().signal, label: "Planning setup", validate: isTrainingProfileResponse,
    fetcher: async () => new Promise<Response>(resolve => { resolveProfile = resolve; }) });
  const plan = readTrainingJson("/api/plan", { ...options(), fetcher: async () => jsonResponse({ plans: [] }) }).then(() => { planShown = true; });
  await plan;
  assert.equal(planShown, true);
  resolveProfile(new Response("temporary failure", { status: 503 }));
  await assert.rejects(profile, /Planning setup|planning setup/);
  assert.equal(planShown, true);
});

test("today response rejects malformed data instead of treating it as no sessions", () => {
  assert.equal(isTodayTrainingResponse({ date: "2026-10-14", timezone: "UTC", sessions: [], connectors: [] }), true);
  for (const value of [null, {}, { date: "2026-10-14", sessions: null }, {date:"2026-10-14", sessions:[null]},
    { date: "2026-10-14", sessions: [{id:"a",title:"Ride",sport:"bike",durationMin:"0"}] }]) assert.equal(isTodayTrainingResponse(value), false);
});

test("nested missing days, sessions and prescription data fail closed instead of crashing rendering", () => {
  const summary = { id: "s", title: "Saved ride", sport: "bike", durationMin: 10, intensity: null };
  const plan = { id: "p", name: "Saved plan", startDate: "2026-10-14", weeks: 12, days: [{ id:"d", date:"2026-10-14", sessions:[summary] }] };
  assert.equal(isSavedPlanResponse({ plans:[plan], cycle:null }), true);
  for (const malformed of [null, {date:"2026-10-14"}, {...plan.days[0],sessions:[null]}, {...plan.days[0],sessions:[{...summary,intensity:{}}]}]) {
    assert.equal(isSavedPlanResponse({plans:[{...plan,days:[malformed]}]}), false);
  }
  assert.equal(isSavedPlanResponse({plans:[plan],cycle:{weeks:[]}}), false);
  const session = {...summary, verdict:"blocked", prescription:{steps:[],targets:{},verdict:"rest"}, fuel:null, fuelCurve:[]};
  const today = {date:"2026-10-14",timezone:"UTC",sessions:[session],connectors:[]};
  assert.equal(isTodayTrainingResponse(today), true);
  for (const malformed of [summary, {...session,prescription:null}, {...session,prescription:{steps:[],targets:null}},
    {...session,prescription:{steps:[null],targets:{}}}, {...session,prescription:{steps:[{name:"step",zone:null}],targets:{}}},
    {...session,fuel:{segments:[null]}}]) assert.equal(isTodayTrainingResponse({...today,sessions:[malformed]}), false);
  assert.equal(isTodayTrainingResponse({...today,connectors:[null]}), false);
  assert.equal(isTodayTrainingResponse({...today,activityReports:[null]}), false);
  assert.equal(isTrainingProfileResponse({profile:null,zones:null,planningReadiness:{ready:false,missing:[],review:[]}}), true);
  assert.equal(isTrainingProfileResponse({profile:null,zones:null,planningReadiness:{ready:false,missing:[],review:null}}), false);
});

test("held headers use an unknown executable duration and readable missing check-in fields in both languages", () => {
  for (const es of [false, true]) {
    const card = heldCard(es);
    const before = JSON.stringify(card);
    const html = render(React.createElement(WorkoutHeader, { card }));
    assert.match(html, es ? /EN ESPERA/ : /ON HOLD/);
    assert.doesNotMatch(html, /newPain|urgentSymptoms|availableMin|~?0<small>MIN/);
    assert.match(html, es ? /dolor nuevo|síntomas urgentes|tiempo disponible/ : /new or worsening pain|urgent symptoms|available training time/);
    assert.equal(JSON.stringify(card), before);
  }
  const ready = render(React.createElement(WorkoutHeader, { card: universalWorkoutExample() }));
  assert.match(ready, /56<small>MIN/);
  assert.match(ready, /READY/);
});

test("urgent and other safety instructions are never rewritten as merely an incomplete check-in", () => {
  const urgent = resolveCheckinSafety({ urgentSymptoms: true }).message;
  const illness = resolveCheckinSafety({ sick: true }).message;
  for (const reason of [urgent, illness, "Professional review is required before training."]) {
    for (const es of [false, true]) assert.equal(readinessReasonText(reason, es), reason);
  }
});

test("a held card shows its separate read-only preview without resurrecting executable steps", () => {
  const card = heldCard();
  const before = JSON.stringify(card);
  const heldPreview = React.createElement("p", { "data-saved-preview": true }, "Saved 10 minute plan, read only");
  const html = render(React.createElement(UniversalWorkoutCard, { card, heldPreview }));
  assert.match(html, /Saved 10 minute plan, read only/);
  assert.match(html, /do not remove the hold or authorize execution/);
  assert.doesNotMatch(html, /THE FLOW|THE DETAILS|newPain|urgentSymptoms|availableMin/);
  assert.equal(card.session.steps.length, 0);
  assert.equal(card.session.capability.available, false);
  assert.equal(JSON.stringify(card), before);
  const ready = render(React.createElement(UniversalWorkoutCard, { card: universalWorkoutExample(), heldPreview }));
  assert.doesNotMatch(ready, /data-saved-preview/);
  assert.match(ready, /THE FLOW/);
});

test("page wiring gates empty state and creation until verified, aborts old loads, and scopes state to athlete", () => {
  const training = readFileSync("src/app/training/page.tsx", "utf8");
  assert.match(training, /planLoaded && !loading && !loadError \? \(/);
  assert.match(training, /open=\{planLoaded && !plan && !loading && !loadError\}/);
  assert.match(training, /\{planLoaded && <span className="chip chip-z2">/);
  assert.match(training, /key=\{user\?\.id \|\| "signed-out"\}/);
  assert.match(training, /loadController\.current\?\.abort\(\)/);
  assert.match(training, /if \(!mounted\.current\) return/);
  assert.match(training, /mounted\.current = false/);
  assert.doesNotMatch(training, /const \[planResponse, profileResponse\]/);
  const today = readFileSync("src/app/today/page.tsx", "utf8");
  assert.match(today, /readTrainingJson\("\/api\/today"/);
  assert.match(today, /e\.status === 401 \|\| e\.status === 403/);
  assert.match(today, /key=\{user\?\.id \|\| "signed-out"\}/);
  assert.match(today, /heldPreview=\{<SavedWorkoutPreviewCard/);
  assert.match(today, /if \(!mounted\.current\) return/);
  assert.match(today, /mounted\.current = false/);
  const daily = readFileSync("src/app/daily/page.tsx", "utf8");
  assert.match(daily, /readTrainingJson<DailyTraining \| null>/);
  assert.match(daily, /emptyValue: null/);
  assert.match(daily, /e\.status === 401/);
  assert.match(daily, /loadController\.current\?\.abort\(\)/);
  const css = readFileSync("src/components/daily-training/universal-workout-card.css", "utf8");
  assert.match(css, /\.uwc-header \{[^}]*flex-wrap: wrap/);
  assert.match(css, /\.uwc-stats \{[^}]*flex: 0 0 auto;[^}]*overflow-wrap: normal/);
});
