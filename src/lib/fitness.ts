import { dateKey, addDaysKey, DEFAULT_TIMEZONE } from "./dates";
// JasMiamiMethod — Fitness / Performance engine
// Legacy load and forecasting heuristics, retained for history compatibility.
// Mixed legacy load scales are not interchangeable with JStress.
// Pure functions (no I/O) — unit-testable. Estimates are heuristics, clearly labeled.

import { exponentialMovingAverage } from "./science";
import {
  ALTITUDE_PCT_PER_1000FT,
  ALTITUDE_THRESHOLD_M,
  ALTITUDE_CAP,
  ALTITUDE_PACE_TRANSMISSION,
} from "./forecast-constants";

// ---------- TSS estimation from a completed workout ----------
export interface WorkoutTssInput {
  durationMin: number;
  avgPower?: number | null;
  avgHr?: number | null;
  rpe?: number | null;
  intensity?: string | null;
  tss?: number | null;
  ftp?: number | null;
  lthr?: number | null;
}

export function estimateTss(w: WorkoutTssInput): number {
  if (w.tss != null && w.tss >= 0) return w.tss;
  const sec = w.durationMin * 60;
  if (w.avgPower && w.ftp && w.ftp > 0) {
    // Coggan TSS from normalized power (use avgPower as NP proxy)
    const np = w.avgPower;
    const IF = np / w.ftp;
    return Math.round(((sec * np * IF) / (w.ftp * 3600)) * 100);
  }
  if (w.avgHr && w.lthr && w.lthr > 0) {
    const ratio = w.avgHr / w.lthr;
    // Legacy HR heuristic, not the validated HR-reserve TRIMP method.
    const trimp = (sec / 60) * ratio * 0.64 * Math.exp(0.64 * ratio);
    return Math.round(trimp * 10) / 10;
  }
  // Legacy rescaled effort fallback; may infer effort. Never use as JStress.
  const rpe =
    w.rpe ??
    (w.intensity === "z1" || w.intensity === "z2"
      ? 3
      : w.intensity === "z3"
        ? 5
        : w.intensity === "z4"
          ? 7
          : 8);
  return Math.round((rpe * w.durationMin) / 6);
}

// ---------- PMC: Fitness (CTL), Fatigue (ATL), Form (TSB) ----------
export interface PmcPoint {
  date: string; // YYYY-MM-DD
  tss: number;
  ctl: number;
  atl: number;
  tsb: number;
}

export interface PmcResult {
  series: PmcPoint[];
  current: { ctl: number; atl: number; tsb: number };
  rampRate7d: number; // CTL change over last 7 days (TP "ramp rate")
  rampWarning: string | null;
  formZone: "fresh" | "neutral" | "fatigued" | "risky";
}

function emaSeries(dailyTss: number[], alpha: number): number[] {
  const out: number[] = [];
  let ema = 0;
  for (const t of dailyTss) {
    ema = t * alpha + ema * (1 - alpha);
    out.push(Math.round(ema * 10) / 10);
  }
  return out;
}

