import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readTrainingJson, TrainingReadError, isSavedPlanResponse, isTrainingProfileResponse, isTodayTrainingResponse, todayOfflineSnapshot, readSavedCycleMetadata, isPlanPreviewResponse, isGeneratedPlanResponse } from "./training-read";
import { athleteDayReview } from "../../lib/athlete-day-review";
import { readinessReasonText } from "./readiness-copy";
import { UniversalWorkoutCard, WorkoutHeader } from "./UniversalWorkoutCard";
import { universalWorkoutExample } from "../../lib/universal-workout-example";
import { buildUniversalWorkoutCard } from "../../lib/universal-workout-card-server";
import { resolveCheckinSafety } from "../../lib/checkin-safety";
import { TrainingCycleOverview } from "../training-cycle-overview";

const options = () => ({ signal: new AbortController().signal, label: "Saved training", validate: isSavedPlanResponse });

test("offline Today cache removes personal feedback notes without mutating live records", () => {
  const live = { sessions: [{ id: "planned", feedbackNote: "private note", preWorkoutWeight: { weightKg: 70 } }], athleteReview: { records: [{ id: "actual", feedbackNote: "private result" }] } };
  const cached = todayOfflineSnapshot(live);
  assert.equal(cached.sessions[0].feedbackNote, null);
  assert.equal(cached.sessions[0].preWorkoutWeight, null);
  assert.equal(cached.athleteReview.records[0].feedbackNote, null);
  assert.equal(live.sessions[0].feedbackNote, "private note");
  assert.equal(live.athleteReview.records[0].feedbackNote, "private result");
});
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

test("Today accepts unavailable copy analysis with an explicit provenance reason while preserving owner activity",async()=>{
 for(const source of ["strava","unknown_import"]) {
  const review=athleteDayReview([{id:"actual",userId:"owner",date:new Date("2026-10-21T09:00Z"),sport:"bike",title:"Synthetic actual ride",source,completed:true,planned:false,durationMin:60,avgHr:128}],"owner","2026-10-21","UTC",null);
  assert.equal(review.possibleCopies,null);assert.equal(review.derivedActivityPolicy.status,"insufficient");
  const response={date:"2026-10-21",timezone:"UTC",sessions:[],connectors:[],athleteReview:review};
  assert.equal(isTodayTrainingResponse(response),true);
  const accepted=await readTrainingJson("/api/today",{signal:new AbortController().signal,label:"Today's training",validate:isTodayTrainingResponse,fetcher:async()=>jsonResponse(response)});
  assert.equal(accepted.athleteReview.records[0].minutes,60);
  assert.equal(accepted.athleteReview.possibleCopies,null,"unavailable analysis is not converted to zero");
  assert.equal(isTodayTrainingResponse({...response,athleteReview:{...review,derivedActivityPolicy:null}}),false);
  assert.equal(isTodayTrainingResponse({...response,athleteReview:{...review,derivedActivityPolicy:{status:"allowed",reason:null}}}),false);
 }
});

