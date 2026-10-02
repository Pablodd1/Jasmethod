// Server-side canonical workout boundary. Consumers must not infer steps from prose.
import { createHash } from "node:crypto";
import type { WorkoutStep } from "./prescription";
import { normalizeSportStructure, sportStructureSteps, sportStepInstruction, SportStructureError, type SportStructure, type SportStepDetail, type SwimStroke } from "./sport-structure";

export const SESSION_SCHEMA_VERSION = 2;
export const FIT_STEP_LIMIT = 50; // Conservative device policy, not a FIT format limit.
export const SPORTS = ["run", "bike", "swim", "strength", "mobility", "recovery", "brick", "hyrox", "boxing"] as const;
export type SessionSport = typeof SPORTS[number];
export type StepEndpoint = { type: "time"; seconds: number } | { type: "distance"; meters: number } | { type: "reps"; reps: number } | { type: "lap" };
export interface TargetProfile {
  ftp?: number | null; lthr?: number | null; runPaceBase?: number | null; swimPaceBase?: number | null;
  units?: string | null; intensityPct?: number | null; injured?: boolean | null;
  weightKg?: number | null; sweatRateMlH?: number | null; sodiumMgPerL?: number | null; gutTrained?: boolean | null;
  goal?: string | null; experience?: string | null; weeklyHours?: number | null; birthYear?: number | null;
}
export interface ResolvedTarget {
  type: "open" | "power" | "heartRate" | "pace" | "speed" | "swimStroke";
  stroke?: SwimStroke;
  low?: number; high?: number;
  label: string;
  source: "explicit" | "profile_reference" | "effort";
  missingReason?: string;
}
export interface CanonicalStep extends Omit<WorkoutStep, "target"> {
  endpoint: StepEndpoint;
  target: ResolvedTarget;
  sportDetail?: SportStepDetail;
  componentId?: string;
  componentSport?: SessionSport;
}
export interface ExportCapability {
  mode: "native" | "generic" | "split" | "unavailable";
  available: boolean;
  fitSport: "running" | "cycling" | "swimming" | "generic" | null;
  fitSubSport?: "generic" | "lapSwimming";
  downloadFormat?: "fit" | "zip";
  reason: string;
  deviceTested: false;
}
export interface CanonicalSession {
  schemaVersion: 2; id: string; athleteId: string; revision: string; revisionNumber: number;
  dateLocal: string; timezone: string; title: string; sport: SessionSport; durationMin: number;
  verdict: "ready" | "rest" | "blocked"; reason: string; steps: CanonicalStep[];
  exactTimeSeconds: number | null; capability: ExportCapability;
  sportStructure?: SportStructure;
  components?: CanonicalSession[];
}
export class SessionResolutionError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}
function fail(message: string): never { throw new SessionResolutionError(message); }
const obj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown, min: number, max: number, label: string): number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fail(`Invalid ${label}.`);
const positive = (v: unknown, max: number, label: string) => finite(v, Number.MIN_VALUE, max, label);
const integer = (v: unknown, max: number, label: string) => {
  const n = positive(v, max, label); return Number.isInteger(n) ? n : fail(`Invalid ${label}: use a whole number.`);
};
const paceText = (seconds: number) => `${Math.floor(Math.round(seconds) / 60)}:${String(Math.round(seconds) % 60).padStart(2, "0")}`;

