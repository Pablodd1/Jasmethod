import { normalizeSportStructure, type SportStructure } from "./sport-structure";

export type FriendlyStepKind = "lengths" | "rest" | "run" | "station" | "set" | "warmup" | "cooldown";
export type FriendlyStep = {
  kind: FriendlyStepKind; name: string; zone: string; amount: string; endpoint: string;
  estimate: string; load: string; loadUnit: "kg" | "lb"; stroke: string; phase: string; note: string;
  stationId?: string; exerciseId?: string;
};
export type FriendlyStructure = { kind: "pool" | "hyrox" | "strength"; poolLength: string; poolUnit: "m" | "yd"; steps: FriendlyStep[] };
export function emptyFriendlyStructure(sport: string): FriendlyStructure | null {
  const kind = sport === "swim" ? "pool" : sport === "hyrox" ? "hyrox" : sport === "strength" ? "strength" : null;
  return kind ? { kind, poolLength: "", poolUnit: "m", steps: [] } : null;
}
export function emptyFriendlyStep(kind: FriendlyStepKind): FriendlyStep {
  return { kind, name: "", zone: "", amount: "", endpoint: "", estimate: "", load: "", loadUnit: "kg", stroke: "", phase: "", note: "" };
}
const numeric = (text: string, label: string, allowZero = false): number => {
  if (!text.trim() || !Number.isFinite(Number(text)) || Number(text) < (allowZero ? 0 : Number.MIN_VALUE)) throw new Error(`${label}: enter ${allowZero ? "zero or a positive" : "a positive"} number.`);
  return Number(text);
};
/** Only entered dose fields become canonical data. The server remains the admission authority. */
export function friendlyStructureValue(form: FriendlyStructure, sport: string): SportStructure {
  const setCounts = new Map<string, number>();
  const steps = form.steps.map((row, index) => {
    const label = `Step ${index + 1}`;
    const note = row.note.trim() ? { note: row.note.trim() } : {};
    if (row.kind === "rest") return { kind: "rest", seconds: numeric(row.amount, `${label} rest seconds`), ...note };
    if (row.kind === "lengths") return { kind: "lengths", name: row.name, phase: row.phase, zone: row.zone,
      lengths: numeric(row.amount, `${label} lengths`), stroke: row.stroke,
      estimatedSeconds: numeric(row.estimate, `${label} estimated total seconds`), ...note };
    const endpoint = row.endpoint === "time" ? { type: "time", seconds: numeric(row.amount, `${label} seconds`) }
      : row.endpoint === "distance" ? { type: "distance", meters: numeric(row.amount, `${label} metres`) }
      : row.endpoint === "reps" ? { type: "reps", reps: numeric(row.amount, `${label} repetitions`) }
      : row.endpoint === "lap" ? { type: "lap" } : (() => { throw new Error(`${label}: choose seconds, metres, repetitions or manual finish.`); })();
    if (row.kind === "warmup" || row.kind === "cooldown") return { kind: "step", name: row.name, phase: row.kind, zone: row.zone, endpoint, ...note };
    const load = row.load.trim() ? { load: { value: numeric(row.load, `${label} practiced load`, true), unit: row.loadUnit } } : {};
    const estimatedSeconds = row.endpoint === "time" ? {} : { estimatedSeconds: numeric(row.estimate, `${label} estimated total seconds`) };
    if (row.kind === "set") {
      const exerciseId = row.exerciseId || row.name.trim();
      const setNumber = (setCounts.get(exerciseId) || 0) + 1; setCounts.set(exerciseId, setNumber);
      return { kind: "set", exerciseId, exerciseName: row.name, setNumber, zone: row.zone, endpoint, ...load, ...estimatedSeconds, ...note };
    }
    return { kind: row.kind, name: row.name, ...(row.kind === "station" ? { stationId: row.stationId || row.name.trim() } : {}),
      zone: row.zone, endpoint, ...load, ...estimatedSeconds, ...note };
  });
  return normalizeSportStructure({ schemaVersion: 1, kind: form.kind, ...(form.kind === "pool" ? {
    poolLength: { value: numeric(form.poolLength, "Pool length"), unit: form.poolUnit },
  } : {}), steps }, sport);
}
/** Unrepresentable metadata stays in advanced JSON rather than being silently discarded. */
export function friendlyStructureFrom(value: unknown, sport: string): FriendlyStructure | null {
  if (value == null) return emptyFriendlyStructure(sport);
  let structure: SportStructure;
  try { structure = normalizeSportStructure(value, sport); } catch { return null; }
  if (!["pool", "hyrox", "strength"].includes(structure.kind)) return null;
  const s = structure as Extract<SportStructure, { kind: "pool" | "hyrox" | "strength" }>;
  const form: FriendlyStructure = { kind: s.kind, poolLength: s.kind === "pool" ? String(s.poolLength.value) : "", poolUnit: s.kind === "pool" ? s.poolLength.unit : "m", steps: [] };
  for (const row of s.steps) {
    if (row.kind === "lengths" && row.sendOffSeconds !== undefined) return null;
    if (row.kind === "step" && row.endpoint.type !== "time") return null;
    const kind = row.kind === "step" ? row.phase : row.kind;
    const draft = emptyFriendlyStep(kind);
    draft.note = row.note || "";
    if (row.kind === "rest") draft.amount = String(row.seconds);
    else {
      draft.zone = row.zone;
      draft.name = row.kind === "set" ? row.exerciseName : row.name;
      if (row.kind === "lengths") {
        draft.amount = String(row.lengths); draft.stroke = row.stroke; draft.phase = row.phase;
        draft.estimate = row.estimatedSeconds === undefined ? "" : String(row.estimatedSeconds);
      } else {
        draft.endpoint = row.endpoint.type;
        draft.amount = row.endpoint.type === "time" ? String(row.endpoint.seconds) : row.endpoint.type === "distance" ? String(row.endpoint.meters) : row.endpoint.type === "reps" ? String(row.endpoint.reps) : "";
        if (row.kind !== "step") {
          draft.estimate = row.estimatedSeconds === undefined ? "" : String(row.estimatedSeconds);
          if (row.load) { draft.load = String(row.load.value); draft.loadUnit = row.load.unit; }
          if (row.kind === "set") draft.exerciseId = row.exerciseId;
          if (row.kind === "station") draft.stationId = row.stationId;
          // Time endpoints with extra estimates need JSON to preserve that metadata.
          if (row.endpoint.type === "time" && row.estimatedSeconds !== undefined) return null;
        }
      }
    }
    form.steps.push(draft);
  }
  return form;
}