test("nested missing days, sessions and prescription data fail closed instead of crashing rendering", () => {
  const summary = { id: "s", title: "Saved ride", sport: "bike", durationMin: 10, intensity: null };
  const plan = { id: "p", name: "Saved plan", startDate: "2026-10-14", weeks: 12, days: [{ id:"d", date:"2026-10-14", sessions:[summary] }] };
  assert.equal(isSavedPlanResponse({ plans:[plan], cycle:null }), true);
  for (const malformed of [null, {date:"2026-10-14"}, {...plan.days[0],sessions:[null]}, {...plan.days[0],sessions:[{...summary,intensity:{}}]}]) {
    assert.equal(isSavedPlanResponse({plans:[{...plan,days:[malformed]}]}), false);
  }
  assert.equal(isSavedPlanResponse({plans:[plan],cycle:{weeks:[]}}), true, "Optional legacy audit metadata cannot hide the verified schedule");
  assert.equal(readSavedCycleMetadata({weeks:[]}), null);
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

test("legacy or malformed cycle summaries are isolated from saved schedule and never rendered as measured context", async () => {
  const plan = { id:"saved", name:"Saved cycle", startDate:"2026-10-14", weeks:4, days:[{id:"day",date:"2026-10-14",sessions:[{id:"session",title:"Saved easy ride",sport:"bike",durationMin:35}]}] };
  for (const cycle of [{weeks:[]}, {baseline:null,activity:{}}, {baseline:{weeklyMinutes:{}},activity:{}}, {baseline:{},activity:{}}, {baseline:{},activity:{reportedSessions:{}}}, {baseline:{},activity:{},weeks:[{week:1,theme:null,totalMinutes:20}]}]) {
    const loaded = await readTrainingJson("/api/plan", { ...options(), fetcher: async () => jsonResponse({plans:[plan],cycle}) });
    assert.equal(loaded.plans[0].days[0].sessions[0].durationMin,35);
    assert.equal(readSavedCycleMetadata(loaded.cycle),null);
  }
  const valid={baseline:{weeklyMinutes:180,source:"athlete_reported",observedAt:"2026-10-14"},activity:{reportedSessions:0,reportedMinutes:null},weeks:[]};
  assert.equal(readSavedCycleMetadata(valid),valid);
  assert.equal(isSavedPlanResponse({plans:[{...plan,days:[{...plan.days[0],sessions:[{...plan.days[0].sessions[0],durationMin:null}]}]}]}),false,"Bad session data still fails closed");
});

test("plan preview and save require verified structured responses rather than any successful HTTP status", () => {
  const session={daySlot:0,title:"Easy run",sport:"run",zone:"z2",minutes:30,steps:[{name:"Easy familiar running",zone:"z2",seconds:1800}]};
  const preview={ok:true,previewToken:"a".repeat(64),warning:"Provisional; review before saving",doubleDayAgreementRequired:false,eventTradeoffAgreementRequired:false,
    preview:{distance:"run-only",weeks:4,startDate:"2026-10-14",weeklyBudgetMin:120,existingPlans:0,weeksPreview:Array.from({length:4},(_,index)=>({week:index+1,theme:"Foundation",totalMinutes:30,restDaySlots:[1,2,3,4,5,6],sessions:[session]}))}};
  assert.equal(isPlanPreviewResponse(preview),true);
  for(const steps of [null,undefined,[]]) assert.equal(isPlanPreviewResponse({...preview,preview:{...preview.preview,weeksPreview:preview.preview.weeksPreview.map(week=>({...week,sessions:[{...session,steps}]}))}}),false,"An unstructured generated workout never reaches confirmation");
  for(const invalid of [null,{ok:true},{...preview,previewToken:""},{...preview,preview:{...preview.preview,weeksPreview:[]}},{...preview,preview:{...preview.preview,weeksPreview:[{week:1,sessions:[null]}]}},{...preview,preview:{...preview.preview,cycle:{baseline:null,activity:{}}}}]) assert.equal(isPlanPreviewResponse(invalid),false);
  const saved={ok:true,plan:{id:"saved",name:"Saved cycle",sessions:[{id:"session",userId:"athlete",title:"Easy run",sport:"run",durationMin:30}]}};
  assert.equal(isGeneratedPlanResponse(saved),true);
  for(const invalid of [{ok:true},{...saved,ok:false},{...saved,plan:{...saved.plan,id:""}},{...saved,plan:{...saved.plan,sessions:[]}},{...saved,plan:{...saved.plan,sessions:[null]}}]) assert.equal(isGeneratedPlanResponse(invalid),false);
});

test("optional preview target projections require matching steps, source dates and bounded numeric ranges", () => {
  const session={daySlot:0,title:"Easy bike",sport:"bike",zone:"z2",minutes:30,steps:[{name:"Steady",zone:"z2",seconds:1800}],
    targetPreview:{steps:[{targetLabel:"111–150 W",speedLabel:null,reference:{source:"applied_field_test",observedAt:"2026-10-14T12:00:00.000Z",unit:"W",value:200}}],mechanicalWork:{lowKj:199.8,highKj:270}}};
  const response=(targetPreview:unknown)=>({ok:true,previewToken:"a".repeat(64),warning:"Preview",doubleDayAgreementRequired:false,eventTradeoffAgreementRequired:false,
    preview:{distance:"cycle",weeks:4,startDate:"2026-10-14",weeklyBudgetMin:120,existingPlans:0,weeksPreview:Array.from({length:4},(_,index)=>({week:index+1,theme:"Foundation",totalMinutes:30,restDaySlots:[1,2,3,4,5,6],sessions:[{...session,targetPreview}]}))}});
  assert.equal(isPlanPreviewResponse(response(session.targetPreview)),true);
  assert.equal(isPlanPreviewResponse(response(undefined)),true,"Older preview fixtures can omit projections");
  for(const targetPreview of [{steps:[],mechanicalWork:null}, {...session.targetPreview,mechanicalWork:{lowKj:300,highKj:200}}, {...session.targetPreview,mechanicalWork:{lowKj:-1,highKj:200}},
    ...[{source:"device_guess"},{observedAt:"2026-02-31"},{unit:"bpm"},{value:Infinity}].map(patch=>({...session.targetPreview,steps:[{...session.targetPreview.steps[0],reference:{...session.targetPreview.steps[0].reference,...patch}}]})),
    {...session.targetPreview,steps:[{targetLabel:{},speedLabel:null,reference:null}]}]) assert.equal(isPlanPreviewResponse(response(targetPreview)),false);
});

test("malformed profile HR tables fail locally instead of crashing an independently loaded saved schedule", () => {
  const hr=Object.fromEntries(["z1","z2","z3","z4","z5"].map((key,index)=>[key,{low:100+index*10,high:110+index*10}]));
  const profile={profile:{goal:"run-only"},zones:{hr,bikeHr:hr,anchorHr:180},planningReadiness:{ready:true,missing:[],review:[]}};
  assert.equal(isTrainingProfileResponse(profile),true);
  for(const zones of [{hr:{}},{hr:{...hr,z1:null}},{hr:{...hr,z2:{low:140,high:120}}},{hr:{...hr,z3:{low:"120",high:130}}},{hr,bikeHr:{}},{hr,anchorHr:{}}]) assert.equal(isTrainingProfileResponse({...profile,zones}),false);
  assert.equal(isSavedPlanResponse({plans:[]}),true,"Profile errors do not change the schedule read contract");
});

test("all old triathlon lengths request a replacement review while the corrected saved template remains readable", () => {
  const cycle={goal:"Familiar triathlon practice",baseline:{weeklyMinutes:180,source:"athlete_reported",observedAt:"2026-10-14"},activity:{reportedSessions:0,reportedMinutes:null,note:"No performed records supplied"},weeks:[{week:1,theme:"Foundation",totalMinutes:180,doseAllocation:{},templateVersion:"triathlon-foundation-v3"}],evidenceNote:"References retain their source",assessment:"Comfortable observations"};
  for(const distance of ["sprint","olympic","half","full"]) {
    const plan={id:"saved",name:"Saved triathlon",startDate:"2026-10-14",weeks:4,days:[],distance,level:"beginner"};
    const props={plan,cycle,timezone:"UTC",selectedMonth:"2026-10",onMonthChange:()=>{}};
    const current=render(React.createElement(TrainingCycleOverview,props));
    assert.match(current,/Saved training cycle/);assert.doesNotMatch(current,/needs review against the sport-allocation correction/);
    const legacy=render(React.createElement(TrainingCycleOverview,{...props,cycle:{...cycle,weeks:[{...cycle.weeks[0],templateVersion:"triathlon-foundation-v2"}]}}));
    assert.match(legacy,/needs review against the sport-allocation correction/);
    assert.match(legacy,/History is retained/);
  }
});

test("held headers use an unknown executable duration and readable missing check-in fields in both languages", () => {
  for (const es of [false, true]) {
    const card = heldCard(es);
    const before = JSON.stringify(card);
    const html = render(React.createElement(WorkoutHeader, { card }));
    assert.match(html, es ? /EN ESPERA/ : /ON HOLD/);
    assert.doesNotMatch(html, /newPain|urgentSymptoms|availableMin|~?0 min<small>DURATION/);
    assert.match(html, es ? /dolor nuevo|síntomas urgentes|tiempo disponible/ : /new or worsening pain|urgent symptoms|available training time/);
    assert.equal(JSON.stringify(card), before);
  }
  const ready = render(React.createElement(WorkoutHeader, { card: universalWorkoutExample() }));
  assert.match(ready, /56 min<small>DURATION/);
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
