// Explicit author-supplied prescription structure. Never parse exercise/sport facts from prose.
import type { WorkoutStep } from "./prescription";
export type StructureEndpoint = NonNullable<WorkoutStep["endpoint"]>;
export const SWIM_STROKES = ["freestyle", "backstroke", "breaststroke", "butterfly", "drill", "mixed", "im"] as const;
export type SwimStroke = typeof SWIM_STROKES[number];
export type Load = { value: number; unit: "kg" | "lb" };
export type RestStep = { kind: "rest"; seconds: number; note?: string };
export type PreparationStep = { kind: "step"; name: string; phase: "warmup" | "cooldown"; zone: string; endpoint: StructureEndpoint; note?: string };
export type PoolStep = { kind: "lengths"; name: string; phase: "warmup" | "active" | "cooldown"; zone: string; lengths: number; stroke: SwimStroke; estimatedSeconds?: number; sendOffSeconds?: number; note?: string } | RestStep;
export type PoolStructure = { schemaVersion: 1; kind: "pool"; poolLength: { value: number; unit: "m" | "yd" }; steps: PoolStep[] };
export type StrengthSet = { kind: "set"; exerciseId: string; exerciseName: string; setNumber: number; zone: string; endpoint: StructureEndpoint; load?: Load; estimatedSeconds?: number; note?: string };
export type StrengthStructure = { schemaVersion: 1; kind: "strength"; steps: (StrengthSet | RestStep | PreparationStep)[] };
export type HyroxStep = { kind: "run" | "station"; name: string; stationId?: string; zone: string; endpoint: StructureEndpoint; load?: Load; estimatedSeconds?: number; note?: string };
export type HyroxStructure = { schemaVersion: 1; kind: "hyrox"; steps: (HyroxStep | RestStep | PreparationStep)[] };
export type BrickComponent = { id: string; title: string; sport: "run" | "bike" | "swim"; durationMin: number; steps?: WorkoutStep[]; sportStructure?: PoolStructure };
export type BrickStructure = { schemaVersion: 1; kind: "brick"; components: BrickComponent[]; transitions: { afterComponentId: string; instruction: string; endpoint: StructureEndpoint }[] };
export type SportStructure = PoolStructure | StrengthStructure | HyroxStructure | BrickStructure | { schemaVersion: 1; kind: "openWater"; steps: WorkoutStep[] };
export type SportStepDetail =
  | { kind: "pool"; lengths: number; stroke: SwimStroke; poolLengthMeters: number; displayLength: number; displayUnit: "m" | "yd"; sendOffSeconds?: number }
  | { kind: "set"; exerciseId: string; exerciseName: string; setNumber: number; load?: Load }
  | { kind: "station"; stationId: string; load?: Load }
  | { kind: "run" | "rest" }
  | { kind: "transition"; afterComponentId: string };
