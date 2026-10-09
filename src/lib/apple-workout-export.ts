// Server-only file bridge. This is JMM JSON, never an Apple .workout binary.
import { createHash } from "node:crypto";
import type { CanonicalSession, CanonicalStep, ResolvedTarget } from "./canonical-session";

export const APPLE_WORKOUT_MAX_STEPS = 50; // Conservative product policy, not an Apple SDK limit.
export const APPLE_WORKOUT_MAX_BYTES = 256 * 1024;
export class AppleWorkoutExportError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}
export type AppleWorkoutStep = {
  name: string;
  phase: CanonicalStep["phase"];
  endpoint: { type: "time"; seconds: number } | { type: "distance"; meters: number } | { type: "lap" };
  target: Omit<ResolvedTarget, "stroke"> & { type: "open" | "power" | "heartRate" | "pace" | "speed" };
  note?: string;
  group?: string;
};
export type AppleWorkoutExport = {
  schemaVersion: 1;
  kind: "jmm.apple.workout";
  planId: string;
  sessionId: string;
  revision: string;
  revisionNumber: number; // Opaque hash-derived value: NEVER a chronological sequence.
  exportedAt: string;
  dateLocal: string;
  timezone: string;
  title: string;
  sport: "run" | "bike";
  steps: AppleWorkoutStep[];
  hardwareVerified: false;
  localSchedulerOnly: true;
};
const fail = (message: string): never => { throw new AppleWorkoutExportError(message); };
const text = (value: unknown, max: number, label: string) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max ? value : fail(`Invalid ${label}.`);
const number = (value: unknown, min: number, max: number, label: string) =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : fail(`Invalid ${label}.`);

/** Stable per athlete+session, including when prescription, date, or targets change. */
export function appleWorkoutPlanId(athleteId: string, sessionId: string): string {
  const bytes = createHash("sha256").update(JSON.stringify(["jmm.apple.plan.v1", athleteId, sessionId])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x80; // UUID v8, deterministic application-defined identity.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function buildAppleWorkoutExport(session: CanonicalSession, now: Date = new Date()): AppleWorkoutExport {
  if (session.schemaVersion !== 2) fail("Unsupported canonical session version.");
  if (session.verdict !== "ready") throw new AppleWorkoutExportError(session.reason || "This session is not ready for export.", 409);
  if (session.sport !== "run" && session.sport !== "bike") fail("Apple companion currently supports explicit run and bike sessions only.");
  if (session.components?.length || session.sportStructure) fail("Structured multisport/skill sessions require a supported native mapper; no details are discarded.");
  text(session.athleteId, 500, "athlete identity");
  text(session.id, 500, "session identity");
  text(session.title, 300, "workout title");
  if (!/^[a-f0-9]{64}$/.test(session.revision)) fail("Invalid canonical revision.");
  if (!Number.isSafeInteger(session.revisionNumber) || session.revisionNumber < 0) fail("Invalid revision number.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(session.dateLocal) || !Number.isFinite(Date.parse(`${session.dateLocal}T12:00:00Z`)) || new Date(`${session.dateLocal}T12:00:00Z`).toISOString().slice(0, 10) !== session.dateLocal) fail("Invalid scheduled date.");
  try { new Intl.DateTimeFormat("en", { timeZone: session.timezone }).format(now); } catch { fail("Invalid workout timezone or export time."); }
  text(session.timezone, 100, "timezone");
  if (!Array.isArray(session.steps) || !session.steps.length || session.steps.length > APPLE_WORKOUT_MAX_STEPS) fail(`Apple companion requires 1–${APPLE_WORKOUT_MAX_STEPS} explicit steps; no steps were truncated.`);
  const steps = session.steps.map((step, index): AppleWorkoutStep => {
    text(step.name, 1000, "step name");
    if (!["warmup", "active", "recovery", "cooldown"].includes(step.phase)) fail("Unsupported step phase.");
    if ((step.phase === "warmup" && index !== 0) || (step.phase === "cooldown" && index !== session.steps.length - 1)) fail("Apple supports one leading warmup and one trailing cooldown; rearranging or merging steps would change the workout.");
    if (step.sportDetail || step.componentId || step.componentSport) fail("This step contains unsupported sport details.");
    const endpoint = step.endpoint;
    if (endpoint.type === "time") number(endpoint.seconds, 0.001, 86400, "step seconds");
    else if (endpoint.type === "distance") number(endpoint.meters, 0.01, 1000000, "step distance");
    else if (endpoint.type !== "lap") fail("Repetition endpoints cannot be represented by this Apple companion.");
    const t = step.target;
    if (!["open", "power", "heartRate", "pace", "speed"].includes(t.type) || t.stroke !== undefined) fail("Unsupported Apple workout target; it was not converted to open effort.");
    if (!["explicit", "profile_reference", "effort"].includes(t.source)) fail("Invalid target source.");
    text(t.label, 1000, "target label");
    if (t.type === "open") {
      if (t.low !== undefined || t.high !== undefined) fail("Open targets cannot carry numeric bounds.");
    } else {
      const max = t.type === "power" ? 3000 : t.type === "heartRate" ? 250 : t.type === "pace" ? 3600 : 50;
      const min = t.type === "power" ? 0 : t.type === "heartRate" ? 1 : t.type === "pace" ? 20 : 0.001;
      number(t.low, min, max, "target lower bound"); number(t.high, Math.max(min, Number.MIN_VALUE), max, "target upper bound");
      if (t.low! > t.high!) fail("Target lower bound exceeds upper bound.");
      if ((t.type === "power" || t.type === "heartRate") && (!Number.isInteger(t.low) || !Number.isInteger(t.high))) fail("Power and heart-rate targets require whole units.");
    }
    for (const key of ["note", "group"] as const) if (step[key] !== undefined) text(step[key], 20000, `step ${key}`);
    if (t.missingReason !== undefined) text(t.missingReason, 2000, "target missing reason");
    return {
      name: step.name, phase: step.phase,
      endpoint: endpoint.type === "time" ? { type: "time", seconds: endpoint.seconds } : endpoint.type === "distance" ? { type: "distance", meters: endpoint.meters } : { type: "lap" },
      target: { type: t.type as AppleWorkoutStep["target"]["type"], label: t.label, source: t.source, ...(t.low !== undefined ? { low: t.low, high: t.high } : {}), ...(t.missingReason ? { missingReason: t.missingReason } : {}) },
      ...(step.note ? { note: step.note } : {}), ...(step.group ? { group: step.group } : {}),
    };
  });
  const result: AppleWorkoutExport = {
    schemaVersion: 1, kind: "jmm.apple.workout", planId: appleWorkoutPlanId(session.athleteId, session.id),
    sessionId: session.id, revision: session.revision, revisionNumber: session.revisionNumber,
    exportedAt: now.toISOString(), dateLocal: session.dateLocal, timezone: session.timezone,
    title: session.title, sport: session.sport as "run" | "bike", steps, hardwareVerified: false, localSchedulerOnly: true,
  };
  if (Buffer.byteLength(JSON.stringify(result), "utf8") > APPLE_WORKOUT_MAX_BYTES) fail("Apple companion file exceeds the 256 KiB import limit.");
  return result;
}