export function computePmc(
  workouts: { date: Date; tssInput: WorkoutTssInput }[],
  asOf = new Date(),
  timezone = DEFAULT_TIMEZONE,
): PmcResult | null {
  if (!workouts.length) return null;
  // sum TSS per day
  const byDay = new Map<string, number>();
  for (const w of workouts) {
    if (w.date > asOf) continue;
    const key = dateKey(w.date, timezone);
    byDay.set(key, (byDay.get(key) || 0) + estimateTss(w.tssInput));
  }
  const days = Array.from(byDay.keys()).sort();
  if (!days.length) return null;
  const daily: number[] = [],
    dates: string[] = [];
  const last = dateKey(asOf, timezone);
  for (let key = days[0]; key <= last; key = addDaysKey(key, 1)) {
    dates.push(key);
    daily.push(byDay.get(key) || 0);
  }
  const ctlSeries = emaSeries(daily, 1 - Math.exp(-1 / 42));
  const atlSeries = emaSeries(daily, 1 - Math.exp(-1 / 7));
  const series: PmcPoint[] = dates.map((date, i) => ({
    date,
    tss: daily[i],
    ctl: ctlSeries[i],
    atl: atlSeries[i],
    tsb: Math.round((ctlSeries[i] - atlSeries[i]) * 10) / 10,
  }));
  const cur = series[series.length - 1];
  const rampRate7d =
    series.length > 7
      ? Math.round((cur.ctl - series[series.length - 8].ctl) * 10) / 10
      : 0;
  let rampWarning: string | null = null;
  if (rampRate7d > 8)
    rampWarning = `Legacy long-term load rose ${rampRate7d} units over a week. Review training and data completeness; this is not an injury prediction.`;
  else if (rampRate7d < -8)
    rampWarning = `Legacy long-term load fell ${Math.abs(rampRate7d)} units over a week. Check rest and missing records; this does not establish loss of fitness.`;
  let formZone: PmcResult["formZone"];
  if (cur.tsb >= 10) formZone = "fresh";
  else if (cur.tsb >= -10) formZone = "neutral";
  else if (cur.tsb >= -30) formZone = "fatigued";
  else formZone = "risky";
  return {
    series,
    current: { ctl: cur.ctl, atl: cur.atl, tsb: cur.tsb },
    rampRate7d,
    rampWarning,
    formZone,
  };
}

// ---------- Workout adherence heuristic ----------
export interface ExecutionScore {
  planned: number;
  completed: number;
  matched: number;
  completionPct: number; // 0-100
  durationCompliance: number; // 0-1
  score: number; // 0-100
  label: string;
}

export function executionScore(
  planned: { date: Date; sport: string; durationMin: number }[],
  completed: { date: Date; sport: string; durationMin: number }[],
): ExecutionScore | null {
  if (!planned.length) return null;
  const day = (d: Date) => d.toISOString().slice(0, 10);
  // 1:1 matching: each completed activity is CONSUMED when matched, so one
  // activity can never satisfy several planned workouts (review finding D).
  const remaining = [...completed];
  let matched = 0,
    durSum = 0;
  for (const p of [...planned].sort((a, b) => a.date.getTime() - b.date.getTime())) {
    let bestIdx = -1,
      bestGap = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      if (c.sport !== p.sport) continue;
      const gap =
        Math.abs(
          new Date(day(c.date)).getTime() - new Date(day(p.date)).getTime(),
        ) / 86400000;
      if (gap <= 1 && gap < bestGap) {
        bestGap = gap;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      const hit = remaining.splice(bestIdx, 1)[0];
      matched++;
      durSum += Math.min(1, hit.durationMin / Math.max(1, p.durationMin));
    }
  }
  const completionPct = Math.round((matched / planned.length) * 100);
  const durationCompliance = matched ? durSum / matched : 0;
  const score = Math.round(
    completionPct * 0.7 + durationCompliance * 100 * 0.3,
  );
  const label =
    score >= 85
      ? "Excellent execution"
      : score >= 65
        ? "Good — mostly on plan"
        : score >= 45
          ? "Partial — gaps to close"
          : "Off plan — diagnose the barrier";
  return {
    planned: planned.length,
    completed: completed.length,
    matched,
    completionPct,
    durationCompliance: Math.round(durationCompliance * 100) / 100,
    score,
    label,
  };
}

// ---------- Triathlon race-time heuristic ----------
export interface RacePrediction {
  distance: string;
  swimMin: number;
  bikeMin: number;
  runMin: number;
  transitionsMin: number;
  totalMin: number;
  runPaceSecPerKm: number;
  bikeSpeedKmh: number;
  swimPaceSecPer100m: number;
  note: string;
}

const LEGS: Record<
  string,
  { swimM: number; bikeKm: number; runKm: number; transitionMin: number }
> = {
  sprint: { swimM: 750, bikeKm: 20, runKm: 5, transitionMin: 2 },
  olympic: { swimM: 1500, bikeKm: 40, runKm: 10, transitionMin: 3 },
  half: { swimM: 1900, bikeKm: 90, runKm: 21.1, transitionMin: 4 },
  full: { swimM: 3800, bikeKm: 180, runKm: 42.2, transitionMin: 5 },
};