export function resolveStepTarget(step: Pick<WorkoutStep, "zone" | "target">, sport: string, profile?: TargetProfile | null): ResolvedTarget {
  const z = Number(step.zone.slice(1));
  const rpe = [0, 2, 3, 5, 7, 8, 9, 10][z];
  const explicit = step.target;
  const label = (type: ResolvedTarget["type"], low: number, high: number) => {
    if (type === "pace") {
      const factor = profile?.units === "imperial" ? 1.609344 : 1;
      return `${paceText(low * factor)}${low === high ? "" : `–${paceText(high * factor)}`}/${factor === 1 ? "km" : "mi"} (plan reference)`;
    }
    const unit = type === "power" ? "W" : type === "heartRate" ? "bpm" : "m/s";
    return low === high ? `${high} ${unit}` : low === 0 ? `≤${high} ${unit}` : `${low}–${high} ${unit}`;
  };
  if (explicit !== undefined) {
    if (!obj(explicit) || !["open", "power", "heartRate", "pace", "speed"].includes(explicit.type)) fail("Unknown step target type.");
    if (explicit.type === "open") {
      if (explicit.low != null || explicit.high != null) fail("Open targets cannot contain numeric bounds.");
      return { type: "open", source: "explicit", label: `Open effort · RPE ${rpe}/10` };
    }
    const max = explicit.type === "power" ? 3000 : explicit.type === "heartRate" ? 250 : explicit.type === "pace" ? 3600 : 50;
    const low = finite(explicit.low, explicit.type === "power" ? 0 : explicit.type === "pace" ? 20 : explicit.type === "speed" ? .001 : Number.MIN_VALUE, max, "target lower bound");
    const high = positive(explicit.high, max, "target upper bound");
    if (low > high) fail("Target lower bound exceeds upper bound.");
    if (["power", "heartRate"].includes(explicit.type) && (!Number.isInteger(low) || !Number.isInteger(high))) fail("Power and heart-rate targets require whole units.");
    return { type: explicit.type, low, high, label: label(explicit.type, low, high), source: "explicit" };
  }
  // Endurance anchors are not universal prescriptions for skill/strength sports.
  if (!["run", "bike"].includes(sport)) return { type: "open", source: "effort", label: `Open effort · RPE ${rpe}/10` };
  if (sport === "bike" && profile?.ftp != null) {
    const ftp = positive(profile.ftp, 1000, "FTP anchor");
    const high = Math.round(ftp * [0, .55, .75, .9, 1.05, 1.2, 1.5, 1.5][z]);
    return { type: "power", low: 0, high, source: "profile_reference", label: `${label("power", 0, high)} (FTP plan reference)` };
  }
  if (sport === "run" && profile?.runPaceBase != null) {
    const pace = positive(profile.runPaceBase, 3600, "running pace anchor") * [0, 1.4, 1.2, 1.08, 1, .95, .9, .85][z];
    return { type: "pace", low: pace, high: pace, source: "profile_reference", label: label("pace", pace, pace) };
  }
  if (profile?.lthr != null) {
    const high = Math.round(positive(profile.lthr, 240, "LTHR anchor") * [0, .8, .89, .94, 1, 1.05, 1.1, 1.1][z]);
    if (high > 250) fail("Resolved heart-rate target exceeds the supported range.");
    return { type: "heartRate", low: 1, high, source: "profile_reference", label: `≤${high} bpm (LTHR plan reference)` };
  }
  return { type: "open", source: "effort", label: `Open effort · RPE ${rpe}/10`, missingReason: sport === "bike" ? "No validated, dated FTP or sport-specific LTHR benchmark is available." : "No validated, dated running pace or sport-specific LTHR benchmark is available." };
}

