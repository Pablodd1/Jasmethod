import test from "node:test";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DailyTrainingScreen } from "../components/daily-training/DailyTrainingScreen";
import assert from "node:assert/strict";
import { Decoder, Stream } from "@garmin/fitsdk";
import { canonicalSession, fitFilename, type CanonicalSession, FIT_STEP_LIMIT } from "./canonical-session";
import { buildFitWorkout, buildSessionDownload, sessionFitEntries } from "./fit-export";
import { normalizeSportStructure, poolLengthMeters, SWIM_STROKES } from "./sport-structure";
import { canonicalBlocks, isDailyTraining, planningDensity } from "../components/daily-training/training-contract";
import { preserveSportStructure, holdStructuredPlanEdit } from "./preserve-sport-structure";
const created = new Date("2026-10-02T12:00:00Z");
const open = { type: "open" };
const timed = (seconds = 60, extra: Record<string, unknown> = {}) => ({ name: "Work", zone: "z2", phase: "active", seconds, target: open, ...extra });
const pool = (unit = "m") => ({ schemaVersion: 1, kind: "pool", poolLength: { value: 25, unit }, steps: [{ kind: "lengths", name: "Swim", phase: "active", zone: "z2", lengths: 4, stroke: "freestyle" }, { kind: "rest", seconds: 30 }] });
const strength = () => ({ schemaVersion: 1, kind: "strength", steps: [
  { kind: "step", name: "Warmup", phase: "warmup", zone: "z1", endpoint: { type: "time", seconds: 60 } },
  { kind: "set", exerciseId: "squat", exerciseName: "Goblet squat", setNumber: 1, zone: "z2", endpoint: { type: "reps", reps: 5 }, load: { value: 12, unit: "kg" }, estimatedSeconds: 20 },
  { kind: "rest", seconds: 90 },
  { kind: "set", exerciseId: "squat", exerciseName: "Goblet squat", setNumber: 2, zone: "z2", endpoint: { type: "reps", reps: 5 }, load: { value: 12, unit: "kg" } },
] });
const hyrox = () => ({ schemaVersion: 1, kind: "hyrox", steps: [{ kind: "run", name: "Run 1", zone: "z2", endpoint: { type: "distance", meters: 1000 } }, { kind: "station", stationId: "wall-balls", name: "Wall balls", zone: "z2", endpoint: { type: "reps", reps: 20 }, load: { value: 6, unit: "kg" } }, { kind: "rest", seconds: 60 }] });
const brick = () => ({ schemaVersion: 1, kind: "brick", components: [{ id: "ride", title: "Ride", sport: "bike", durationMin: 1, steps: [timed()] }, { id: "run", title: "Run", sport: "run", durationMin: 1, steps: [timed()] }], transitions: [{ afterComponentId: "ride", instruction: "Change shoes and check the run file", endpoint: { type: "lap" } }] });
function session(sport: string, structure: unknown, extra: Record<string, any> = {}) {
  return canonicalSession({ athleteId: "synthetic-athlete", workout: { id: "explicit-sport", userId: "synthetic-athlete", title: "Explicit session 🏊", sport, durationMin: 10, ...extra }, prescription: { title: "Explicit session 🏊", sport, durationMin: extra.durationMin ?? 10, verdict: "full", steps: [timed(600, { name: "OBSOLETE GENERIC STEP" })], sportStructure: structure }, dateLocal: "2026-10-02", timezone: "UTC" });
}
function decode(c: CanonicalSession) {
  assert.equal(c.verdict, "ready", c.reason); assert.equal(c.capability.available, true, c.capability.reason);
  const d = new Decoder(Stream.fromByteArray(buildFitWorkout(c, created))); assert.equal(d.checkIntegrity(), true);
  const result = d.read(); assert.deepEqual(result.errors, []); const m = result.messages as any;
  assert.equal(m.fileIdMesgs[0].type, "workout"); assert.equal(m.workoutMesgs[0].numValidSteps, c.steps.length);
  assert.deepEqual(m.workoutStepMesgs.map((s: any) => s.messageIndex), c.steps.map((_, i) => i));
  assert.equal(c.capability.deviceTested, false); return m;
}
test("native pool round-trips exact metre/yard metadata, lengths, stroke and independent rests", () => {
  for (const unit of ["m", "yd"]) for (const stroke of SWIM_STROKES) {
    const source: any = pool(unit); source.steps[0] = { ...source.steps[0], stroke };
    const c = session("swim", source); const m = decode(c), workout = m.workoutMesgs[0], [swim, rest] = m.workoutStepMesgs;
    const meters = unit === "m" ? 25 : 22.86;
    assert.equal(workout.sport, "swimming"); assert.equal(workout.subSport, "lapSwimming"); assert.equal(workout.poolLength, meters); assert.equal(workout.poolLengthUnit, unit === "m" ? "metric" : "statute");
    assert.equal(swim.durationDistance, meters * 4); assert.equal(swim.targetStrokeType, stroke); assert.equal(swim.targetType, "swimStroke"); assert.equal(swim.durationTime, undefined);
    assert.equal(rest.durationTime, 30); assert.equal(rest.intensity, "rest"); assert.equal(rest.targetType, "open"); assert.equal(c.exactTimeSeconds, null);
    const screen = canonicalBlocks(c.steps); assert.deepEqual(screen[0].segments[0].endpoint, { type: "distance", meters: meters * 4 }); assert.match(screen[0].segments[0].instruction, new RegExp(`4 lengths × 25 ${unit}`)); assert.equal(screen[0].segments[0].target.type, swim.targetType); assert.ok(!JSON.stringify(c.steps).includes("OBSOLETE"));
  }
});
test("pool send-off stays start-to-start guidance and is never encoded as fixed rest", () => {
  const source: any = pool(); source.steps[0].sendOffSeconds = 120;
  const c = session("swim", source); assert.equal(c.verdict, "ready"); assert.equal(c.capability.available, false); assert.match(c.capability.reason, /Send-off/); assert.match(c.steps[0].note!, /from interval start \(not fixed rest\)/); assert.throws(() => buildFitWorkout(c), /Send-off/);
  assert.notEqual(c.revision, session("swim", pool()).revision);
  const openWater = session("swim", { schemaVersion: 1, kind: "openWater", steps: [timed(600)] }); assert.equal(openWater.capability.available, false); assert.match(openWater.capability.reason, /Open-water/);
});
test("strength generic companion preserves per-set reps/load identity and honest lap conversion", () => {
  const c = session("strength", strength()); const m = decode(c);
  assert.equal(m.workoutMesgs[0].sport, "generic"); assert.deepEqual(m.workoutStepMesgs.map((s: any) => s.durationType), ["time", "open", "time", "open"]);
  assert.deepEqual(c.steps[1].endpoint, { type: "reps", reps: 5 }); assert.equal(c.steps[1].seconds, 20); assert.equal(m.workoutStepMesgs[1].durationTime, undefined);
  assert.match(m.workoutStepMesgs[1].notes, /Exercise squat; set 1; load 12 kg/); assert.match(m.workoutStepMesgs[1].notes, /Complete 5 reps, then press LAP/); assert.match(m.workoutStepMesgs[3].notes, /set 2/);
  assert.equal(m.workoutStepMesgs[2].durationTime, 90); assert.match(canonicalBlocks(c.steps)[1].segments[0].instruction, /set 1; load 12 kg/); assert.equal(c.exactTimeSeconds, null);
});
test("HYROX generic companion preserves actual run/station order and quantities", () => {
  const c = session("hyrox", hyrox()); const m = decode(c);
  assert.equal(m.workoutMesgs[0].sport, "generic"); assert.deepEqual(m.workoutStepMesgs.map((s: any) => s.durationType), ["open", "open", "time"]); assert.match(m.workoutStepMesgs[0].notes, /Complete 1000 m, then press LAP/); assert.match(m.workoutStepMesgs[1].notes, /wall-balls; load 6 kg.*Complete 20 reps/);
  assert.deepEqual(c.steps.map(s => s.sportDetail?.kind), ["run", "station", "rest"]);
});
test("brick exports ordered sport files and explicit transition manifest, never one running FIT", () => {
  const c = session("brick", brick()); assert.equal(c.capability.mode, "split"); assert.throws(() => buildFitWorkout(c), /separate/);
  const entries = sessionFitEntries(c, created); assert.equal(entries.length, 4); assert.match(entries[0].name, /^01-.*-bike-/); assert.match(entries[1].name, /^02-.*-run-/);
  assert.deepEqual(c.steps.map(s => s.name), ["Work", "Transition 1", "Work"]); assert.equal(c.steps[1].endpoint.type, "lap"); assert.equal(c.exactTimeSeconds, null);
  const manifest = JSON.parse(entries.find(e => e.name === "transition-manifest.json")!.data as string); assert.equal(manifest.sourceRevision, c.revision); assert.equal(manifest.deviceTested, false); assert.deepEqual(manifest.components.map((r: any) => r.componentId), ["ride", "run"]); assert.deepEqual(manifest.transitions, brick().transitions);
  const sportNames = entries.slice(0, 2).map(e => { const d = new Decoder(Stream.fromByteArray(e.data as Uint8Array)); assert.equal(d.checkIntegrity(), true); const r = d.read(); assert.deepEqual(r.errors, []); return (r.messages as any).workoutMesgs[0].sport; }); assert.deepEqual(sportNames, ["cycling", "running"]);
  const download = buildSessionDownload(c, created); assert.match(download.filename, /-components\.zip$/); assert.equal(download.contentType, "application/zip"); assert.equal(Buffer.from(download.bytes).readUInt32LE(0), 0x04034b50);
  const single = buildSessionDownload(session("strength", strength()), created); assert.equal(single.filename, fitFilename(session("strength", strength()))); assert.equal(single.contentType, "application/octet-stream");
});
test("native pool component is allowed in ordered brick; missing/unvalidated component blocks all", () => {
  const source: any = brick(); source.components.unshift({ id: "swim", title: "Pool", sport: "swim", durationMin: 3, sportStructure: pool("yd") }); source.transitions.unshift({ afterComponentId: "swim", instruction: "Dry off", endpoint: { type: "time", seconds: 60 } });
  const c = session("brick", source); assert.equal(c.verdict, "ready", c.reason); assert.equal(c.capability.mode, "split"); assert.equal(decode(c.components![0]).workoutMesgs[0].poolLength, 22.86);
  source.components[0].sportStructure.steps[0].sendOffSeconds = 120; assert.equal(session("brick", source).capability.available, false);
  delete source.components[0].sportStructure; assert.equal(session("brick", source).verdict, "blocked");
});
test("50-step policy applies per brick file; no overall or component truncation", () => {
  const source: any = brick(); source.components = source.components.map((c: any) => ({ ...c, durationMin: 50, steps: Array.from({ length: FIT_STEP_LIMIT }, () => timed()) }));
  const c = session("brick", source, { durationMin: 100 }); assert.equal(c.capability.available, true); assert.equal(c.steps.length, 101); assert.equal(sessionFitEntries(c, created).length, 4);
  source.components[0].steps.push(timed()); source.components[0].durationMin++;
  const bad = session("brick", source, { durationMin: 101 }); assert.equal(bad.capability.available, false); assert.match(bad.capability.reason, /51.*50/); assert.equal(bad.components![0].steps.length, 51);
});
test("typed structures reject missing data, unknown fields, invalid units/counts/order without invention", () => {
  const invalid: [string, any][] = [];
  for (const value of [NaN, Infinity, 0, -1, "25", 25.00001]) invalid.push(["swim", { ...pool(), poolLength: { value, unit: "m" } }]);
  invalid.push(["swim", { ...pool(), poolLength: { value: 25, unit: "ft" } }]);
  for (const key of ["lengths", "stroke", "zone", "phase"]) { const s: any = pool(); delete s.steps[0][key]; invalid.push(["swim", s]); }
  for (const change of [{ lengths: 1.5 }, { lengths: 0 }, { stroke: "im", lengths: 3 }, { stroke: "doggy" }, { sendOffSeconds: -1 }, { targetStrokeType: "freestyle" }]) { const s: any = pool(); Object.assign(s.steps[0], change); invalid.push(["swim", s]); }
  for (const change of [{ setNumber: 2 }, { endpoint: { type: "reps", reps: 2.5 } }, { load: { value: -1, unit: "kg" } }, { load: { value: 10, unit: "stones" } }]) { const s: any = strength(); Object.assign(s.steps[1], change); invalid.push(["strength", s]); }
  const badIdentity: any = strength(); badIdentity.steps[3].exerciseName = "Other exercise"; invalid.push(["strength", badIdentity]);
  const badBrick: any = brick(); badBrick.transitions[0].afterComponentId = "run"; invalid.push(["brick", badBrick]);
  for (const [sport, value] of invalid) { const c = session(sport, value); assert.equal(c.verdict, "blocked", JSON.stringify(value)); assert.deepEqual(c.steps, []); assert.throws(() => buildSessionDownload(c)); }
  assert.throws(() => normalizeSportStructure(pool(), "run"), /match/); assert.equal(poolLengthMeters({ value: 25, unit: "yd" }), 22.86);
});
test("essential source identity cannot be silently truncated; long optional notes remain in app", () => {
  const s: any = strength(); s.steps[1].note = "Technique note ".repeat(100); const c = session("strength", s), m = decode(c);
  assert.ok(c.steps[1].note!.length > 1000); assert.match(m.workoutStepMesgs[1].notes, /Complete 5 reps, then press LAP/); assert.match(m.workoutStepMesgs[1].notes, /Truncated/); assert.ok(Buffer.byteLength(m.workoutStepMesgs[1].notes) <= 240);
  const long: any = hyrox(); long.steps[1].name = "漢".repeat(70); long.steps[1].stationId = "漢".repeat(70); const gated = session("hyrox", long); assert.equal(gated.verdict, "ready"); assert.equal(gated.capability.available, false); assert.match(gated.capability.reason, /Essential/);
});
test("safety/rest wins over explicit metadata and same-length source edits invalidate revision", () => {
  for (const sport of ["swim", "strength", "hyrox", "brick"]) {
    const structure = sport === "swim" ? pool() : sport === "strength" ? strength() : sport === "hyrox" ? hyrox() : brick();
    const c = session(sport, structure, { dayOff: true }); assert.equal(c.verdict, "rest"); assert.deepEqual(c.steps, []); assert.equal(c.components, undefined); assert.throws(() => buildSessionDownload(c));
  }
  const s: any = strength(); const old = session("strength", s); s.steps[1].load.value = 13; assert.notEqual(session("strength", s).revision, old.revision);
});
test("check-in retains explicit sport facts, holds reductions, and restores only within current bounds", () => {
  const workout = { id: "x", userId: "synthetic-athlete", sport: "strength", title: "Strength", durationMin: 10, prescription: JSON.stringify({ durationMin: 10, sportStructureBudgetMin: 10, sportStructure: strength() }) };
  const generated = { verdict: "full", durationMin: 10, intensity: "z2", steps: [timed(600)], detail: { main: "Generic replacement" } };
  const p = preserveSportStructure(workout, generated); assert.deepEqual(p.sportStructure, strength()); assert.equal(p.durationMin, 10); assert.deepEqual(p.steps, []);
  const held = preserveSportStructure(workout, { ...generated, durationMin: 8 }); assert.equal(held.verdict, "rest"); assert.equal(held.durationMin, 0); assert.deepEqual(held.sportStructure, strength()); assert.match(held.structureReviewRequired!, /explicit sport structure/);
  const restored = preserveSportStructure({ ...workout, durationMin: 0, prescription: JSON.stringify(held) }, generated); assert.equal(restored.durationMin, 10); assert.equal(restored.verdict, "full");
});
test("brick exact time includes explicit timed transitions; totals cannot understate the source", () => {
  const source: any = brick(); source.transitions[0].endpoint = { type: "time", seconds: 30 };
  const c = session("brick", source, { durationMin: 2.5 }); assert.equal(c.verdict, "ready"); assert.equal(c.exactTimeSeconds, 150); assert.equal(c.steps[1].seconds, 30);
  const manifest = JSON.parse(sessionFitEntries(c).find(e => e.name === "transition-manifest.json")!.data as string); assert.equal(manifest.transitions[0].endpoint.seconds, 30);
  assert.equal(session("brick", source, { durationMin: 2 }).verdict, "blocked");
  assert.equal(session("brick", source, { durationMin: 3 }).verdict, "blocked");
});
test("invalid saved structure budget is held without crashing the whole check-in", () => {
  const w = { id: "x", userId: "synthetic-athlete", sport: "strength", title: "Strength", durationMin: 10, prescription: JSON.stringify({ durationMin: 0, sportStructure: strength() }) };
  const result = preserveSportStructure(w, { verdict: "full", durationMin: 10, intensity: "z2", steps: [timed(600)], detail: { main: "Generated" } });
  assert.equal(result.verdict, "rest"); assert.match(result.structureReviewRequired!, /duration budget/);
});
test("all enabled sport fixtures keep canonical instructions and endpoint types on the rendered screen", () => {
  (globalThis as any).React = React;
  for (const sport of ["run", "bike", "swim", "strength", "mobility", "recovery", "boxing", "hyrox", "brick"]) {
    const structure = sport === "swim" ? pool("yd") : sport === "strength" ? strength() : sport === "hyrox" ? hyrox() : sport === "brick" ? brick() : undefined;
    const c = session(sport, structure); assert.equal(c.capability.available, true, c.capability.reason);
    const sample = JSON.parse(readFileSync(new URL("../components/daily-training/sample-session.json", import.meta.url), "utf8"));
    sample.schemaVersion = 2; Object.assign(sample.session, { id: c.id, sport, title: c.title, verdict: c.verdict, revision: c.revisionNumber, sourceRevision: c.revision, capability: c.capability, totalMinutes: c.durationMin, durationIsEstimate: c.exactTimeSeconds === null, density: planningDensity(c.steps) });
    sample.sessions = [{ id: c.id, title: c.title, sport, startTime: null }]; sample.blocks = canonicalBlocks(c.steps);
    assert.equal(isDailyTraining(sample), true, sport);
    const html = renderToStaticMarkup(React.createElement(DailyTrainingScreen, { plan: sample, onFocusReady: async () => {}, onCompletion: async () => {} }));
    assert.match(html, /Device compatibility unverified/); assert.equal(html.includes("Download components (.ZIP)"), sport === "brick");
    for (const block of sample.blocks) for (const segment of block.segments) { assert.ok(html.includes(segment.title), `${sport}: ${segment.title}`); assert.ok(html.includes(segment.instruction.replace(/&/g, "&amp;")), sport); }
    if (sport === "brick") c.components!.forEach(decode); else decode(c);
  }
});
test("same-sport plan edits retain explicit facts in a held prescription; deliberate sport changes clear incompatible structure", () => {
  const saved = JSON.stringify({ sport: "strength", durationMin: 10, verdict: "full", sportStructure: strength(), steps: [timed()] });
  const held = JSON.parse(holdStructuredPlanEdit(saved, "strength", "New title")!);
  assert.deepEqual(held.sportStructure, strength()); assert.equal(held.title, "New title"); assert.equal(held.sportStructureBudgetMin, 10); assert.equal(held.verdict, "rest"); assert.equal(held.durationMin, 0); assert.deepEqual(held.steps, []);
  assert.equal(holdStructuredPlanEdit(saved, "bike", "Bike instead"), null);
});
test("duration-weighted planning density stays unknown when non-time work lacks duration estimates", () => {
  const c = session("swim", pool());
  assert.equal(planningDensity(c.steps).score, null); assert.match(planningDensity(c.steps).missingReason!, /one or more steps/);
  assert.equal(planningDensity([]).score, null);
  const source: any = pool(); source.steps[0].estimatedSeconds = 120;
  const estimate = planningDensity(session("swim", source).steps); assert.equal(typeof estimate.score, "number"); assert.match(estimate.label, /estimated step times/);
  const run = session("run", undefined); assert.equal(planningDensity(run.steps).label, "coach planning score");
});