export function predictRace(
  profile: {
    ftp?: number | null;
    runPaceBase?: number | null;
    swimPaceBase?: number | null;
  },
  distance: string,
): RacePrediction | null {
  const leg = LEGS[distance];
  if (!leg) return null;
  // run: threshold pace → race pace (longer = slower than threshold)
  const runFactor =
    { sprint: 0.97, olympic: 1.0, half: 1.05, full: 1.1 }[distance] ?? 1;
  const runPaceSecPerKm = (profile.runPaceBase ?? 300) * runFactor; // default 5:00/km
  // bike: rough flat-aero speed from FTP
  const ftp = profile.ftp ?? 220;
  const bikeSpeedKmh = Math.round((ftp * 0.05 + 20) * 10) / 10;
  // swim: threshold pace + open-water factor
  const swimPaceSecPer100m = Math.round((profile.swimPaceBase ?? 100) * 1.08);
  const swimMin = ((leg.swimM / 100) * swimPaceSecPer100m) / 60;
  const bikeMin = (leg.bikeKm / bikeSpeedKmh) * 60;
  const runMin = (leg.runKm * runPaceSecPerKm) / 60;
  const totalMin = swimMin + bikeMin + runMin + leg.transitionMin;
  return {
    distance,
    swimMin: Math.round(swimMin),
    bikeMin: Math.round(bikeMin),
    runMin: Math.round(runMin),
    transitionsMin: leg.transitionMin,
    totalMin: Math.round(totalMin),
    runPaceSecPerKm: Math.round(runPaceSecPerKm),
    bikeSpeedKmh,
    swimPaceSecPer100m,
    note: "Heuristic estimate from your FTP/run/swim thresholds — flat-course, no wind/heat. Re-run after each benchmark test to tighten.",
  };
}

// ---------- Environmental context: heat index and altitude ----------
export function heatIndex(tempC: number, humidityPct: number): number {
  // Rothfusz regression (NOAA) — returns feels-like °C
  const t = (tempC * 9) / 5 + 32;
  const rh = humidityPct;
  if (t < 80) return tempC;
  const hiF =
    -42.379 +
    2.04901523 * t +
    10.14333127 * rh -
    0.22475541 * t * rh -
    0.00683783 * t * t -
    0.05481717 * rh * rh +
    0.00122874 * t * t * rh +
    0.00085282 * t * rh * rh -
    0.00000199 * t * t * rh * rh;
  return Math.round((((hiF - 32) * 5) / 9) * 10) / 10;
}

export function altitudeFactor(elevM: number): {
  vo2factor: number;
  paceFactor: number;
  advice: string;
} {
  // Wehrlin-linear model per the 2026-09-08 adjudication (Conflict 1):
  // VO2max/aerobic power falls linearly with altitude — ~4.4% per 1,000 ft —
  // from low altitude. The previous "~1% per 100m above 1500m" rule and the
  // industry "1% per 1,000 ft" rule of thumb were REJECTED as ~4x
  // underestimates. Constants are tunable defaults in forecast-constants.ts.
  if (elevM <= ALTITUDE_THRESHOLD_M.value)
    return {
      vo2factor: 1,
      paceFactor: 1,
      advice: "Low elevation — no meaningful altitude effect.",
    };
  const metersPer1000ft = 304.8;
  const drop = Math.min(
    ALTITUDE_CAP.value,
    ((ALTITUDE_PCT_PER_1000FT.value / 100) * (elevM - ALTITUDE_THRESHOLD_M.value)) /
      metersPer1000ft,
  );
  const vo2factor = Math.round((1 - drop) * 1000) / 1000;
  // Pace degrades less than VO2max falls at sub-threshold speeds (slower
  // speed = lower absolute O2 cost) — transmission factor is a tunable default.
  const paceFactor = Math.round((1 / (1 - drop * ALTITUDE_PACE_TRANSMISSION.value)) * 1000) / 1000;
  return {
    vo2factor,
    paceFactor,
    advice: `Race at ${elevM}m (~${Math.round(elevM * 3.28084)} ft) — aerobic power ~${Math.round(drop * 100)}% lower (Wehrlin-linear model, tunable default). Arrive 7-14+ days early, or plan power/pace off these derated numbers, not off sea-level thresholds.`,
  };
}