export function normalizeSteps(input: unknown, sport: SessionSport, profile?: TargetProfile | null): CanonicalStep[] {
  if (!Array.isArray(input) || !input.length) fail("The saved prescription has no executable steps.");
  const flat: Record<string, any>[] = [];
  const expand = (nodes: unknown[], depth = 0, group?: string) => {
    if (depth > 4) fail("Repeat nesting is too deep.");
    for (const node of nodes) {
      if (!obj(node)) fail("Malformed workout step.");
      if (node.repeat !== undefined) {
        const count = integer(node.repeat, 100, "repeat count");
        if (!Array.isArray(node.steps) || !node.steps.length) fail("A repeat must contain explicit steps.");
        for (let i = 0; i < count; i++) expand(node.steps, depth + 1, node.group || `Repeat ${i + 1}/${count}`);
      } else {
        if (flat.length >= 1000) fail("Expanded prescription exceeds the safety limit.");
        flat.push({ ...node, group: node.group ?? group });
      }
    }
  };
  expand(input);
  return flat.map((step) => {
    if (typeof step.name !== "string" || !step.name.trim() || step.name.length > 1000) fail("Every step needs a valid name.");
    if (!["warmup", "active", "recovery", "cooldown"].includes(step.phase)) fail("Unknown workout step phase.");
    if (typeof step.zone !== "string" || !/^z[1-7]$/.test(step.zone)) fail("Invalid workout step zone.");
    for (const key of ["note", "group"]) if (step[key] != null && (typeof step[key] !== "string" || step[key].length > 20000)) fail(`Invalid step ${key}.`);
    let endpoint: StepEndpoint;
    const ep = step.endpoint;
    if (ep !== undefined) {
      if (!obj(ep)) fail("Invalid step endpoint.");
      if (ep.type === "time") endpoint = { type: "time", seconds: finite(ep.seconds, 0.001, 86400, "step seconds") };
      else if (ep.type === "distance") endpoint = { type: "distance", meters: finite(ep.meters, 0.01, 1000000, "step distance") };
      else if (ep.type === "reps") endpoint = { type: "reps", reps: integer(ep.reps, 10000, "exercise reps") };
      else if (ep.type === "lap") endpoint = { type: "lap" };
      else fail("Unknown step endpoint type.");
      if (step.reps != null && (endpoint.type !== "reps" || step.reps !== endpoint.reps)) fail("Conflicting exercise reps and endpoint.");
      if (endpoint.type === "time" && step.seconds != null && step.seconds !== endpoint.seconds) fail("Conflicting time endpoints.");
    } else if (step.reps != null) endpoint = { type: "reps", reps: integer(step.reps, 10000, "exercise reps") };
    else endpoint = { type: "time", seconds: finite(step.seconds, 0.001, 86400, "step seconds") };
    // seconds is retained ONLY as an estimate for non-time steps, never encoded as duration.
    const seconds = endpoint.type === "time" ? endpoint.seconds : step.seconds == null ? 0 : finite(step.seconds, 0, 86400, "duration estimate");
    return { name: step.name, seconds, zone: step.zone, phase: step.phase, ...(step.note ? { note: step.note } : {}), ...(step.group ? { group: step.group } : {}), ...(endpoint.type === "reps" ? { reps: endpoint.reps } : {}), endpoint, target: resolveStepTarget(step as WorkoutStep, sport, profile) };
  });
}

