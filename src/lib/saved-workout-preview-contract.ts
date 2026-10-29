import type { CanonicalStep, SessionSport } from "./canonical-session";

// Deliberately not a CanonicalSession or UniversalWorkoutCard: a saved plan is
// not a session-day readiness decision, execution token, or delivery receipt.
export type SavedPreviewStep = Pick<CanonicalStep,
  "name" | "seconds" | "zone" | "phase" | "endpoint" | "target" | "note" | "group" | "componentSport">;
export interface SavedWorkoutPreview {
  kind: "saved_plan_preview";
  sessionId: string;
  available: boolean;
  reason: string;
  session: null | {
    title: string;
    sport: SessionSport;
    dateLocal: string;
    timezone: string;
    durationMin: number;
    exactTimeSeconds: number | null;
    steps: SavedPreviewStep[];
  };
}

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const keys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every(key => allowed.includes(key));
const text = (value: unknown, max: number) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= max;
const member = (value: unknown, allowed: string[]): value is string =>
  typeof value === "string" && allowed.includes(value);
const number = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const sports = ["run", "bike", "swim", "strength", "mobility", "recovery", "brick", "hyrox", "boxing"];
export const validSavedSessionId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_:-]{0,199}$/.test(value);

function validStep(value: unknown): value is SavedPreviewStep {
  if (!object(value) || !keys(value, ["name", "seconds", "zone", "phase", "endpoint", "target", "note", "group", "componentSport"]) ||
    !text(value.name, 1000) || !number(value.seconds, 0, 86400) ||
    typeof value.zone !== "string" || !/^z[1-7]$/.test(value.zone) ||
    !member(value.phase, ["warmup", "active", "recovery", "cooldown"]) ||
    (value.componentSport !== undefined && !member(value.componentSport, sports)) ||
    !["note", "group"].every(key => value[key] === undefined || text(value[key], 20000))) return false;
  const e = value.endpoint, t = value.target;
  if (!object(e) || !object(t)) return false;
  if (e.type === "time") {
    if (!keys(e, ["type", "seconds"]) || !number(e.seconds, .001, 86400) || e.seconds !== value.seconds) return false;
  } else if (e.type === "distance") {
    if (!keys(e, ["type", "meters"]) || !number(e.meters, .01, 1000000)) return false;
  } else if (e.type === "reps") {
    if (!keys(e, ["type", "reps"]) || !number(e.reps, 1, 10000) || !Number.isInteger(e.reps)) return false;
  } else if (e.type !== "lap" || !keys(e, ["type"])) return false;
  if (!keys(t, ["type", "low", "high", "label", "source", "missingReason", "stroke", "reference"]) ||
    !text(t.label, 20000) || !member(t.source, ["explicit", "profile_reference", "effort"]) ||
    (t.missingReason !== undefined && !text(t.missingReason, 20000))) return false;
  if(t.reference!==undefined){const r=t.reference;if(t.source!=="profile_reference"||!object(r)||!keys(r,["source","observedAt","unit","value"])||!member(r.source,["athlete_reported_reference","applied_field_test","estimated_from_applied_5k"])||!member(r.unit,["W","sec/km","sec/100m"])||!number(r.value,.001,3600)||!text(r.observedAt,35)||!/^\d{4}-\d{2}-\d{2}(?:T[0-9:.]+Z)?$/.test(String(r.observedAt))||!Number.isFinite(Date.parse(String(r.observedAt))))return false;}
  if (t.type === "open" || t.type === "swimStroke") {
    if (t.low !== undefined || t.high !== undefined) return false;
    return t.type === "open" ? t.stroke === undefined :
      member(t.stroke, ["freestyle", "backstroke", "breaststroke", "butterfly", "drill", "mixed", "im"]);
  }
  if (t.stroke !== undefined) return false;
  const limits: Record<string, [number, number]> = { power: [0, 3000], heartRate: [Number.MIN_VALUE, 250], pace: [20, 3600], speed: [.001, 50] };
  const range = member(t.type, ["power", "heartRate", "pace", "speed"]) ? limits[t.type] : undefined;
  return !!range && number(t.low, range[0], range[1]) && number(t.high, Math.max(range[0], Number.MIN_VALUE), range[1]) &&
    t.low <= t.high && (!member(t.type, ["power", "heartRate"]) || (Number.isInteger(t.low) && Number.isInteger(t.high)));
}

export function isSavedWorkoutPreview(value: unknown): value is SavedWorkoutPreview {
  if (!object(value) || !keys(value, ["kind", "sessionId", "available", "reason", "session"]) ||
    value.kind !== "saved_plan_preview" || !validSavedSessionId(value.sessionId) ||
    typeof value.available !== "boolean" || !text(value.reason, 20000)) return false;
  if (!value.available) return value.session === null;
  const s = value.session;
  if (!object(s) || !keys(s, ["title", "sport", "dateLocal", "timezone", "durationMin", "exactTimeSeconds", "steps"]) ||
    !text(s.title, 1000) || !member(s.sport, sports) ||
    typeof s.dateLocal !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.dateLocal) ||
    !text(s.timezone, 100) || !number(s.durationMin, Number.MIN_VALUE, 1440) ||
    !Array.isArray(s.steps) || !s.steps.length || s.steps.length > 1000 || !s.steps.every(validStep)) return false;
  try {
    if (new Date(`${s.dateLocal}T12:00:00Z`).toISOString().slice(0, 10) !== s.dateLocal) return false;
    new Intl.DateTimeFormat("en", { timeZone: s.timezone as string });
  } catch { return false; }
  const allTimed = s.steps.every(step => step.endpoint.type === "time");
  if (!allTimed) return s.exactTimeSeconds === null;
  const seconds = s.steps.reduce((sum, step) => sum + step.seconds, 0);
  return number(s.exactTimeSeconds, .001, 86400) &&
    Math.abs(s.exactTimeSeconds - seconds) < .001 && Math.abs(s.durationMin * 60 - seconds) < .001;
}
