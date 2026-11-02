import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCentral, normalizePeripheral, computeLoad, decidePerformance, selectStimulus, buildDensitySteps, enforceEccentricSpacing, normalizeSource, type MetricRow, type LoadRow } from "./performance-engine";
import { prescribeToday, applyPerformance, adaptSession } from "./adaptive";
import { alternateFor } from "./regen";
import { compromisedRunSession } from "./hyrox";
import { buildCompactTelemetryDigest, parseScienceReply, getScienceBriefing, localScienceBriefing, SCIENCE_COACH_SKILL, type CoachTelemetry } from "./coach";

const NOW = new Date("2026-11-02T12:00:00Z");
const day = (n: number) => new Date(+NOW - n * 86400000);
// 60 days of stable Whoop RMSSD ≈ 60 ms (deterministic wobble), RHR 50.
const whoop = (todayHrv: number, rhrToday = 50, recent = todayHrv): MetricRow[] =>
  Array.from({ length: 60 }, (_, i) => 59 - i).map(n => ({ date: day(n), hrv: n === 0 ? todayHrv : n < 7 ? recent : 60 + ((n % 5) - 2) * 2, hrvType: "rmssd", restingHr: n === 0 ? rhrToday : 50, sleepHours: 7.6, source: "whoop" }));
// 4 weeks of steady completed load (bike Z2 60 min, every other day).
const steady: LoadRow[] = Array.from({ length: 14 }, (_, i) => ({ date: day(27 - i * 2), sport: "bike", type: "endurance", intensity: "z2", rpe: 3, minutes: 60 }));
const goodCheckin = { sleep: 5, soreness: 1, motivation: 5, energy: 5, stress: 1, mood: 5, sick: false, urgentSymptoms: false, newPain: false } as any;
const fullBase = { verdict: "full", safetyStatus: "clear", score: 90, scoreAvailable: true };

test("sources normalize, Strava never supplies autonomic state", () => {
  assert.equal(normalizeSource("aura"), "oura");
  const c = normalizeCentral(whoop(60).map(m => ({ ...m, source: "strava" })), {}, NOW);
  assert.equal(c.confidence, "none");
});

test("central: 7-day lnRMSSD vs baseline SWC; suppressed when below, stable within", () => {
  assert.equal(normalizeCentral(whoop(60), {}, NOW).status, "stable");
  const low = normalizeCentral(whoop(42, 50, 45), {}, NOW);
  assert.equal(low.status, "suppressed");
  assert.ok(low.hrvZ! < -0.5);
  assert.equal(low.source, "whoop");
});

test("central degrades to check-in when no qualifying wearable baseline", () => {
  const c = normalizeCentral(whoop(60).slice(-5), { sleep: 4, energy: 4, stress: 2 }, NOW);
  assert.equal(c.confidence, "subjective");
  assert.equal(c.hrvZ, null);
});

test("peripheral: recent hard run = high eccentric, bike barely registers", () => {
  const run = normalizePeripheral([{ date: new Date(+NOW - 20 * 3600000), sport: "run", type: "interval", intensity: "z5", rpe: 8, minutes: 60 }], 2, NOW);
  assert.equal(run.eccentricBand, "high"); assert.equal(run.hoursSinceHighEccentric, 20);
  const bike = normalizePeripheral([{ date: new Date(+NOW - 20 * 3600000), sport: "bike", type: "interval", intensity: "z5", rpe: 8, minutes: 60 }], 2, NOW);
  assert.equal(bike.eccentricBand, "low"); assert.equal(bike.hoursSinceHighEccentric, null);
});

test("ACWR unknown with <21 days or unknown durations — never assumed 1.0", () => {
  assert.equal(computeLoad(steady.slice(-5), NOW).acwr, null);
  assert.equal(computeLoad([...steady, { date: day(1), sport: "run", minutes: null }], NOW).acwr, null);
  const l = computeLoad(steady, NOW); assert.ok(l.acwr! > 0.8 && l.acwr! < 1.3);
});

