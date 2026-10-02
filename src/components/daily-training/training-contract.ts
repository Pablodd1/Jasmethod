import type { CanonicalStep } from "@/lib/canonical-session";

export type Endpoint = { type: "time"; seconds: number } | { type: "distance"; meters: number } | { type: "reps"; reps: number } | { type: "lap" };
export type PaceRef = { secondsPerMile: number | null; measuredAt: string | null; status: 'measured' | 'coach_set' | 'missing'; missingReason?: string | null };
export type PaceKey = 'mile' | '5k' | '10k' | 'half' | 'marathon' | 'easy';
export type Target = { label: string; paceLowSecondsPerMile: number | null; paceHighSecondsPerMile: number | null; rpeLow: number | null; rpeHigh: number | null; heartRateBpm: number | null; note?: string; type?: string; low?: number; high?: number; source?: string; stroke?: string };
export type Segment = { id: string; seconds: number | null; endpoint?: Endpoint; estimatedSeconds?: number | null; kind: 'easy' | 'prep' | 'work' | 'recover' | 'cool' | 'other'; title: string; instruction: string; target: Target };
export type Block = { id: string; title: string; repeat: number; segments: Segment[] };
export type Guidance = { title: string; items: string[]; note?: string; sourceIds?: string[] };
export type DailyTraining = {
  schemaVersion: 1 | 2;
  session: { id: string; revision: number; sourceRevision?: string; verdict?: "ready" | "rest" | "blocked"; capability?: { available: boolean; mode: string; reason: string; deviceTested: false }; durationIsEstimate?: boolean; dateLocal: string; timezone: string; sport: string; title: string; subtitle: string; planStatus: 'planned' | 'in_progress' | 'completed'; totalMinutes: number; density: { score: number | null; label: string; method: 'coach_planning'; missingReason?: string }; calories: { kcal: number | null; method: 'wearable' | 'estimate' | 'none'; asOf: string | null; missingReason: string | null } };
  sessions?: { id: string; title: string; sport: string; startTime: string | null }[];
  profile: { paces: Record<PaceKey, PaceRef>; thresholdHeartRate: { bpm: number | null; status: 'measured' | 'coach_set' | 'missing'; measuredAt: string | null }; unitSystem: 'imperial' | 'metric'; updatedAt: string };
  blocks: Block[];
  guidance: { focus: Guidance; preFuel: Guidance; postFuel: Guidance; downshift: Guidance & { timerSeconds: number | null; inhaleSeconds: number | null; exhaleSeconds: number | null }; checkIn: Guidance };
  completion: { focusReady: boolean; submittedAt: string | null; actual: null | { durationMinutes: number | null; actualSport?: string | null; sessionRpe: number | null; comments: string | null } };
  links: { editProfile: string };
};

export function plannedSeconds(blocks: Block[]): number {
  return blocks.reduce((sum, b) => sum + b.repeat * b.segments.reduce((n, s) => n + (s.endpoint ? (s.endpoint.type === "time" ? s.endpoint.seconds : 0) : (s.seconds ?? 0)), 0), 0);
}

// Guard untrusted network responses before showing a prescription. No coercion.
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const optionalNumber = (v: unknown) => v == null || finite(v);
export function isDailyTraining(v: unknown): v is DailyTraining {
  if (!record(v) || ![1, 2].includes(v.schemaVersion)) return false;
  const { session: s, profile: p, guidance: g, completion: c, links: l, blocks } = v;
  if (![s, p, g, c, l].every(record) || !Array.isArray(blocks)) return false;
  if (!["id", "title", "subtitle", "sport", "dateLocal", "timezone"].every(k => typeof s[k] === "string") ||
      !Number.isSafeInteger(s.revision) || s.revision < 1 || !finite(s.totalMinutes) || s.totalMinutes < 0 || s.totalMinutes > 1440) return false;
  if (!["planned", "in_progress", "completed"].includes(s.planStatus) || !record(s.density) || (s.density.score == null ? v.schemaVersion !== 2 || typeof s.density.missingReason !== "string" || !s.density.missingReason : !Number.isInteger(s.density.score) || s.density.score < 1 || s.density.score > 10) || typeof s.density.label !== "string") return false;
  if (!record(s.calories) || !optionalNumber(s.calories.kcal) || !record(p.paces) || !record(p.thresholdHeartRate) || !optionalNumber(p.thresholdHeartRate.bpm)) return false;
  if (!["mile", "5k", "10k", "half", "marathon", "easy"].every(k => record(p.paces[k]) && optionalNumber(p.paces[k].secondsPerMile) && ["measured", "coach_set", "missing"].includes(p.paces[k].status))) return false;
  if (!["imperial", "metric"].includes(p.unitSystem) || typeof p.updatedAt !== "string") return false;
  if (!["focus", "preFuel", "postFuel", "downshift", "checkIn"].every(k => record(g[k]) && typeof g[k].title === "string" && Array.isArray(g[k].items) && g[k].items.every((i: unknown) => typeof i === "string"))) return false;
  if (typeof c.focusReady !== "boolean" || typeof l.editProfile !== "string") return false;
  if (v.schemaVersion === 2) {
    if (typeof s.sourceRevision !== "string" || !/^[a-f0-9]{64}$/.test(s.sourceRevision) || !["ready", "rest", "blocked"].includes(s.verdict)) return false;
    if (!record(s.capability) || typeof s.capability.available !== "boolean" || s.capability.deviceTested !== false || !["native", "generic", "split", "unavailable"].includes(s.capability.mode) || typeof s.capability.reason !== "string") return false;
    if (!Array.isArray(v.sessions) || !v.sessions.every((item: unknown) => record(item) && typeof item.id === "string" && typeof item.title === "string" && typeof item.sport === "string" && (item.startTime === null || typeof item.startTime === "string")) || !v.sessions.some((item: { id: string }) => item.id === s.id)) return false;
    if (s.verdict === "ready" ? !blocks.length : blocks.length > 0 || s.capability.available) return false;
  }
  let count = 0;
  return blocks.every((b: unknown) => {
    if (!record(b) || typeof b.id !== "string" || typeof b.title !== "string" || !Number.isInteger(b.repeat) || b.repeat < 1 || b.repeat > 100 || !Array.isArray(b.segments) || !b.segments.length) return false;
    count += b.repeat * b.segments.length;
    return count <= 1000 && b.segments.every((segment: unknown) => {
      if (!record(segment) || typeof segment.id !== "string" || !["easy", "prep", "work", "recover", "cool", "other"].includes(segment.kind) || typeof segment.title !== "string" || typeof segment.instruction !== "string" || !record(segment.target) || typeof segment.target.label !== "string") return false;
      if (v.schemaVersion === 1) return finite(segment.seconds) && segment.seconds > 0;
      if (!validEndpoint(segment.endpoint) || (segment.endpoint.type === "time" ? segment.seconds !== segment.endpoint.seconds : segment.seconds !== null)) return false;
      if (!optionalNumber(segment.estimatedSeconds) || (segment.estimatedSeconds != null && segment.estimatedSeconds < 0)) return false;
      const t = segment.target;
      if (!["open", "power", "heartRate", "pace", "speed", "swimStroke"].includes(t.type) || !["explicit", "profile_reference", "effort"].includes(t.source)) return false;
      if (t.type === "swimStroke" && !["freestyle", "backstroke", "breaststroke", "butterfly", "drill", "mixed", "im"].includes(t.stroke)) return false;
      return ["open", "swimStroke"].includes(t.type) ? t.low == null && t.high == null : finite(t.low) && finite(t.high) && t.low >= 0 && t.high > 0 && t.low <= t.high;
    });
  });
}