export function exportCapability(sport: SessionSport, steps: CanonicalStep[], verdict: CanonicalSession["verdict"], structure?: SportStructure, components?: CanonicalSession[]): ExportCapability {
  const no = (reason: string): ExportCapability => ({ mode: "unavailable", available: false, fitSport: null, reason, deviceTested: false });
  if (verdict !== "ready" || !steps.length) return no("No executable workout: resolve the safety/check-in requirement in the app.");
  if (sport === "brick") {
    if (structure?.kind !== "brick" || !components?.length) return no("A brick needs explicit ordered sport components and transitions. A single-file multisport workout is unvalidated.");
    const unavailable = components.find(c => !c.capability.available);
    if (unavailable) return no(`Component ${unavailable.title}: ${unavailable.capability.reason}`);
    return { mode: "split", available: true, fitSport: null, downloadFormat: "zip", reason: "Separate ordered sport FIT files plus a transition manifest (.ZIP). Start each component manually; transitions remain in the manifest/app. Single-file multisport and hardware compatibility are unverified.", deviceTested: false };
  }
  if (steps.length > FIT_STEP_LIMIT) return no(`This session has ${steps.length} steps; the conservative device policy allows ${FIT_STEP_LIMIT}. No steps were truncated.`);
  if (sport === "swim") {
    if (structure?.kind === "openWater") return no("Open-water swim is distinct from pool swimming. Its structured-workout device workflow is unverified; use full web instructions.");
    if (structure?.kind !== "pool") return no("Pool/open-water context, pool length, stroke and explicit lengths/rests are missing. Legacy prose is not converted into a pool workout.");
    if (steps.some(s => s.sportDetail?.kind === "pool" && s.sportDetail.sendOffSeconds !== undefined)) return no("Send-off intervals are preserved in the app, but their start-to-start timing is not validated in this FIT encoder. They are never converted into fixed rests.");
    return { mode: "native", available: true, fitSport: "swimming", fitSubSport: "lapSwimming", downloadFormat: "fit", reason: "Pool lengths, strokes and explicit rests are SDK round-trip validated. Hardware transfer/execution remain unverified; inspect pool length and every step before swimming.", deviceTested: false };
  }
  if (["strength", "hyrox"].includes(sport)) {
    if (structure?.kind !== sport) return no(sport === "strength" ? "Individual exercise/set/reps/rest identity is missing. Legacy combined lift prose is not converted into a workout." : "Explicit run/station/load/endpoint structure is missing. No HYROX station data is inferred from prose.");
    if (steps.some(s => s.target.type !== "open")) return no("Generic strength/HYROX companions require explicit open effort.");
    if (steps.some(s => Buffer.byteLength(companionInstruction(s), "utf8") > 180)) return no("Essential exercise/station identity exceeds the safe FIT note limit. Shorten explicit IDs/names; the full web guidance is preserved.");
    return { mode: "generic", available: true, fitSport: "generic", downloadFormat: "fit", reason: "Generic timed/lap companion: complete each prescribed reps/distance step, then press LAP. Exercise/station identity, load and original endpoints remain in notes/app. Native strength/HYROX semantics and device support are unverified.", deviceTested: false };
  }
  if (["mobility", "recovery", "boxing"].includes(sport)) {
    if (steps.some(s => !["time", "lap"].includes(s.endpoint.type) || s.target.type !== "open")) return no("This generic companion supports only explicit timed/lap steps with open effort. Use the full web instructions.");
    return { mode: "generic", available: true, fitSport: "generic", downloadFormat: "fit", reason: "Generic timed/lap companion; full technique guidance stays in the app. Device compatibility is unverified.", deviceTested: false };
  }
  if (steps.some(s => s.endpoint.type === "reps")) return no("Exercise-repetition endpoints are not validated for this endurance activity profile.");
  return { mode: "native", available: true, fitSport: sport === "run" ? "running" : "cycling", downloadFormat: "fit", reason: "Structured FIT encoding supported. Transfer and execution on your device are unverified; inspect every step before training.", deviceTested: false };
}
/** Exact endpoint conversion is disclosed, never passed off as native rep/distance tracking. */
export function companionInstruction(step: CanonicalStep): string {
  const e = step.endpoint;
  const action = e.type === "reps" ? `Complete ${e.reps} reps, then press LAP.` : e.type === "distance" ? `Complete ${e.meters} m, then press LAP.` : e.type === "lap" ? "Press LAP when this step is complete." : `Continue for ${e.seconds} s.`;
  return [step.name, sportStepInstruction(step.sportDetail), action].filter(Boolean).join(" ");
}