test("PUSH requires flag, readiness ≥75, known ACWR <1.3, stable central", () => {
  const push = decidePerformance({ base: fullBase, subjective: goodCheckin, metrics: whoop(64), loadRows: steady, pushEnabled: true, now: NOW });
  assert.equal(push.verdict, "push", push.pushBlockedBy.join("; "));
  assert.notEqual(decidePerformance({ base: fullBase, subjective: goodCheckin, metrics: whoop(64), loadRows: steady, pushEnabled: false, now: NOW }).verdict, "push");
  assert.notEqual(decidePerformance({ base: fullBase, subjective: goodCheckin, metrics: whoop(64), loadRows: steady.slice(-4), pushEnabled: true, now: NOW }).verdict, "push");
  const spike = [...steady, ...Array.from({ length: 6 }, (_, i) => ({ date: day(i), sport: "bike", intensity: "z4", rpe: 8, minutes: 90 }))];
  assert.ok(decidePerformance({ base: fullBase, subjective: goodCheckin, metrics: whoop(64), loadRows: spike, pushEnabled: true, now: NOW }).pushBlockedBy.some(r => r.startsWith("ACWR")));
});

test("engine never lifts a safety hold, rest or easy", () => {
  for (const base of [{ verdict: "rest", safetyStatus: "hold" }, { verdict: "rest", safetyStatus: "clear" }, { verdict: "easy", safetyStatus: "clear" }])
    assert.notEqual(decidePerformance({ base, subjective: goodCheckin, metrics: whoop(70), loadRows: steady, pushEnabled: true, now: NOW }).verdict, "push");
  const held = adaptSession({ ...goodCheckin, urgentSymptoms: true });
  const d = decidePerformance({ base: held, subjective: goodCheckin, metrics: whoop(70), loadRows: steady, pushEnabled: true, now: NOW });
  assert.equal(applyPerformance(held, d).verdict, "rest");
});

test("device-suppressed HRV downgrades a full day", () => {
  const d = decidePerformance({ base: fullBase, subjective: goodCheckin, metrics: whoop(38, 50, 40), loadRows: steady, pushEnabled: true, now: NOW });
  assert.ok(["easy", "modulate"].includes(d.verdict));
});

test("run gating: hard run <48 h after eccentric load pivots to bike, never invents a modality", () => {
  const rows = [...steady, { date: new Date(+NOW - 24 * 3600000), sport: "run", type: "interval", intensity: "z5", rpe: 8, minutes: 50 }];
  const d = decidePerformance({ base: fullBase, subjective: { ...goodCheckin, soreness: 2 }, metrics: whoop(64), loadRows: rows, pushEnabled: true, now: NOW });
  const planned = { sport: "run", type: "interval", intensity: "z5", durationMin: 60 };
  const s = selectStimulus({ planned, decision: d, availMin: 60, availableSports: ["run", "bike"] });
  assert.equal(s.sport, "bike"); assert.equal(s.pivotedFrom, "run");
  const noBike = selectStimulus({ planned, decision: d, availMin: 60, availableSports: ["run"] });
  assert.equal(noBike.sport, "run"); assert.equal(noBike.zone, "z2");
});

test("swim allows threshold under leg fatigue; strength NM gated at readiness 70", () => {
  const d = decidePerformance({ base: fullBase, subjective: goodCheckin, metrics: whoop(64), loadRows: steady, pushEnabled: true, now: NOW });
  assert.equal(selectStimulus({ planned: { sport: "swim", type: "endurance", intensity: "z2", durationMin: 60 }, decision: { ...d, peripheral: { ...d.peripheral, status: "high" } }, availMin: 60, availableSports: ["swim"] }).kind, "threshold");
  assert.equal(selectStimulus({ planned: { sport: "strength", type: "strength", intensity: "z3", durationMin: 45 }, decision: d, availMin: 45, availableSports: [] }).kind, "neuromuscular");
  assert.notEqual(selectStimulus({ planned: { sport: "strength", type: "strength", intensity: "z3", durationMin: 45 }, decision: { ...d, readiness: 65 }, availMin: 45, availableSports: [] }).kind, "neuromuscular");
});

