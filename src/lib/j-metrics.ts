import { addDaysKey, dateKey, DEFAULT_TIMEZONE } from "./dates";

// JMM naming, published session-RPE method (Foster et al. 2001, PMID 11708692).
// This scale never consumes legacy tss/np/if fields or estimates missing effort.
export interface JStressWorkout {
  id?: string; date: Date; completed: boolean; planned: boolean;
  durationMin: number; actualDurationMin?: number | null; rpe?: number | null;
  matchedPlanId?: string | null; feedbackStatus?: string | null;
}
export interface JStressValue {
  value: number | null; unit: "AU"; method: "session-rpe-v1";
  source: "athlete-reported" | "unavailable"; reason: string | null;
}
export function hasPerformedTraining(w: Pick<JStressWorkout, "completed" | "feedbackStatus">): boolean {
  return w.completed || ["completed", "partial", "substituted"].includes(w.feedbackStatus ?? "");
}
export function workoutJStress(w: Omit<JStressWorkout, "date">): JStressValue {
  const missing = (reason: string): JStressValue => ({ value: null, unit: "AU", method: "session-rpe-v1", source: "unavailable", reason });
  if (!hasPerformedTraining(w)) return missing("Complete the session and report its actual duration and overall effort first.");
  if (w.matchedPlanId) return missing("Use the matched completed activity; do not count its plan twice.");
  const minutes = w.actualDurationMin ?? (w.planned ? null : w.durationMin);
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes <= 0 || minutes > 1440)
    return missing("Actual duration is missing or invalid; planned minutes are not actual minutes.");
  if (typeof w.rpe !== "number" || !Number.isFinite(w.rpe) || w.rpe < 0 || w.rpe > 10)
    return missing("Report overall session effort from 0 to 10; intensity zones are not a substitute.");
  return { value: Math.round(minutes * w.rpe * 10) / 10, unit: "AU", method: "session-rpe-v1", source: "athlete-reported", reason: null };
}
export interface JMetricPoint { date: string; jStress: number | null; jBase: number | null; jRecent: number | null; jBalance: number | null }
export interface JMetrics {
  version: "jstress-srpe-v1"; unit: "AU"; totalJStress: number | null;
  eligibleSessions: number; totalSessions: number; coveragePct: number | null;
  series: JMetricPoint[]; current: Pick<JMetricPoint, "jBase" | "jRecent" | "jBalance">;
  missingDays: number; windowDays: number; note: string;
  confirmedRestDays: string[]; timezone: string; today: string;
}
export function computeJMetrics(workouts: JStressWorkout[], asOf = new Date(), timezone = DEFAULT_TIMEZONE, restDays: string[] = [], windowDays = 90): JMetrics {
  const days = Number.isFinite(windowDays) ? Math.max(1, Math.min(90, Math.floor(windowDays))) : 90;
  const today = dateKey(asOf, timezone), first = addDaysKey(today, 1 - days);
  const eligible = workouts.filter(w => hasPerformedTraining(w) && !w.matchedPlanId && Number.isFinite(w.date.getTime()) && w.date <= asOf && dateKey(w.date, timezone) >= first);
  const grouped = new Map<string, JStressValue[]>();
  for (const w of eligible) { const key = dateKey(w.date, timezone); grouped.set(key, [...(grouped.get(key) || []), workoutJStress(w)]); }
  const confirmed = new Set(restDays.filter(d => d >= first && d <= today && /^\d{4}-\d{2}-\d{2}$/.test(d)));
  const series: JMetricPoint[] = [];
  let base = 0, recent = 0, consecutive = 0;
  const round = (n: number) => Math.round(n * 10) / 10;
  for (let day = first; day <= today; day = addDaysKey(day, 1)) {
    const sessions = grouped.get(day);
    // A training record always overrides a rest assertion, even if its RPE is missing.
    const load = sessions?.length ? sessions.every(s => s.value !== null) ? round(sessions.reduce((sum, s) => sum + s.value!, 0)) : null : confirmed.has(day) ? 0 : null;
    if (load === null) { consecutive = 0; series.push({ date: day, jStress: null, jBase: null, jRecent: null, jBalance: null }); continue; }
    if (consecutive === 0) { base = load; recent = load; }
    else { base += (load - base) * (1 - Math.exp(-1 / 42)); recent += (load - recent) * (1 - Math.exp(-1 / 7)); }
    consecutive++;
    series.push({ date: day, jStress: load, jBase: consecutive >= 42 ? round(base) : null, jRecent: consecutive >= 7 ? round(recent) : null, jBalance: consecutive >= 42 ? round(base - recent) : null });
  }
  const scores = eligible.map(workoutJStress).filter(s => s.value !== null);
  const last = series.at(-1)!;
  return { version: "jstress-srpe-v1", unit: "AU", totalJStress: scores.length ? round(scores.reduce((sum, s) => sum + s.value!, 0)) : null,
    eligibleSessions: scores.length, totalSessions: eligible.length, coveragePct: eligible.length ? round(scores.length / eligible.length * 100) : null,
    series, current: { jBase: last.jBase, jRecent: last.jRecent, jBalance: last.jBalance }, missingDays: series.filter(p => p.jStress === null).length, windowDays: days,
    confirmedRestDays: [...confirmed].filter(d => !grouped.has(d)).sort(), timezone, today,
    note: "JStress is actual minutes × reported session effort (0–10), in arbitrary units. Totals include only scored sessions. Unrecorded days are unknown, not rest. Gaps restart the model; J Recent needs 7 consecutive known days and J Base/J Balance need 42. These are display rules, not validated injury or readiness thresholds. Legacy/provider scores are excluded." };
}