export interface CanonicalSessionInput {
  athleteId: string; workout: Record<string, any>; prescription: unknown; profile?: TargetProfile | null;
  dateLocal: string; timezone: string;
  revisionContext?: unknown;
  safety?: { status: "clear" | "unknown" | "hold" | "urgent"; reason: string; [key: string]: unknown };
}
export function canonicalSession(input: CanonicalSessionInput): CanonicalSession {
  const { workout: w, profile, safety } = input;
  if (w.userId != null && w.userId !== input.athleteId) fail("Session does not belong to this athlete.");
  if (!SPORTS.includes(w.sport)) fail("Unsupported workout sport.");
  if (typeof w.title !== "string" || !w.title.trim()) fail("Workout title is missing.");
  finite(w.durationMin, 0, 1440, "workout duration");
  let p: any = input.prescription;
  let sport = w.sport as SessionSport;
  let verdict: CanonicalSession["verdict"] = "ready", reason = "Resolved saved prescription.";
  let steps: CanonicalStep[] = [];
  let sportStructure: SportStructure | undefined;
  let components: CanonicalSession[] | undefined;
  // A retained explicit source may be held at zero minutes after adaptation.
  // Reading its explanation never reconstructs executable steps.
  let structureHoldReason: string | undefined;
  if (w.durationMin === 0) {
    try { const held = typeof p === "string" ? JSON.parse(p) : p; if (obj(held) && typeof held.structureReviewRequired === "string") structureHoldReason = held.structureReviewRequired; } catch { /* rest remains rest */ }
  }
  if (profile?.injured || w.planDay?.dayOff || w.dayOff || w.durationMin === 0) {
    verdict = "rest"; reason = profile?.injured ? "A current injury restriction blocks training." : w.planDay?.dayOff || w.dayOff ? "Rest day has no workout to export." : structureHoldReason || "Rest day has no workout to export.";
  } else if (safety && safety.status !== "clear") {
    verdict = safety.status === "unknown" ? "blocked" : "rest"; reason = safety.reason;
  } else {
    try {
      if (typeof p === "string") p = JSON.parse(p);
      if (!obj(p)) fail("No saved prescription. Complete the session-day check-in before training or export.");
      if (p.sport !== undefined && p.sport !== w.sport) {
        // Existing reviewed protocol adaptation substitutes gentle mobility for
        // a paused strength protocol. Keep that explicit substitution faithful.
        if (w.sport === "strength" && p.sport === "mobility" && p.verdict === "easy") sport = "mobility";
        else fail("Saved prescription sport differs from the session; refresh the plan.");
      }
      if (p.verdict === "rest" || p.durationMin === 0) { verdict = "rest"; reason = typeof p.structureReviewRequired === "string" ? p.structureReviewRequired : "The saved prescription requires rest."; }
      else {
        if (p.verdict !== undefined && !["full", "trim", "easy", "planned"].includes(p.verdict)) fail("Unrecognized prescription safety verdict.");
        if (p.durationMin != null) positive(p.durationMin, 1440, "prescription duration");
        if (p.sportStructure !== undefined) {
          sportStructure = normalizeSportStructure(p.sportStructure, sport);
          if (sportStructure.kind === "brick") {
            const structure = sportStructure;
            components = structure.components.map(component => {
              const child = canonicalSession({ ...input, workout: { ...w, id: `${w.id}:${component.id}`, sport: component.sport, title: component.title, durationMin: component.durationMin }, prescription: { sport: component.sport, title: component.title, verdict: p.verdict, durationMin: component.durationMin, steps: component.steps, sportStructure: component.sportStructure } });
              if (child.verdict !== "ready") fail(`Component ${component.title}: ${child.reason}`);
              return child;
            });
            const estimatedMinutes = components.reduce((sum, c) => sum + c.durationMin, 0) + structure.transitions.reduce((sum, t) => sum + (t.endpoint.type === "time" ? t.endpoint.seconds / 60 : 0), 0);
            if (estimatedMinutes > (p.durationMin ?? w.durationMin) + .000001) fail("Component durations and timed transitions exceed the brick's declared time budget.");
            steps = components.flatMap((component, i) => {
              const rows: CanonicalStep[] = component.steps.map(step => ({ ...step, componentId: structure.components[i].id, componentSport: component.sport, group: `${i + 1}. ${component.title}${step.group ? ` · ${step.group}` : ""}` }));
              const transition = structure.transitions[i];
              if (transition) rows.push({ name: `Transition ${i + 1}`, zone: "z1", phase: "recovery", endpoint: transition.endpoint, seconds: transition.endpoint.type === "time" ? transition.endpoint.seconds : 0, note: transition.instruction, target: { type: "open", source: "explicit", label: "Manual transition; follow the app/manifest instructions" }, sportDetail: { kind: "transition", afterComponentId: transition.afterComponentId } });
              return rows;
            });
            if (steps.length > 1000) fail("Expanded brick exceeds the 1,000-step safety limit.");
          } else {
            const entries = sportStructureSteps(sportStructure);
            steps = normalizeSteps(entries.map(e => e.step), sport, profile).map((step, i) => {
              const detail = entries[i].detail;
              return { ...step, ...(detail ? { sportDetail: detail } : {}), note: [sportStepInstruction(detail), step.note].filter(Boolean).join(" ") || undefined,
                ...(detail?.kind === "pool" ? { target: { type: "swimStroke" as const, stroke: detail.stroke, source: "explicit" as const, label: `${detail.stroke} · ${step.target.label}` } } : {}) };
            });
          }
        } else steps = normalizeSteps(p.steps, sport, profile);
        if (steps.every(s => s.endpoint.type === "time") && Math.abs(steps.reduce((sum, s) => sum + s.seconds, 0) - (p.durationMin ?? w.durationMin) * 60) > 0.001) fail("Step durations do not match the prescribed total. Review the session before exporting.");
      }
    } catch (error) { steps = []; sportStructure = undefined; components = undefined; verdict = "blocked"; reason = error instanceof SessionResolutionError || error instanceof SportStructureError ? error.message : "The saved prescription is malformed. Review it before training or export."; }
  }
  const core = { schemaVersion: SESSION_SCHEMA_VERSION as 2, id: String(w.id || ""), athleteId: input.athleteId, dateLocal: input.dateLocal, timezone: input.timezone, title: typeof p?.title === "string" ? p.title : w.title, sport, durationMin: verdict === "ready" ? (p?.durationMin ?? w.durationMin) : 0, verdict, reason, steps, exactTimeSeconds: steps.length && steps.every(s => s.endpoint.type === "time") ? steps.reduce((sum, s) => sum + (s.endpoint.type === "time" ? s.endpoint.seconds : 0), 0) : null, capability: exportCapability(sport, steps, verdict, sportStructure, components), ...(sportStructure ? { sportStructure } : {}), ...(components ? { components } : {}) };
  const revision = createHash("sha256").update(JSON.stringify({ core, source: [w.prescription, w.originalPlan, w.intensity, w.notes, w.startTime], actuals: [w.feedbackStatus, w.feedbackAt, w.feedbackNote, w.actualDurationMin, w.actualSport, w.actualDetails, w.rpe, w.completed, w.distanceKm, w.avgHr, w.avgPower], profile: [profile?.ftp, profile?.lthr, profile?.runPaceBase, profile?.swimPaceBase, profile?.intensityPct, profile?.injured, profile?.units, profile?.weightKg, profile?.sweatRateMlH, profile?.sodiumMgPerL, profile?.gutTrained], safety, context: input.revisionContext })).digest("hex");
  return { ...core, revision, revisionNumber: parseInt(revision.slice(0, 12), 16) };
}
export function requireSessionRevision(session: CanonicalSession, expected: unknown) {
  if (expected != null && expected !== session.revision) throw new SessionResolutionError("This session or its safety/targets changed. Reload the workout before downloading.", 409);
}
export function requireExportable(session: CanonicalSession) {
  if (session.verdict !== "ready") throw new SessionResolutionError(session.reason, 409);
  if (!session.capability.available) throw new SessionResolutionError(session.capability.reason, 422);
}
export function fitFilename(session: CanonicalSession): string {
  const slug = session.title.normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45).toLowerCase() || "workout";
  const id = createHash("sha256").update(`${session.athleteId}:${session.id}`).digest("hex").slice(0, 8);
  return `${session.dateLocal}-${session.sport}-${slug}-${id}-${session.revision.slice(0, 8)}.fit`;
}