test("density builder fits T_avail exactly across sports, kinds and windows", () => {
  for (const sport of ["run", "bike", "swim", "hyrox", "strength"]) for (const kind of ["vo2", "threshold", "sweetspot", "durability", "neuromuscular", "compromised", "aerobic"] as const) for (const avail of [20, 25, 30, 38, 44, 45, 60, 75, 90, 91, 120, 180]) {
    const steps = buildDensitySteps({ sport, kind, zone: "z4", reason: "" }, avail);
    if (!steps) continue;
    assert.equal(steps.reduce((a, s) => a + s.seconds, 0), avail * 60, `${sport}/${kind}/${avail}`);
    assert.ok(steps.every(s => s.seconds > 0), `${sport}/${kind}/${avail} positive`);
    assert.equal(steps[0].phase, "warmup"); assert.equal(steps[steps.length - 1].phase, "cooldown");
  }
  const short = buildDensitySteps({ sport: "bike", kind: "vo2", zone: "z5", reason: "" }, 40)!;
  assert.ok(short.some(s => s.seconds === 30 && s.zone === "z5"), "Rønnestad 30/15 on short window");
  const long = buildDensitySteps({ sport: "bike", kind: "durability", zone: "z4", reason: "" }, 150)!;
  const active = long.filter(s => s.phase === "active");
  assert.equal(active[active.length - 1].zone, "z4", "late-session threshold");
});

test("prescribeToday PUSH stays inside time budget; legacy path unchanged without engine", () => {
  const d = decidePerformance({ base: fullBase, subjective: goodCheckin, metrics: whoop(64), loadRows: steady, pushEnabled: true, now: NOW });
  const session = { sport: "bike", title: "Bike Endurance", type: "endurance", intensity: "z2", durationMin: 60 };
  const adaptation = { verdict: "full", durationFactor: 1, intensityCap: "z7" };
  const stim = selectStimulus({ planned: session, decision: d, availMin: 35, availableSports: ["bike"] });
  const p = prescribeToday({ session, adaptation, timeBudgetMin: 35, performance: { decision: d, stimulus: stim } });
  assert.ok(p.durationMin <= 35); assert.equal(p.intensity, "z5"); assert.match(p.title, /PUSH/);
  const legacy = prescribeToday({ session, adaptation, timeBudgetMin: 35 });
  assert.equal(legacy.intensity, "z2");
  // Non-push pivot respects the adaptation cap.
  const capped = prescribeToday({ session: { ...session, sport: "run", type: "interval", intensity: "z5" }, adaptation: { verdict: "trim", durationFactor: 0.85, intensityCap: "z4" }, performance: { decision: { ...d, verdict: "modulate" }, stimulus: { sport: "bike", kind: "vo2", zone: "z5", pivotedFrom: "run", reason: "pivot" } } });
  assert.ok(capped.steps.every(s => Number(s.zone.slice(1)) <= 4));
});

test("regen pivots hard run to bike on loaded legs; legacy alternate unchanged", () => {
  assert.equal(alternateFor("run", "interval", "z5", 60, "olympic", { centralOk: true, legsLoaded: true, availableSports: ["bike"] }).sport, "bike");
  assert.equal(alternateFor("run", "interval", "z5", 60, "olympic").sport, "strength");
});

test("plan spacing keeps ≥48 h between high-eccentric sessions", () => {
  const week = [{ date: day(3), sport: "run", type: "interval", intensity: "z5" }, { date: day(2), sport: "run", type: "threshold", intensity: "z4" }, { date: day(0), sport: "run", type: "interval", intensity: "z5" }];
  const out = enforceEccentricSpacing(week, ["run", "bike"]);
  assert.deepEqual(out.map(s => s.sport), ["run", "bike", "run"]);
});