export class SportStructureError extends Error {}
function fail(message: string): never { throw new SportStructureError(message); }
function object(value: unknown, label: string): Record<string, any> { if (!value || typeof value !== "object" || Array.isArray(value)) fail(`Invalid ${label}.`); return value as Record<string, any>; }
function keys(value: Record<string, any>, allowed: string[], label: string) { const unknown = Object.keys(value).find(k => !allowed.includes(k)); if (unknown) fail(`Unknown ${label} field: ${unknown}.`); }
function text(value: unknown, label: string, max = 160): string { if (typeof value !== "string" || !value.trim() || value.length > max) fail(`Invalid ${label}.`); return value.trim(); }
function number(value: unknown, label: string, max: number, min = 0.001, whole = false): number { if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max || (whole && !Number.isInteger(value))) fail(`Invalid ${label}.`); return value; }
function zone(value: unknown): string { if (typeof value !== "string" || !/^z[1-7]$/.test(value)) fail("Invalid structure zone."); return value; }
function list(value: unknown, label: string, max = 1000): any[] { if (!Array.isArray(value) || !value.length || value.length > max) fail(`Invalid ${label}: provide 1–${max} ordered entries.`); return value; }
function note(value: unknown) { return value == null ? {} : { note: text(value, "note", 20000) }; }
function estimate(value: unknown) { return value == null ? {} : { estimatedSeconds: number(value, "duration estimate", 86400, 0) }; }
function endpoint(value: unknown, allowed: string[]): StructureEndpoint {
  const e = object(value, "structure endpoint");
  if (!allowed.includes(e.type)) fail("Unsupported endpoint for this structured step.");
  keys(e, ["type", ...(e.type === "time" ? ["seconds"] : e.type === "reps" ? ["reps"] : e.type === "distance" ? ["meters"] : [])], "endpoint");
  if (e.type === "time") return { type: "time", seconds: number(e.seconds, "step seconds", 86400) };
  if (e.type === "distance") return { type: "distance", meters: number(e.meters, "step metres", 1000000, .01) };
  if (e.type === "reps") return { type: "reps", reps: number(e.reps, "exercise repetitions", 10000, 1, true) };
  return { type: "lap" };
}
function load(value: unknown): { load?: Load } {
  if (value === undefined) return {};
  const l = object(value, "load"); keys(l, ["value", "unit"], "load");
  if (!["kg", "lb"].includes(l.unit)) fail("Load unit must be kg or lb.");
  return { load: { value: number(l.value, "load", 2000, 0), unit: l.unit } };
}
function commonStep(value: Record<string, any>): RestStep | PreparationStep | null {
  if (value.kind === "rest") { keys(value, ["kind", "seconds", "note"], "rest"); return { kind: "rest", seconds: number(value.seconds, "rest seconds", 86400), ...note(value.note) }; }
  if (value.kind === "step") {
    keys(value, ["kind", "name", "phase", "zone", "endpoint", "note"], "preparation step");
    if (!["warmup", "cooldown"].includes(value.phase)) fail("Preparation steps must be warmup or cooldown.");
    return { kind: "step", name: text(value.name, "step name"), phase: value.phase, zone: zone(value.zone), endpoint: endpoint(value.endpoint, ["time", "lap"]), ...note(value.note) };
  }
  return null;
}
export function poolLengthMeters(pool: PoolStructure["poolLength"]): number { return Number((pool.value * (pool.unit === "yd" ? .9144 : 1)).toFixed(8)); }
/** Shape validation only; canonicalSession also checks raw steps, duration, targets and safety. */
export function normalizeSportStructure(input: unknown, sport: string): SportStructure {
  const s = object(input, "sport structure");
  if (s.schemaVersion !== 1) fail("Unknown sport structure version.");
  if (s.kind === "pool" && sport === "swim") {
    keys(s, ["schemaVersion", "kind", "poolLength", "steps"], "pool structure");
    const p = object(s.poolLength, "pool length"); keys(p, ["value", "unit"], "pool length");
    if (!["m", "yd"].includes(p.unit)) fail("Pool length unit must be m or yd.");
    const poolLength = { value: number(p.value, "pool length", 150, 1), unit: p.unit as "m" | "yd" };
    // FIT pool length has centimetre resolution; never silently round prescribed pools.
    if (Math.abs(poolLengthMeters(poolLength) * 100 - Math.round(poolLengthMeters(poolLength) * 100)) > .000001) fail("Pool length must be representable exactly in centimetres (25 yd = 22.86 m).");
    const steps: PoolStep[] = list(s.steps, "pool steps").map(raw => {
      const r = object(raw, "pool step"); const common = commonStep(r);
      if (common) { if (common.kind !== "rest") fail("Use explicit lengths for pool warmup/cooldown."); return common; }
      keys(r, ["kind", "name", "phase", "zone", "lengths", "stroke", "estimatedSeconds", "sendOffSeconds", "note"], "pool step");
      if (r.kind !== "lengths" || !["warmup", "active", "cooldown"].includes(r.phase) || !SWIM_STROKES.includes(r.stroke)) fail("Pool steps need explicit lengths, phase and supported stroke.");
      const lengths = number(r.lengths, "pool lengths", 10000, 1, true);
      if (r.stroke === "im" && lengths % 4 !== 0) fail("Individual medley requires equal lengths for four strokes.");
      if (lengths * poolLengthMeters(poolLength) > 1000000) fail("Pool distance exceeds the supported range.");
      return { kind: "lengths", name: text(r.name, "pool step name"), phase: r.phase, zone: zone(r.zone), lengths, stroke: r.stroke, ...estimate(r.estimatedSeconds), ...(r.sendOffSeconds === undefined ? {} : { sendOffSeconds: number(r.sendOffSeconds, "send-off seconds", 86400) }), ...note(r.note) };
    });
    if (!steps.some(step => step.kind === "lengths")) fail("Pool structure needs at least one swimming step.");
    return { schemaVersion: 1, kind: "pool", poolLength, steps };
  }
  if (s.kind === "openWater" && sport === "swim") {
    keys(s, ["schemaVersion", "kind", "steps"], "open-water structure");
    return { schemaVersion: 1, kind: "openWater", steps: list(s.steps, "open-water steps") };
  }
  if (s.kind === "strength" && sport === "strength") {
    keys(s, ["schemaVersion", "kind", "steps"], "strength structure"); const sets = new Map<string, { name: string; last: number }>();
    const steps: StrengthStructure["steps"] = list(s.steps, "strength steps").map(raw => {
      const r = object(raw, "strength step"); const common = commonStep(r); if (common) return common;
      keys(r, ["kind", "exerciseId", "exerciseName", "setNumber", "zone", "endpoint", "load", "estimatedSeconds", "note"], "strength set");
      if (r.kind !== "set") fail("Strength needs explicit individual sets; legacy combined lift text is not a set structure.");
      const exerciseId = text(r.exerciseId, "exercise ID", 80), exerciseName = text(r.exerciseName, "exercise name", 80), setNumber = number(r.setNumber, "set number", 1000, 1, true);
      const prior = sets.get(exerciseId);
      if (setNumber !== (prior?.last ?? 0) + 1 || (prior && prior.name !== exerciseName)) fail("Exercise sets must have a stable name and contiguous ordered set numbers starting at 1.");
      sets.set(exerciseId, { name: exerciseName, last: setNumber });
      return { kind: "set", exerciseId, exerciseName, setNumber, zone: zone(r.zone), endpoint: endpoint(r.endpoint, ["reps", "time", "lap"]), ...load(r.load), ...estimate(r.estimatedSeconds), ...note(r.note) };
    });
    if (!sets.size) fail("Strength structure needs at least one explicit exercise set.");
    return { schemaVersion: 1, kind: "strength", steps };
  }
  if (s.kind === "hyrox" && sport === "hyrox") {
    keys(s, ["schemaVersion", "kind", "steps"], "HYROX structure");
    const steps: HyroxStructure["steps"] = list(s.steps, "HYROX steps").map(raw => {
      const r = object(raw, "HYROX step"); const common = commonStep(r); if (common) return common;
      keys(r, ["kind", "name", "stationId", "zone", "endpoint", "load", "estimatedSeconds", "note"], "HYROX step");
      if (!["run", "station"].includes(r.kind)) fail("HYROX steps need explicit run/station identity.");
      if (r.kind === "run" && (r.stationId !== undefined || r.load !== undefined)) fail("Run steps cannot contain station/load metadata.");
      return { kind: r.kind, name: text(r.name, "HYROX step name", 80), ...(r.kind === "station" ? { stationId: text(r.stationId, "station ID", 80) } : {}), zone: zone(r.zone), endpoint: endpoint(r.endpoint, r.kind === "run" ? ["distance", "time", "lap"] : ["distance", "time", "reps", "lap"]), ...load(r.load), ...estimate(r.estimatedSeconds), ...note(r.note) };
    });
    if (!steps.some(step => step.kind === "station") || !steps.some(step => step.kind === "run")) fail("HYROX structure must supply actual ordered run and station steps.");
    return { schemaVersion: 1, kind: "hyrox", steps };
  }
  if (s.kind === "brick" && sport === "brick") {
    keys(s, ["schemaVersion", "kind", "components", "transitions"], "brick structure"); const ids = new Set<string>();
    const components: BrickComponent[] = list(s.components, "brick components", 10).map(raw => {
      const c = object(raw, "brick component"); keys(c, ["id", "title", "sport", "durationMin", "steps", "sportStructure"], "brick component");
      const id = text(c.id, "component ID", 80); if (ids.has(id)) fail("Brick component IDs must be unique."); ids.add(id);
      if (!["run", "bike", "swim"].includes(c.sport)) fail("Brick component sport must be run, bike or swim.");
      const base = { id, title: text(c.title, "component title"), sport: c.sport, durationMin: number(c.durationMin, "component duration estimate", 1440) };
      if (c.sport === "swim") {
        if (c.steps !== undefined) fail("Swim components need one explicit pool structure, not parallel steps.");
        const structure = normalizeSportStructure(c.sportStructure, "swim");
        if (structure.kind !== "pool") fail("Open-water brick device components are not validated.");
        return { ...base, sportStructure: structure };
      }
      if (c.sportStructure !== undefined) fail("Run/bike components must use explicit steps.");
      return { ...base, steps: list(c.steps, "component steps") };
    });
    if (components.length < 2) fail("A brick needs at least two ordered components.");
    if (!Array.isArray(s.transitions) || s.transitions.length !== components.length - 1) fail("Supply exactly one transition between each pair of brick components.");
    const transitions = s.transitions.map((raw: unknown, i: number) => {
      const t = object(raw, "transition"); keys(t, ["afterComponentId", "instruction", "endpoint"], "transition");
      if (t.afterComponentId !== components[i].id) fail("Transitions must follow component order.");
      return { afterComponentId: t.afterComponentId, instruction: text(t.instruction, "transition instruction", 20000), endpoint: endpoint(t.endpoint, ["time", "lap"]) };
    });
    return { schemaVersion: 1, kind: "brick", components, transitions };
  }
  fail("Sport structure kind does not match the session sport.");
}
export function sportStructureSteps(structure: Exclude<SportStructure, BrickStructure>): { step: WorkoutStep; detail?: SportStepDetail }[] {
  if (structure.kind === "openWater") return structure.steps.map(step => ({ step }));
  return structure.steps.map(item => {
    if (item.kind === "rest") return { step: { name: "Rest", phase: "recovery", zone: "z1", seconds: item.seconds, endpoint: { type: "time", seconds: item.seconds }, target: { type: "open" }, note: item.note }, detail: { kind: "rest" } };
    if (item.kind === "step") return { step: { ...item, seconds: item.endpoint.type === "time" ? item.endpoint.seconds : 0, target: { type: "open" } } };
    if (item.kind === "lengths" && structure.kind === "pool") {
      const meters = poolLengthMeters(structure.poolLength);
      return { step: { name: item.name, phase: item.phase, zone: item.zone, seconds: item.estimatedSeconds ?? 0, endpoint: { type: "distance", meters: Number((meters * item.lengths).toFixed(8)) }, target: { type: "open" }, note: item.note }, detail: { kind: "pool", lengths: item.lengths, stroke: item.stroke, poolLengthMeters: meters, displayLength: structure.poolLength.value, displayUnit: structure.poolLength.unit, ...(item.sendOffSeconds !== undefined ? { sendOffSeconds: item.sendOffSeconds } : {}) } };
    }
    if (item.kind === "set") return { step: { name: `${item.exerciseName} · set ${item.setNumber}`, phase: "active", zone: item.zone, endpoint: item.endpoint, seconds: item.endpoint.type === "time" ? item.endpoint.seconds : item.estimatedSeconds ?? 0, target: { type: "open" }, note: item.note }, detail: { kind: "set", exerciseId: item.exerciseId, exerciseName: item.exerciseName, setNumber: item.setNumber, ...(item.load ? { load: item.load } : {}) } };
    if (item.kind === "station" || item.kind === "run") return { step: { name: item.name, phase: "active", zone: item.zone, endpoint: item.endpoint, seconds: item.endpoint.type === "time" ? item.endpoint.seconds : item.estimatedSeconds ?? 0, target: { type: "open" }, note: item.note }, detail: item.kind === "run" ? { kind: "run" } : { kind: "station", stationId: item.stationId!, ...(item.load ? { load: item.load } : {}) } };
    return fail("Unsupported sport step.");
  });
}
/** Essential metadata shown on every screen and placed first in FIT notes. */
export function sportStepInstruction(detail?: SportStepDetail): string {
  if (!detail) return "";
  if (detail.kind === "pool") return `${detail.lengths} lengths × ${detail.displayLength} ${detail.displayUnit}; ${detail.stroke}${detail.sendOffSeconds !== undefined ? `; send-off every ${detail.sendOffSeconds} s from interval start (not fixed rest)` : ""}.`;
  if (detail.kind === "set") return `Exercise ${detail.exerciseId}; set ${detail.setNumber}${detail.load ? `; load ${detail.load.value} ${detail.load.unit}` : "; load not supplied"}.`;
  if (detail.kind === "station") return `Station ${detail.stationId}${detail.load ? `; load ${detail.load.value} ${detail.load.unit}` : "; load not supplied"}.`;
  return detail.kind === "run" ? "Run segment." : "";
}