export function validEndpoint(value: unknown): value is Endpoint {
  if (!value || typeof value !== "object") return false;
  const e = value as Record<string, unknown>;
  if (e.type === "lap") return true;
  const n = e.type === "time" ? e.seconds : e.type === "distance" ? e.meters : e.type === "reps" ? e.reps : null;
  return typeof n === "number" && Number.isFinite(n) && n > 0 && (e.type !== "reps" || Number.isInteger(n));
}
export function endpointLabel(endpoint: Endpoint | undefined, metric = true, sport?: string, lang: "en" | "es" = "en"): string {
  const es = lang === "es";
  if (!endpoint) return es ? "Final del paso no disponible" : "Endpoint unavailable";
  if (endpoint.type === "lap") return es ? "Hasta pulsar vuelta / finalizar manualmente" : "Until lap button / manual end";
  if (endpoint.type === "reps") return `${endpoint.reps} reps`;
  if (endpoint.type === "distance") return metric ? `${Number(endpoint.meters.toFixed(2))} m` : sport === "swim" ? `${Number((endpoint.meters / 0.9144).toFixed(2))} yd` : `${Number((endpoint.meters / 1609.344).toFixed(3))} mi`;
  return endpoint.seconds % 60 === 0 ? `${endpoint.seconds / 60} min` : `${endpoint.seconds} s`;
}
export function canonicalBlocks(steps: CanonicalStep[]): Block[] {
  return steps.map((step, i) => ({
    id: `b${i}`, title: step.group || ({warmup: "Warm up", active: "Main set", recovery: "Recovery", cooldown: "Cool down"}[step.phase] || "Training"), repeat: 1,
    segments: [{
      id: `s${i}`, seconds: step.endpoint.type === "time" ? step.endpoint.seconds : null,
      endpoint: step.endpoint, estimatedSeconds: step.endpoint.type === "time" ? null : step.seconds,
      kind: step.phase === "warmup" ? "prep" : step.phase === "cooldown" ? "cool" : step.phase === "recovery" ? "recover" : "work",
      title: step.name, instruction: step.note || "Follow the prescribed endpoint and target. Use controlled technique.",
      target: { ...step.target, paceLowSecondsPerMile: null, paceHighSecondsPerMile: null, rpeLow: null, rpeHigh: null, heartRateBpm: step.target.type === "heartRate" && step.target.low === step.target.high ? step.target.low ?? null : null, note: step.target.missingReason },
    }],
  }));
}

/** A duration-weighted planning reference requires timing for every source step. */
export function planningDensity(steps: Pick<CanonicalStep, "seconds" | "zone" | "endpoint">[]): DailyTraining["session"]["density"] {
  if (!steps.length || steps.some(step => !Number.isFinite(step.seconds) || step.seconds <= 0)) return { score: null, label: "Timing unavailable", method: "coach_planning", missingReason: "A duration-weighted planning score is unavailable because one or more steps have no prescribed or estimated time." };
  const total = steps.reduce((sum, step) => sum + step.seconds, 0);
  const averageZone = steps.reduce((sum, step) => sum + step.seconds * Number(step.zone.slice(1)), 0) / total;
  return { score: Math.max(1, Math.min(10, Math.round(averageZone * 1.4))), label: steps.some(step => step.endpoint.type !== "time") ? "coach planning estimate (estimated step times)" : "coach planning score", method: "coach_planning" };
}