test("HYROX compromised session swaps run for erg on loaded legs and is gated at readiness 70", () => {
  assert.equal(compromisedRunSession({ availMin: 50, readiness: 65, legsLoaded: false }), null);
  const s = compromisedRunSession({ availMin: 50, readiness: 80, legsLoaded: true })!;
  assert.ok(s.steps.some(x => /SkiErg/.test(x.name)));
});

const telemetry: CoachTelemetry = { language: "es", wearableSource: "whoop", readiness: 82, verdict: "push", hrvZScore: 0.4, rhrDelta: -1, sleepHours: 7.6, soreness: 2, eccentricBand: "low", hoursSinceHighEccentric: null, acwr: 1.08, recentRpeDelta: 0.3, availMin: 40, sport: "bike", targetZone: "z5", estTss: 52, rxIntervals: "13 × 30/15", fuelGPerH: 0 };

test("telemetry digest is one compact line, honest about unknowns", () => {
  const line = buildCompactTelemetryDigest(telemetry);
  assert.ok(!line.includes("\n")); assert.ok(line.length < 150, String(line.length));
  assert.match(line, /ACWR:1\.08/); assert.match(line, /LANG:es/);
  const unknown = buildCompactTelemetryDigest({ ...telemetry, acwr: null, soreness: null, hrvZScore: null, language: "xx" });
  assert.match(unknown, /ACWR:N\/A/); assert.match(unknown, /SORE:N\/A/); assert.match(unknown, /LANG:en/);
  assert.ok(SCIENCE_COACH_SKILL.split(/\s+/).length < 170, "skill stays compact");
});

test("reply contract: exact keys, grounded numbers, rx always deterministic", () => {
  const digest = buildCompactTelemetryDigest(telemetry);
  const ok = parseScienceReply({ headline: "Empuje", briefing: "HRV +0.4SD y ACWR 1.08 permiten sobrecarga.", adaptation: "VO2 en bici.", fuel: "Agua." }, digest, "13 × 30/15");
  assert.equal(ok?.rx_intervals, "13 × 30/15");
  assert.equal(parseScienceReply({ headline: "x", briefing: "HRV is 99", adaptation: "y", fuel: "z" }, digest, ""), null, "ungrounded number");
  assert.equal(parseScienceReply({ headline: "x", briefing: "You are cleared to train", adaptation: "y", fuel: "z" }, digest, ""), null);
  assert.equal(parseScienceReply({ headline: "x", briefing: "y", adaptation: "z", fuel: "w", extra: 1 }, digest, ""), null);
});

test("science briefing never calls a provider unless eligible; max 300 output tokens when it does", async () => {
  let calls = 0, body: any;
  const fake = (async (_u: any, init: any) => { calls++; body = JSON.parse(init.body); return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ headline: "Empuje", briefing: "ACWR 1.08.", adaptation: "Bici.", fuel: "Agua." }) } }] }), { status: 200 }); }) as typeof fetch;
  const env = { EXTERNAL_AI_ENABLED: "true", OPENAI_API_KEY: "synthetic" };
  assert.equal((await getScienceBriefing(telemetry, { eligible: false, env, fetch: fake })).mode, "local");
  assert.equal((await getScienceBriefing({ ...telemetry, wearableSource: "strava" }, { eligible: true, env, fetch: fake })).mode, "local");
  assert.equal(calls, 0);
  const ai = await getScienceBriefing(telemetry, { eligible: true, env, fetch: fake });
  assert.equal(ai.mode, "ai"); assert.equal(body.max_tokens, 300); assert.equal(body.messages.length, 2);
  assert.equal(localScienceBriefing(telemetry).headline, "DÍA DE EMPUJE");
});
