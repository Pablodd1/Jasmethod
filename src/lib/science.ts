import { buildSprintSession } from "./sprint-protocols";
// JasMiamiMethod — Sports Science Engine
// Evidence-based training physiology per post-2000 research literature.
//
// Key references baked into the model:
// - Seiler & Tønnessen 2009: endurance intensity-distribution synthesis
//   (Sportscience 13:32–53), not a universal split or validation of JMM dosing.
// - Billat et al. 1999/2001: vVO2max and time-to-exhaustion at vVO2max
//   (Med Sci Sports Exerc 31:1206-1211; Eur J Appl Physiol 85:299-305).
// - Allen & Coggan (Training and Racing with a Power Meter): TSS, FTP, NP.
// - Joe Friel (Triathlete's Training Bible): 7-zone HR model anchored on LTHR.
// - Buchheit 2014: HRV-guided training (Front Physiol 5:73).
// - Foster 1998: session RPE (TRIMP alternative), J Strength Cond Res 12:109-115.
// - Skiba & Fukuda: W' balance, critical power modeling.
// - Tanaka, Monahan & Seals 2001: age-predicted HRmax accuracy.
// - Bouchard et al. 2011: HERITAGE — VO2max trainability, genomic predictors.

export type Sport = "swim" | "bike" | "run" | "strength" | "mobility" | "recovery" | "brick" | "hyrox" | "boxing";
export type ZoneKey = "z1" | "z2" | "z3" | "z4" | "z5" | "z6" | "z7";

export interface Zone {
  key: ZoneKey;
  name: string;
  pctLow: number; // % of anchor
  pctHigh: number;
  description: string;
  rpe?: string; // RPE equivalent (1-10) — the gym/boxing/hyrox anchor
}

// ---- MyProCoach 5-zone HR model (anchored on MAX HEART RATE) ----
// Verified against MyProCoach calculator (myprocoach.net/calculators/hr-zones, 2026):
// Z1 Easy 68-73%, Z2 Steady 73-80%, Z3 Moderately Hard 80-87%, Z4 Hard 87-93%,
// Z5 Very Hard 93-100% of MAX HR. Bike zones run 5-8 bpm lower (we use 6).
// Gym/boxing/hyrox use the SAME max-HR zones but are RPE-guided (HR lags
// intermittent high-force work), so each zone carries its RPE equivalent.
export const HR_ZONES: Zone[] = [
  { key: "z1", name: "Easy", pctLow: 0.68, pctHigh: 0.73, rpe: "1-2 /10", description: "Recovery / easy — blood flow, active recovery." },
  { key: "z2", name: "Steady", pctLow: 0.73, pctHigh: 0.80, rpe: "3-4 /10", description: "Endurance — fat & carb efficiency. Conversational." },
  { key: "z3", name: "Moderately Hard", pctLow: 0.80, pctHigh: 0.87, rpe: "5-6 /10", description: "Tempo — delays lactate fatigue. 10-20 min reps." },
  { key: "z4", name: "Hard", pctLow: 0.87, pctHigh: 0.93, rpe: "7-8 /10", description: "Threshold — raises lactate threshold. 3-10 min reps." },
  { key: "z5", name: "Very Hard", pctLow: 0.93, pctHigh: 1.00, rpe: "9-10 /10", description: "VO2max / top-end speed. 1-3 min reps." },
];

// Bike HR zones sit 5-8 bpm below run (MyProCoach); 6 is the midpoint.
export const BIKE_HR_OFFSET_BPM = 6;

// ---- Power zones anchored on FTP (Coggan) ----
export const POWER_ZONES: Zone[] = [
  { key: "z1", name: "Active Recovery", pctLow: 0, pctHigh: 0.55, description: "<55% FTP" },
  { key: "z2", name: "Endurance", pctLow: 0.56, pctHigh: 0.75, description: "56-75% FTP" },
  { key: "z3", name: "Tempo", pctLow: 0.76, pctHigh: 0.9, description: "76-90% FTP" },
  { key: "z4", name: "Threshold", pctLow: 0.91, pctHigh: 1.05, description: "91-105% FTP" },
  { key: "z5", name: "VO2max", pctLow: 1.06, pctHigh: 1.2, description: "106-120% FTP" },
  { key: "z6", name: "Anaerobic", pctLow: 1.21, pctHigh: 1.5, description: ">121% FTP" },
  { key: "z7", name: "Neuromuscular", pctLow: 1.51, pctHigh: 2.0, description: "Max sprints" },
];

// ---- Pace zones anchored on threshold pace (sec/km or sec/100m) ----
export const PACE_ZONES: Zone[] = [
  { key: "z1", name: "Recovery", pctLow: 1.25, pctHigh: 1.6, description: "Much slower than T-pace" },
  { key: "z2", name: "Endurance", pctLow: 1.1, pctHigh: 1.25, description: "Aerobic base" },
  { key: "z3", name: "Tempo", pctLow: 1.04, pctHigh: 1.1, description: "Marathon-ish effort" },
  { key: "z4", name: "Threshold", pctLow: 1.0, pctHigh: 1.04, description: "T-pace: LT work" },
  { key: "z5", name: "VO2max", pctLow: 0.92, pctHigh: 1.0, description: "3-8 min reps" },
  { key: "z6", name: "Anaerobic", pctLow: 0.85, pctHigh: 0.92, description: "400-800m reps" },
  { key: "z7", name: "Sprint", pctLow: 0.75, pctHigh: 0.85, description: "Max speed" },
];

// ---- VO2max estimation (non-exercise, post-2000 literature) ----
// Jackson et al. 1990 (ACSM regression) updated by Jurca et al. 2005 for
// non-exercise estimation: VO2max ≈ 43.5 + 8.5*walkModality - 0.3*BMI... simplified
// here to a practical model used widely in wearables research.
export function estimateVo2max(opts: {
  sex: "male" | "female";
  age: number;
  bmi: number;
  activityLevel: 1 | 2 | 3 | 4 | 5; // sedentary..highly active
}): { vo2max: number; pctile: number; label: string } {
  const { sex, age, bmi, activityLevel } = opts;
  // Jurca et al. 2005 regression (Medicine & Science in Sports & Exercise 37(6):984-992)
  // VO2max = 3.28 + 8.5*AL - 0.39*age + 0.73*sex(1=M) - 0.15*BMI
  const sexFactor = sex === "male" ? 1 : 0;
  const vo2max = 3.28 + 8.5 * activityLevel - 0.39 * age + 0.73 * sexFactor - 0.15 * bmi;
  const clamped = Math.max(20, Math.min(70, Math.round(vo2max)));
  // Age/sex percentile tables (ACSM 2021, Health-Related Physical Fitness)
  let pctile: number;
  if (sex === "male") {
    if (clamped >= 54) pctile = 95; else if (clamped >= 48) pctile = 80;
    else if (clamped >= 42) pctile = 50; else if (clamped >= 36) pctile = 20;
    else pctile = 5;
  } else {
    if (clamped >= 46) pctile = 95; else if (clamped >= 41) pctile = 80;
    else if (clamped >= 35) pctile = 50; else if (clamped >= 30) pctile = 20;
    else pctile = 5;
  }
  const label = pctile >= 90 ? "Superior" : pctile >= 70 ? "Excellent" : pctile >= 50 ? "Good" : pctile >= 25 ? "Fair" : "Poor";
  return { vo2max: clamped, pctile, label };
}

// ---- Tanaka 2001: HRmax = 208 − 0.7 × age (more accurate than 220-age) ----
export function maxHrFromAge(age: number): number {
  return Math.round(208 - 0.7 * age);
}

// ---- LTHR estimation when not measured ----
// If VO2max known: LTHR ≈ 0.85-0.9 × HRmax depending on training status.
export function estimateLthr(hrMax: number, experience: string): number {
  const factor = experience === "pro" ? 0.92 : experience === "advanced" ? 0.9 : experience === "amateur" ? 0.88 : 0.85;
  return Math.round(hrMax * factor);
}

// ---- LTHR test protocol (30-minute time trial — Joe Friel's standard) ----
// 30' all-out TT; average HR of last 20 minutes = LTHR. Post-2000 validation:
// this protocol correlates strongly with measured LT (Friel; also Lamberts 2009).
export function lthrFrom30MinTT(last20AvgHr: number): number {
  return Math.round(last20AvgHr);
}

// ---- VO2max from heart-rate ratio (Uth–Sørensen–Overgaard–Pedersen 2004) ----
// Most recent simple field-test estimate: VO2max = 15.3 × (HRmax / HRrest).
// ~0.8 ml/kg/min accuracy vs direct measurement (Eur J Appl Physiol 91:111-115).
export function estimateVo2maxFromHr(maxHr: number, restingHr: number): number {
  if (!maxHr || !restingHr || restingHr <= 0) return 0;
  return Math.round((15.3 * maxHr) / restingHr * 10) / 10;
}

// ---- Critical Swim Speed (CSS) — MyProCoach 400m + 200m test ----
// CSS = (D400 - D200) / (T400 - T200) in m/s; ≈ pace for a maximal 1500m TT.
export function cssFromTestTimes(t400sec: number, t200sec: number): number {
  if (t400sec <= t200sec) return 0;
  const speedMs = 200 / (t400sec - t200sec);
  return Math.round((100 / speedMs) * 10) / 10; // sec/100m
}

export interface ZoneTable {
  anchorHr?: number;  // MAX heart rate (HR zone anchor)
  anchorLthr?: number; // threshold HR (cross-reference only)
  hr?: Record<string, { low: number; high: number }>;        // RUN HR (MyProCoach 5-zone, % max HR)
  bikeHr?: Record<string, { low: number; high: number }>;    // BIKE HR (run zones − 6 bpm)
  power?: Record<ZoneKey, { low: number; high: number }>;    // FTP power (Coggan 7-zone)
  pace?: Record<ZoneKey, { low: number; high: number }>;     // RUN threshold pace (7-zone, sec/km)
  swim?: Record<string, { low: number; high: number }>;      // SWIM pace (5-zone, sec/100m)
  anchorPower?: number;
  anchorPace?: number; // run threshold sec/km
  anchorSwim?: number; // swim threshold sec/100m
  vo2maxHr?: number;   // Uth 2004 estimate (needs restingHr)
}

// Swim pace zones around threshold (CSS) pace — sec/100m. Slower = larger seconds.
const SWIM_ZONE_MULT: Record<string, { slow: number; fast: number }> = {
  z1: { slow: 1.25, fast: 1.15 },
  z2: { slow: 1.15, fast: 1.06 },
  z3: { slow: 1.06, fast: 1.02 },
  z4: { slow: 1.02, fast: 0.98 },
  z5: { slow: 0.98, fast: 0.92 },
};

export function buildZoneTable(opts: {
  maxHr?: number;
  lthr?: number;
  ftp?: number;
  thresholdPaceSecPerKm?: number; // run
  thresholdPaceSecPer100m?: number; // swim
  restingHr?: number;
}): ZoneTable {
  const { maxHr, lthr, ftp, thresholdPaceSecPerKm, thresholdPaceSecPer100m, restingHr } = opts;

  let hr: Record<string, { low: number; high: number }> | undefined;
  let bikeHr: Record<string, { low: number; high: number }> | undefined;
  if (maxHr) {
    hr = {}; bikeHr = {};
    for (const z of HR_ZONES) {
      hr[z.key] = { low: Math.round(maxHr * z.pctLow), high: Math.round(maxHr * z.pctHigh) };
      bikeHr[z.key] = {
        low: Math.round(maxHr * z.pctLow) - BIKE_HR_OFFSET_BPM,
        high: Math.round(maxHr * z.pctHigh) - BIKE_HR_OFFSET_BPM,
      };
    }
  }

  let power: Record<ZoneKey, { low: number; high: number }> | undefined;
  if (ftp) {
    power = {} as Record<ZoneKey, { low: number; high: number }>;
    for (const z of POWER_ZONES) {
      power[z.key] = { low: Math.round(ftp * z.pctLow), high: Math.round(ftp * z.pctHigh) };
    }
  }

  let pace: Record<ZoneKey, { low: number; high: number }> | undefined;
  if (thresholdPaceSecPerKm) {
    pace = {} as Record<ZoneKey, { low: number; high: number }>;
    for (const z of PACE_ZONES) {
      pace[z.key] = { high: Math.round(thresholdPaceSecPerKm / z.pctLow), low: Math.round(thresholdPaceSecPerKm / z.pctHigh) };
    }
  }

  let swim: Record<string, { low: number; high: number }> | undefined;
  if (thresholdPaceSecPer100m) {
    swim = {};
    for (const z of HR_ZONES) {
      const m = SWIM_ZONE_MULT[z.key];
      swim[z.key] = { low: Math.round(thresholdPaceSecPer100m * m.fast), high: Math.round(thresholdPaceSecPer100m * m.slow) };
    }
  }

  const vo2maxHr = maxHr && restingHr ? estimateVo2maxFromHr(maxHr, restingHr) : undefined;

  return {
    anchorHr: maxHr,
    anchorLthr: lthr,
    hr,
    bikeHr,
    power,
    pace,
    swim,
    anchorPower: ftp,
    anchorPace: thresholdPaceSecPerKm,
    anchorSwim: thresholdPaceSecPer100m,
    vo2maxHr,
  };
}

// ---- Session RPE load (Foster 1998) ----
export function sRPE(rpe: number, minutes: number): number {
  return rpe * minutes;
}

// ---- TSS (Coggan) ----
// NOTE: the HR-based TSS variant that lived here (tssFromHr) was removed — it
// was dead code with mis-applied Banister TRIMP constants (sex-specific pairs
// L=0.64/0.86, a=1.92/1.67 were collapsed into a single exponent). The real
// HR-based load path is estimateTss() in lib/fitness.ts, which is tested.
export function tssFromPower(normalizedPower: number, ftp: number, durationSec: number): number {
  if (!ftp || ftp <= 0) return 0;
  const IF = normalizedPower / ftp;
  const hours = durationSec / 3600;
  return Math.round((durationSec * normalizedPower * IF) / (ftp * 3600) * 100 * 100) / 100;
}

// ---- Chronic vs Acute load (CTL/ATL) & Training Stress Balance ----
// CTL = 42-day exponentially weighted average; ATL = 7-day.
export function exponentialMovingAverage(loads: number[], alpha: number): number {
  let ema = 0;
  for (const l of loads) {
    ema = ema === 0 ? l : l * alpha + ema * (1 - alpha);
  }
  return ema;
}

export function ctl(loads: number[]): number {
  return exponentialMovingAverage(loads, 1 - Math.exp(-1 / 42));
}
export function atl(loads: number[]): number {
  return exponentialMovingAverage(loads, 1 - Math.exp(-1 / 7));
}
export function tsb(ctl: number, atl: number): number {
  return Math.round((ctl - atl) * 10) / 10;
}

// ---- HRV readiness (Buchheit 2014; Plews et al. 2013) ----
// Compare morning RMSSD to rolling 7-day baseline; deviation >±1 SD = adjust.
export function hrvReadiness(hrvToday: number, baseline7d: number[], sd: number): {
  score: number; // 0-100 — display only, never drives the day-type alone
  hrvStatus: "high" | "normal" | "low" | "insufficient";
  advice: string;
  deltaPct: number;
} {
  if (baseline7d.length < 3 || sd <= 0) {
    return { score: 50, hrvStatus: "insufficient" as const, advice: "Insufficient HRV data — at least 3 days needed for a reliable reading.", deltaPct: 0 };
  }
  const avg = baseline7d.reduce((a: number, b: number) => a + b, 0) / baseline7d.length;
  const deltaPct = ((hrvToday - avg) / avg) * 100;
  const z = sd > 0 ? (hrvToday - avg) / sd : 0;
  let score = 50;
  let hrvStatus: "high" | "normal" | "low" = "normal";
  let advice = "HRV within normal range — proceed with planned session.";
  if (z >= 1) {
    score = 85;
    hrvStatus = "high";
    advice = "HRV elevated vs baseline — recovery is ahead of schedule.";
  } else if (z >= 0.5) {
    score = 70;
    hrvStatus = "high";
    advice = "HRV slightly elevated — good day to train. Push the key session.";
  } else if (z <= -1) {
    score = 25;
    hrvStatus = "low";
    advice = "HRV suppressed beyond 1 SD — body is not recovered. Swap the key session for Z1/Z2 or rest. High risk of overreaching (Plews 2013).";
  } else if (z <= -0.5) {
    score = 40;
    hrvStatus = "low";
    advice = "HRV trending down — keep the session easy and prioritize sleep tonight.";
  }
  return { score, hrvStatus, advice, deltaPct: Math.round(deltaPct * 10) / 10 };
}

export function intensityDistribution(level: string): { zone1: number; zone2: number; zone3: number } {
  // zone1 = Z1-Z2 (easy), zone2 = Z3 (threshold-ish), zone3 = Z4+ (hard)
  if (level === "pro") return { zone1: 80, zone2: 5, zone3: 15 };
  if (level === "advanced") return { zone1: 80, zone2: 10, zone3: 10 };
  if (level === "amateur") return { zone1: 75, zone2: 15, zone3: 10 };
  return { zone1: 70, zone2: 20, zone3: 10 };
}

// ---- Standard work-to-rest ratios for interval work (post-2000) ----
export const INTERVAL_PRESCRIPTIONS: Record<string, { reps: number; work: number; rest: number; zone: ZoneKey; note: string }[]> = {
  vo2max: [
    { reps: 6, work: 3, rest: 3, zone: "z6", note: "3:3 min at vVO2max — Billat 2001 (time-to-exhaustion model)" },
    { reps: 8, work: 2, rest: 2, zone: "z6", note: "2:2 min at 105-110% vVO2max" },
  ],
  threshold: [
    { reps: 3, work: 10, rest: 5, zone: "z4", note: "3×10 min at 94-99% LTHR (Friel)" },
    { reps: 4, work: 8, rest: 4, zone: "z4", note: "4×8 min cruise intervals" },
    { reps: 2, work: 20, rest: 10, zone: "z4", note: "2×20 min at T-pace — classic LT builder" },
  ],
  anaerobic: [
    { reps: 8, work: 1, rest: 3, zone: "z7", note: "8×60s max with 3:00 easy — anaerobic capacity" },
    { reps: 12, work: 0.5, rest: 1, zone: "z7", note: "12×30s flying sprints" },
  ],
  tempo: [
    { reps: 2, work: 20, rest: 8, zone: "z3", note: "2×20 min tempo at 90-93% LTHR" },
    { reps: 3, work: 15, rest: 6, zone: "z3", note: "3×15 min sweet spot" },
  ],
  endurance: [
    { reps: 1, work: 90, rest: 0, zone: "z2", note: "90 min Z2 — aerobic base" },
    { reps: 1, work: 120, rest: 0, zone: "z2", note: "2 h Z2 long ride/run" },
  ],
  brick: [
    { reps: 1, work: 90, rest: 0, zone: "z3", note: "90 min ride + 30 min run off the bike (transition practice)" },
  ],
};

export interface PlanSession {
  sport: Sport;
  title: string;
  minutes: number;
  zone: ZoneKey;
  description: string;
  type: string;
}

export interface GeneratedWeek {
  week: number;
  theme: string;
  sessions: PlanSession[];
  totalMinutes: number;
  tss?: number;
}

// ---- Periodized plan generator ----
// Structure: Base (50%) → Build (30%) → Peak (15%) → Taper (5%) for a full race block.
// Progressive overload: +5-10% volume/week in base, intensity rises in build,
// volume drops in peak with quality preserved, taper = -40% volume wk-1.
// ---- 6-week mesocycle engine (user product rule) ----
// Everything cycles in 6-week blocks: 5 build weeks stepping up + week 6 = taper
// + baseline test. Each block is 5-10% higher than the last, scaled by level.
// After a race: volume dips (race = block end), next block rebuilds from lower.
export function mesoBlock(level: string): number {
  // per-block volume increase: fitter athletes progress slower (less headroom)
  return level === "beginner" ? 1.10 : level === "amateur" ? 1.07 : level === "advanced" ? 1.06 : 1.05;
}

// Race input for planning: A races get the full taper; B races are trained
// through with light sharpening; C races are ignored by volume math.
export interface PlanRace {
  date: Date;
  priority?: number | null; // 1 = A, 2 = B, 3 = C
}

export function mesoVolume(
  weekIndex: number,
  level: string,
  raceDates: Date[] = [],
  startDate: Date = new Date(0),
): { vol: number; phase: "build" | "taper"; block: number } {
  return mesoVolumeRaces(weekIndex, level, raceDates, startDate);
}

// Race-aware volume: A-race taper anchors to the RACE DATE (final 2 weeks
// −41%→−60%, meta-analytic), B-race weeks get −20% sharpening (train
// through), post-race regeneration dips for A (−40%) and B (−15%).
export function mesoVolumeRaces(
  weekIndex: number,
  level: string,
  raceDates: (Date | PlanRace)[],
  startDate: Date = new Date(0),
): { vol: number; phase: "build" | "taper"; block: number } {
  // weekIndex 0-based
  const block = Math.floor(weekIndex / 6);
  const inBlock = weekIndex % 6;
  // within-block wave: 0.85 → 1.0 across 5 build weeks
  const within = 0.85 + (inBlock / 4) * 0.15;
  // block-to-block: each cycle 5-10% higher
  const step = Math.pow(mesoBlock(level), block);
  const wkStart = startDate.getTime() + weekIndex * 7 * 86400000;
  const wkEnd = wkStart + 7 * 86400000;
  const prevWeekStart = wkStart - 7 * 86400000;

  const norm = (r: Date | PlanRace): { t: number; pr: number } => ({
    t: new Date("date" in r && r.date instanceof Date ? r.date : (r as Date)).getTime(),
    pr: "priority" in r && typeof r.priority === "number" ? r.priority : 1,
  });
  const races = raceDates.map(norm).filter((r) => Number.isFinite(r.t));

  // Post-race regeneration: A −40%, B −15% (train-through recovers fast).
  for (const r of races) {
    if (r.t >= prevWeekStart && r.t < wkStart) {
      const dip = r.pr === 1 ? 0.6 : r.pr === 2 ? 0.85 : 1;
      if (dip < 1) return { vol: dip * step, phase: "build", block };
    }
  }

  // A-RACE TAPER anchored to the race date: race falls inside this week or
  // the next → progressive cut. Week-of ≈ −55%, week-before ≈ −41% (volume
  // ramps down 2 weeks out; intensity is preserved by the session builders).
  const aRaces = races.filter((r) => r.pr === 1);
  for (const r of aRaces) {
    if (r.t >= wkStart && r.t < wkEnd) return { vol: 0.45 * step, phase: "taper", block };
    if (r.t >= wkEnd && r.t < wkEnd + 7 * 86400000) return { vol: 0.59 * step, phase: "taper", block };
    if (r.t >= wkEnd + 7 * 86400000 && r.t < wkEnd + 14 * 86400000) return { vol: 0.75 * step, phase: "build", block };
  }

  // B-RACE sharpening: −20% in race week only (train through the block).
  const bRaces = races.filter((r) => r.pr === 2);
  for (const r of bRaces) {
    if (r.t >= wkStart && r.t < wkEnd) return { vol: 0.8 * step, phase: "build", block };
  }

  // No nearby priority race: the classic 6-week mesocycle stands (week 6
  // taper/test week) — but ONLY when no A race exists later in the plan;
  // with a real A date ahead, block-position taper is suppressed so the
  // race-anchored cut above is the only taper.
  const hasFutureARace = aRaces.some((r) => r.t >= wkStart);
  const isTaper = inBlock === 5 && !hasFutureARace;
  if (isTaper) return { vol: 0.55 * step, phase: "taper", block };
  return { vol: within * step, phase: "build", block };
}

// ---- Research-based single-session caps (owner feedback: 3h scheduled run) ----
// Hard sessions: >90 min of threshold/VO2 work exceeds the stimulus window and
// degrades recovery (Seiler polarized model). Long endurance: capped at 30% of
// weekly volume and 150 min (non-marathon) — the classic long-run ceiling;
// full-distance goal allows up to 180 min. Strength capped at 90.
export function capSessionMinutes<T extends { title: string; minutes: number; type?: string }>(
  s: T,
  weeklyTotalMin: number,
  goal?: string | null,
): T {
  const isHard = /tempo|threshold|interval|vo2|repeat|race pace|sharpen/i.test(s.title) || s.type === "interval" || s.type === "threshold";
  const isLong = /long/i.test(s.title) || s.type === "endurance";
  const fullGoal = goal === "full";
  if (isHard) return { ...s, minutes: Math.min(s.minutes, 90) };
  if (isLong) {
    const cap = Math.min(fullGoal ? 180 : 150, Math.round(weeklyTotalMin * 0.3));
    return { ...s, minutes: Math.min(s.minutes, Math.max(45, cap)) };
  }
  if (s.type === "strength") return { ...s, minutes: Math.min(s.minutes, 90) };
  return s;
}

export function generatePlan(opts: {
  level: string; // beginner | amateur | advanced | pro
  distance: string; // sprint | olympic | half | full
  weeks: number;
  startDate: Date;
  swimBase?: number; // weekly swim min
  bikeBase?: number;
  runBase?: number;
  strengthBase?: number;
  weeklyHours?: number;
  easyPct?: number; // target % of weekly minutes in Z1-Z2; rest = quality. Default 70 (70/30).
  raceDate?: Date; // race day — volume dips after it, then rebuilds
  extraRaces?: PlanRace[]; // B/C races — B = train-through sharpening
}): GeneratedWeek[] {
  const { level, distance, weeks, startDate, weeklyHours, easyPct, raceDate, extraRaces } = opts;
  const splitTarget = easyPct ?? 70; // 70/30 default, manual-adjustable
  const baseWeekly = weeklyHours ?? (level === "pro" ? 20 : level === "advanced" ? 14 : level === "amateur" ? 10 : 6);
  // Distance multipliers for weekly hours
  const distFactor: Record<string, number> = { sprint: 0.6, olympic: 0.8, half: 1.0, full: 1.3 };
  const targetHours = baseWeekly * (distFactor[distance] ?? 1);
  // 6-week mesocycles: week 6 = taper + baseline test, each block +5-10%
  const races: PlanRace[] = [
    ...(raceDate ? [{ date: raceDate, priority: 1 }] : []),
    ...(extraRaces || []),
  ];

  const weeksOut: GeneratedWeek[] = [];
  for (let w = 1; w <= weeks; w++) {
    const { vol: volumeFactor, phase: ph, block } = mesoVolumeRaces(w - 1, level, races, startDate);
    // legacy 4-phase mapping for session content variety: early block = base,
    // mid = build, late = peak-style race work, week 6 = taper
    const inBlock = (w - 1) % 6;
    const legacy: "base" | "build" | "peak" | "taper" = ph === "taper" ? "taper" : inBlock <= 1 ? "base" : inBlock <= 3 ? "build" : "peak";
    const phaseTheme: Record<string, string> = {
      build: `Block ${block + 1} · Threshold & Speed`,
      taper: "Baseline Test Week · Freshness & Taper",
    };

    const totalMin = Math.round(targetHours * 60 * volumeFactor);
    // Session split by sport (triathlon norms)
    const swimPct = distance === "full" ? 0.25 : 0.3;
    const bikePct = distance === "full" ? 0.45 : 0.4;
    const runPct = 0.25;
    const strengthPct = level === "pro" || level === "advanced" ? 0.08 : 0.1;
    const swimMin = Math.round(totalMin * swimPct);
    const bikeMin = Math.round(totalMin * bikePct);
    const runMin = Math.round(totalMin * runPct);
    const strengthMin = Math.round(totalMin * strengthPct);

    const sessions: PlanSession[] = [];
    const sessionCount = Math.max(4, Math.round(totalMin / 45));
    const hardSessions = level === "pro" ? 4 : level === "advanced" ? 3 : level === "amateur" ? 2 : 2;

    // ---- SWIM ----
    if (legacy === "base") {
      sessions.push({ sport: "swim", title: "Swim: Endurance & Technique", minutes: swimMin, zone: "z2", type: "endurance", description: "Continuous swim with 4×50m technique drills. Focus on body position and breathing. Swim as one of the most technical sports — drill quality over speed." });
    } else if (legacy === "build") {
      sessions.push({ sport: "swim", title: "Swim: Threshold Set", minutes: swimMin, zone: "z4", type: "threshold", description: "Warm-up 400m, then 8×100m at T-pace with 20s rest, cool-down 200m. Or 4×200m at threshold (Friel swim zone 4)." });
    } else if (legacy === "peak") {
      sessions.push({ sport: "swim", title: "Swim: Race Pace + Open Water", minutes: swimMin, zone: "z4", type: "interval", description: "Simulate race start: 200m hard, 6×100m at race pace, sighting drills every 4th stroke. Open-water practice if possible — sighting and drafting are race-specific skills." });
    } else {
      sessions.push({ sport: "swim", title: "Swim: Sharpening", minutes: Math.round(swimMin * 0.6), zone: "z4", type: "interval", description: "Short and sharp: 200m w/u, 6×50m fast with 30s rest, 200m c/d. Keep the nervous system primed without fatigue." });
    }

    // ---- BIKE ----
    const bikeSessions = level === "pro" ? 4 : level === "advanced" ? 3 : level === "amateur" ? 3 : 2;
    for (let i = 0; i < bikeSessions; i++) {
      const part = Math.round(bikeMin / bikeSessions);
      if (legacy === "base") {
        sessions.push({ sport: "bike", title: i === 0 ? "Bike: Long Endurance" : "Bike: Aerobic Spin", minutes: i === 0 ? part + 15 : part, zone: "z2", type: "endurance", description: i === 0 ? `Long ride in Z2 (81-89% LTHR). Nutrition practice: 60-90g carbs/hour. This is the session that builds the aerobic engine (Seiler 2009).` : `Steady Z2 spin. Keep cadence 85-95 rpm. Optional: 3×10 min at Z3 at the end if feeling fresh.` });
      } else if (legacy === "build") {
        sessions.push({
          sport: "bike",
          title: i === 0 ? "Bike: Threshold Intervals" : i === 1 ? "Bike: Tempo" : "Bike: VO2max Intervals",
          minutes: part,
          zone: i === 0 ? "z4" : i === 1 ? "z3" : "z6",
          type: i === 0 ? "threshold" : i === 1 ? "tempo" : "interval",
          description: i === 0
            ? `Warm-up 20 min, then 3×10 min at 94-99% LTHR (or 91-105% FTP) with 5 min easy between. This is THE most important bike session of the week.`
            : i === 1
              ? `20 min W/U, 2×20 min tempo (90-93% LTHR) with 8 min easy, 15 min C/D.`
              : `20 min W/U, 6×3 min at 106-120% FTP / 103-106% LTHR with 3 min easy between. Push hard but controlled.`,
        });
      } else if (legacy === "peak") {
        sessions.push({ sport: "bike", title: i === 0 ? "Bike: Race Simulation" : "Bike: Race Pace Intervals", minutes: part, zone: i === 0 ? "z4" : "z3", type: "interval", description: i === 0 ? `Simulate race day: long ride with race-pace blocks, including climbs at Z4 and flats at Z3. Practice aero position and nutrition.` : `Race pace work: 4×8 min at Z4 with 4 min Z1 between.` });
      } else {
        sessions.push({ sport: "bike", title: "Bike: Taper Spin", minutes: Math.round(part * 0.5), zone: "z2", type: "recovery", description: "Short, easy spins. 3-4 accelerations of 1 min at Z4 to keep legs fresh, then easy. Less is more." });
      }
    }

    // ---- RUN ----
    const runSessions = level === "pro" ? 4 : level === "advanced" ? 3 : level === "amateur" ? 2 : 2;
    for (let i = 0; i < runSessions; i++) {
      const part = Math.round(runMin / runSessions);
      if (legacy === "base") {
        sessions.push({ sport: "run", title: i === 0 ? "Run: Long Aerobic" : "Run: Easy + Strides", minutes: i === 0 ? part + 10 : part, zone: "z2", type: "endurance", description: i === 0 ? `Long run in Z2. Heart rate capped at 89% LTHR. Run slow to run fast — 80% of weekly volume should be easy (Stöggl 2016).` : `Easy Z2 run finishing with 6×20s strides at Z5 to maintain leg speed without fatigue.` });
      } else if (legacy === "build") {
        sessions.push({
          sport: "run",
          title: i === 0 ? "Run: Track Intervals" : i === 1 ? "Run: Tempo" : "Run: Hill Repeats",
          minutes: part,
          zone: i === 0 ? "z5" : i === 1 ? "z4" : "z6",
          type: i === 0 ? "interval" : i === 1 ? "threshold" : "interval",
          description: (i === 0
            ? `W/U 10 min jog + drills. 6×800m at vVO2max (Z5) with 400m jog recovery. C/D 10 min. Pace: about 3-5% faster than 5k pace.`
            : i === 1
              ? `15 min W/U, 3×10 min at T-pace (Z4) with 3 min easy jog, 10 min C/D.`
              : `Hills: 8×60s hard uphill (Z6) with jog-down recovery. Powerful, controlled, arms pumping.`),
        });
      } else if (legacy === "peak") {
        sessions.push({ sport: "run", title: i === 0 ? "Run: Race Pace" : "Run: Cruise Intervals", minutes: part, zone: i === 0 ? "z4" : "z3", type: "interval", description: i === 0 ? `Race pace simulation: 4×10 min at target race pace with 3 min easy. Practice fueling — gels at race intervals.` : `Comfortably hard cruise intervals at 90-93% LTHR.` });
      } else {
        sessions.push({ sport: "run", title: "Run: Taper Jog", minutes: Math.round(part * 0.5), zone: "z2", type: "recovery", description: "Easy 20-30 min jog with 4×20s strides. Legs stay sharp, fatigue stays low." });
      }
    }

    // Keep the scheduled strength/power slots. Movement review, not a blanket
    // product rule, determines whether optional plyometrics are appropriate.
    if (strengthMin >= 30) {
      const phaseFocus = legacy === "base"
        ? "Strength: Foundation — practice familiar squat, hinge, press and pull movements within the allocated time. Your coach should select loads, repetitions and recovery from movement technique, experience, equipment and current tolerance. Plyometrics are optional only after specific movement and experience review; no jump dose is prescribed automatically."
        : legacy === "build"
          ? "Strength: Power preparation — use familiar coach-reviewed strength movements with full recovery within the allocated time. Explosive lifting and plyometrics require specific technique, experience and tolerance review; no automatic Olympic-lift or jump dose is assigned."
          : "Strength: Maintenance — use familiar coach-reviewed movements and tolerable loads within the allocated time. Avoid adding unfamiliar explosive work near the race; review the maintenance dose with your coach.";
      sessions.push({ sport: "strength", title: legacy === "taper" ? "Strength: Maintenance" : `Strength: ${legacy === "base" ? "Foundation" : legacy === "build" ? "Power preparation" : "Maintenance"}`, minutes: strengthMin, zone: "z1", type: "strength", description: phaseFocus });
      // Preserve the existing optional power slot and its allocation. The
      // legacy type supports scheduling; it does not establish jump eligibility.
      if (legacy === "base") {
        sessions.push({ sport: "strength", title: "Strength: Movement preparation", minutes: Math.max(25, Math.round(strengthMin * 0.5)), zone: "z3", type: "plyo", description: "Use familiar coach-reviewed strength or controlled movement practice within this time, with adequate recovery. Plyometrics are optional after review of movement technique, experience, equipment and current tolerance. Without that review, no jumps or explosive loads are prescribed. Performance research does not establish injury prevention or a mandatory dose for every athlete." });
      }
      if (legacy === "build" || legacy === "peak") {
        sessions.push({ sport: "strength", title: "Strength: Power preparation — review first", minutes: Math.max(25, Math.round(strengthMin * 0.5)), zone: "z3", type: "plyo", description: "Use familiar coach-reviewed strength movements and full recovery within this time. Optional power or plyometric work needs specific movement, experience, equipment and tolerance review. No depth jumps, bounds or explosive loads are assigned automatically; the reserved slot is not proof that these movements are suitable." });
      }
    }

    // ---- BRICK (bike→run) ----
    if (legacy === "build" || legacy === "peak") {
      sessions.push({ sport: "brick", title: "Brick: Bike → Run", minutes: 75, zone: "z3", type: "brick", description: "60 min ride (last 20 at race effort) + 15 min run off the bike at race pace. The legs learn to run tired — this is where triathlon is won. Do this weekly in build, twice in peak." });
    }

    // ---- RECOVERY ----
    sessions.push({ sport: "recovery", title: "Recovery: Active Recovery + Mobility", minutes: 30, zone: "z1", type: "recovery", description: "Easy Z1 spin/walk/row. 15 min mobility work (hips, ankles, T-spine). Sleep is the #1 recovery tool — target 8h, prioritize early bedtime." });

    // Enforce the user's easy/quality split on every non-taper week (meso rule:
    // taper/test week keeps race-specific + fresh work as designed).
    const splitSessions = legacy !== "taper" ? enforceSplit(sessions, splitTarget) : sessions;

    // ---- BUDGET & INTEGERITY GUARANTEE ----
    // Sport splits already sum to ~totalMin, but brick/recovery/plyo are added
    // on top and enforceSplit adjusts minutes — the summed week could exceed
    // the athlete's availability (reproduced: 8h plan → 9.8h). Trim ONLY easy
    // endurance volume (never quality, brick, plyo or strength) until the week
    // fits, then round every session so Workout.durationMin (Int) is never
    // handed a fraction.
    const budgetMin = totalMin;
    let finalSessions = splitSessions;
    const sumMin = (list: PlanSession[]) => list.reduce((a, s) => a + s.minutes, 0);
    let excess = sumMin(finalSessions) - budgetMin;
    if (excess > 0) {
      const trimmable = finalSessions.filter(
        (s) => (s.zone === "z1" || s.zone === "z2") && s.type === "endurance" && s.minutes > 25,
      );
      const trimmableTotal = trimmable.reduce((a, s) => a + (s.minutes - 20), 0);
      if (trimmableTotal > 0) {
        const factor = Math.max(0, 1 - excess / trimmableTotal);
        finalSessions = finalSessions.map((s) =>
          trimmable.includes(s) && s.minutes > 25
            ? { ...s, minutes: Math.max(20, Math.round(s.minutes * factor)) }
            : s,
        );
      }
    }
    finalSessions = finalSessions.map((s) => ({
      ...s,
      minutes: Math.max(1, Math.round(s.minutes)),
    }));

    const cappedSessions = finalSessions.map((x) => capSessionMinutes(x, totalMin, distance));
    weeksOut.push({
      week: w,
      theme: phaseTheme[ph],
      sessions: cappedSessions,
      // Report what the week ACTUALLY contains, after all adjustments.
      totalMinutes: sumMin(cappedSessions),
    });
  }
  return weeksOut;
}

// ---- Easy/quality split enforcement (70/30 default, manual-adjustable) ----
// easy = Z1-Z2 minutes, quality = Z3+. Flipping only boundary sessions
// (tempo ↔ endurance) keeps plan intent; never touches race-sim/brick/recovery.
export function easyShareOf(sessions: PlanSession[]): number {
  const total = sessions.reduce((a, s) => a + s.minutes, 0);
  if (total <= 0) return 0;
  const easy = sessions.filter((s) => s.zone === "z1" || s.zone === "z2").reduce((a, s) => a + s.minutes, 0);
  return Math.round((easy / total) * 100);
}

export function enforceSplit(sessions: PlanSession[], easyPct: number): PlanSession[] {
  if (!Number.isFinite(easyPct)) throw new Error("Invalid easy-training percentage");
  const target = Math.max(45, Math.min(90, easyPct));
  const work = sessions.map(s => ({ ...s }));
  // A planning preference is a lower bound on easy aerobic minutes, not a
  // quota that justifies promoting recovery into harder work. Strength,
  // transitions and station work cannot be classified by their HR label.
  const aerobic = (s: PlanSession) => ["run", "bike", "swim"].includes(s.sport) && !["strength", "plyo", "brick"].includes(s.type);
  const total = work.filter(aerobic).reduce((sum, s) => sum + s.minutes, 0);
  let easy = work.filter(s => aerobic(s) && ["z1", "z2"].includes(s.zone)).reduce((sum, s) => sum + s.minutes, 0);
  const candidates = work.map((s, index) => ({ s, index })).filter(({ s }) => aerobic(s) && !["z1", "z2"].includes(s.zone)).sort((a, b) => a.s.minutes - b.s.minutes);
  for (const { s, index } of candidates) {
    if (!total || easy / total * 100 >= target) break;
    work[index] = { ...s, zone: "z2", type: "endurance", title: `${s.sport}: Easy aerobic session`, description: `${s.minutes} minutes total at comfortable conversational effort, including an easy start and finish. This replaces the original hard set to respect the selected easy-training preference. The percentage is a planning approximation, not measured time in physiological zones.` };
    easy += s.minutes;
  }
  return work;
}

// ---- Structured session detail (WU / Main / CD / Breathing / Study) ----
// Main set: the workout's own description (now stored per-session in
// Workout.notes), falling back to a specialist-coach template per sport+type
// so NO session ever shows an empty main set.
export interface SessionDetail {
  wu: string;
  main: string;
  cd: string;
  breathing: string;
  study: string;
}

const ZONE_LABEL: Record<string, string> = {
  z1: "Z1 Easy (68-73% max HR — recovery, conversational)",
  z2: "Z2 Steady (73-80% max HR — endurance, nose-breathing pace)",
  z3: "Z3 Moderately Hard (80-87% max HR — tempo)",
  z4: "Z4 Hard (87-93% max HR — threshold)",
  z5: "Z5 Very Hard (93-100% max HR — VO2max)",
  z6: "Z6 VO2max intervals (max effort; HR tops out — use pace/power)",
  z7: "Z7 anaerobic sprints (HR not useful — use pace/power)",
};

function mainTemplate(sport: string, type: string, zone: string, minutes: number): string {
  const z = ZONE_LABEL[zone] || ZONE_LABEL.z2;
  const work = Math.max(15, minutes - 25); // main-set budget after WU/CD
  const t = `≈ ${Math.round(work)} min total`;
  if (sport === "swim") {
    if (type === "interval") {
      const n = Math.max(4, Math.round(work / 3));
      return `Main: ${n}×100m fast (${z}), ~1:40–2:00 each, 20s rest between → ${t}. Count strokes — fewer per lap = more efficient. Finish each rep with 5m strong off the wall.`;
    }
    if (type === "threshold") {
      const n = Math.max(4, Math.round(work / 3));
      return `Main: ${n}×100m at T-pace (${z}), ~1:40–2:00 each, 20s rest → ${t}. Hold pace — if it drops >3s/100m, stop the set.`;
    }
    const n = Math.max(3, Math.round(work / 8));
    return `Main: ${n}×(150m easy + 50m technique drill: catch-up, fingertip drag, 3-3-3 breathing), ~4 min per round (${z}) → ${t}. Body position high, hips up, long stroke.`;
  }
  if (sport === "bike") {
    if (type === "interval") return `Main: 5×3 min at ${z} (3 min easy spin between) → ${t}. Seated, cadence 90+. Each rep hard but repeatable.`;
    if (type === "threshold") return `Main: 3×10 min at ${z} / 91–105% FTP (5 min easy between) → ${t}. Hold power steady — don't surge rep 1. Aero on the intervals.`;
    if (type === "tempo") return `Main: 2×20 min at ${z} (8 min easy between) → ${t}. Cadence 85–95. Eat/drink — race-practice for the gut.`;
    return `Main: ${Math.round(work)} min steady ${z} → ${t}. Cadence 85–95 rpm. Fuel 60–90g carbs/hr if >90 min (Jeukendrup 2014).`;
  }
  if (sport === "run") {
    if (type === "interval") return `Main: 6×800m at vVO2max (${z}), ~3:00–3:30 each, 400m jog recovery ~2:00 → ${t} (Billat 2001). Stop the set if pace drops or form breaks.`;
    if (type === "threshold") return `Main: 3×10 min at T-pace (${z}, ~7/10 effort), 3 min easy jog between → ${t}. T-pace = what you could race for 1 hour.`;
    if (type === "tempo") return `Main: 20–30 min continuous at ${z} (marathon effort) → ${t}. Relax shoulders, quick feet, 3-3 breathing rhythm.`;
    return `Main: ${Math.round(work)} min easy ${z} → ${t}. Cap HR 89% LTHR. Conversational — if you can't talk, slow down (Seiler: 80% of volume lives here).`;
  }
  if (sport === "strength") {
    return `Main: 3–5 sets × 5–8 reps compound lifts — squat, deadlift, bench/row, 2–3 min rest between sets → ${t} (Rønnestad 2014: heavy strength improves endurance economy). Bar speed intentional; leave 2 reps in reserve.`;
  }
  if (sport === "brick") {
    return `Main: 60 min ride (last 20 min at race effort) then IMMEDIATELY off the bike into 15 min run at race pace → ≈ 75 min total. First 400m on foot feels like stilts — that's the skill you're training.`;
  }
  if (sport === "recovery") {
    return `Main: ${Math.round(work)} min anything-goes at ${z} → ${t}. Walk, easy spin, swim, stretch, yoga. Goal is blood flow, not fitness. Labored breathing = too hard.`;
  }
  if (sport === "boxing") {
    if (type === "interval") return `Main: ${Math.max(4, Math.round(work / 4))}×3 min rounds (${z}), 1 min rest → ${t}. Each round a job: output burst → counter-boxing → pivot-and-exit footwork. Hands back to face after every punch.`;
    if (type === "skill") return `Main: ${Math.max(3, Math.round(work / 5))}×2 min technique rounds → ${t}. One pattern per round (jab range, slip-roll-counter, angle exit). 60% speed first — slow is smooth.`;
    if (type === "strength") return `Main: familiar coach-reviewed strength and trunk movements within ${t}, with tolerable loads and adequate recovery. Optional explosive work requires specific technique, experience and tolerance review; no explosive push-up or throwing dose is assigned automatically.`;
    return `Main: ${Math.round(work)} min continuous ${z} in 3-min rounds (1 min rest) → ${t}. Long steady output, clean mechanics.`;
  }
  return `Main: ${Math.round(work)} min at ${z} → ${t}.`;
}

const WU_TEMPLATES: Record<string, string> = {
  swim: "~10 min easy swim (200-400m) + 4×50m technique drills (body position, breathing, catch). Keep HR in Z1-Z2.",
  bike: "15 min easy spin (Z1-Z2), cadence 85-95 rpm, then 3×1 min at Z3 openers with 1 min easy between.",
  run: "10 min easy jog (Z1-Z2) + dynamic drills: 4×20s high knees, butt kicks, leg swings, 2×20m strides.",
  strength: "5 min light cardio (bike/row) + dynamic warm-up: leg swings, arm circles, 10 bodyweight squats, 10 push-ups.",
  brick: "15 min easy spin (Z1-Z2), then practice a quick transition: shoes off, 2×1 min run off the bike.",
  boxing: "10 min jump rope (loose-shoulder singles, 30s doubles sprinkled) + 2 min shadow at half speed + wrist circles and band pull-aparts ×15.",
  recovery: "2 min easy — this is a recovery day; just get moving.",
};

const CD_TEMPLATES: Record<string, string> = {
  swim: "~5 min: 200m easy swim + 5 min mobility (shoulders, hips, ankles).",
  bike: "10 min easy spin (Z1) + 5 min light stretching (quads, hips, hamstrings).",
  run: "10 min easy jog (Z1) + 5 min mobility (hips, calves, T-spine).",
  strength: "5 min light cardio + 10 min static stretching of the trained muscle groups.",
  brick: "10 min easy jog + 5 min mobility. Legs will feel heavy — that's the adaptation.",
  boxing: "10 min easy rope or shadow (Z1) + 5 min wrist/forearm and shoulder mobility + neck isometrics 2×30s.",
  recovery: "Done — that was the workout.",
};

const STUDY_BY_TYPE: Record<string, string> = {
  interval: "Billat et al. 2001 — vVO2max interval prescription (Med Sci Sports Exerc 33:1597-1602)",
  threshold: "Friel 7-zone LT model (Triathlete's Training Bible); Seiler & Tønnessen 2009, Sportscience 13:32–53 (synthesis, not validation of JMM dosing)",
  tempo: "Seiler & Tønnessen 2009 — intensity-distribution synthesis (Sportscience 13:32–53)",
  endurance: "Seiler & Tønnessen 2009 — intensity-distribution synthesis (Sportscience 13:32–53); not validation of JMM dosing",
  strength: "Rønnestad & Mujika 2014 — strength improves endurance economy (Scand J Med Sci Sports)",
  brick: "Friel — transition practice (The Triathlete's Training Bible)",
  skill: "Motor learning: variability of practice improves skill retention (Wulf 2013, Int Rev Sport Exerc Psychol)",
  recovery: "Buchheit 2014 — HRV-guided recovery (Front Physiol 5:73)",
};

export function buildSessionDetail(
  s: { sport: string; type: string; zone: string; minutes: number; description: string },
  recoveryNote?: string,
): SessionDetail {
  const sport = s.sport || "run";
  const wu = WU_TEMPLATES[sport] || WU_TEMPLATES.run;
  // Main set: prefer the session's own prescription; if empty or too thin,
  // generate a specialist-coach template from sport+type+zone+duration.
  const desc = (s.description || "").trim();
  const main = desc.length >= 25 ? desc.replace(/^(?:W\/U|Warm-up|warm up)[^.]*\.\s*/, "") : mainTemplate(sport, s.type, s.zone, s.minutes);
  const cd = CD_TEMPLATES[sport] || CD_TEMPLATES.run;
  const breathing = recoveryNote || "Recovery & ANS down-regulation (5–10 min): shift sympathetic → parasympathetic (vagal tone). Physiological sigh (double inhale + long exhale) ×5, or box breathing 4-4-4-4 ×10, or 4-7-8 ×4. Slow extended-exhale breathing raises HRV — your objective recovery score (Buchheit 2014). Splash cold water on face/neck for the dive reflex (extra vagal kick).";
  const study = STUDY_BY_TYPE[s.type] || STUDY_BY_TYPE.endurance;
  return { wu, main, cd, breathing, study };
}

// ---------- HYROX ----------
// 8 × (1km run + functional station), 8km running total. Weights/distances from the
// official HYROX rulebook (Singles, all four divisions). Race loads are reference values, not training prescriptions.
export interface HyroxStation {
  key: string;
  name: string;
  spec: string;   // distance/reps
  women: string;  // open weight (or "—")
  men: string;
  womenPro: string;
  menPro: string;
  targetHeightM?: { women: number; men: number; womenPro: number; menPro: number };
  focus: string;
}

export const HYROX_SINGLES_RULEBOOK = "https://hyrox.mx/wp-content/uploads/2026/07/26_27_HYROX_RulebookSingles_EN_240626.pdf";
export const HYROX_STATION_DIVISION_LABELS = { women: "Women Open", men: "Men Open", womenPro: "Women Pro", menPro: "Men Pro" } as const;
export const HYROX_STATIONS: HyroxStation[] = [
  { key: "ski", name: "SkiErg", spec: "1000m", women: "—", men: "—", womenPro: "—", menPro: "—", focus: "Lats, shoulders, core + aerobic. Arrive off Run 1 — don't spike HR here." },
  { key: "sledpush", name: "Sled Push", spec: "50m (4×12.5m)", women: "102kg", men: "152kg", womenPro: "152kg", menPro: "202kg", focus: "Legs, posterior chain, calves. Raw strength + grip shoes." },
  { key: "sledpull", name: "Sled Pull", spec: "50m (4×12.5m)", women: "78kg", men: "103kg", womenPro: "103kg", menPro: "153kg", focus: "Glutes, back, biceps, grip. Hand-over-hand rope under fatigue." },
  { key: "burpee", name: "Burpee Broad Jumps", spec: "80m", women: "—", men: "—", womenPro: "—", menPro: "—", focus: "Full body + biggest HR spike of the race. Pacing beats sprinting." },
  { key: "row", name: "Rowing", spec: "1000m", women: "—", men: "—", womenPro: "—", menPro: "—", focus: "Back, legs, aerobic. Go conservative early — pays off late." },
  { key: "farmers", name: "Farmers Carry", spec: "200m", women: "2×16kg", men: "2×24kg", womenPro: "2×24kg", menPro: "2×32kg", focus: "Grip, traps, postural endurance. Grip is already compromised here." },
  { key: "lunges", name: "Sandbag Lunges", spec: "100m", women: "10kg", men: "20kg", womenPro: "20kg", menPro: "30kg", focus: "Quads, hip flexors. Knee-to-floor standard fails when hip flexors are tight." },
  { key: "wallball", name: "Wall Balls", spec: "100 reps", women: "4kg", men: "6kg", womenPro: "6kg", menPro: "9kg", targetHeightM: { women: 2.7, womenPro: 2.7, men: 3, menPro: 3 }, focus: "Squat mechanics, shoulders, lungs. Everything is loaded by this point." },
];

// HYROX periodized generator — run + station-specific strength + "compromised running"
// (the run→station transition that defines the sport).
export function generateHyroxPlan(opts: {
  level: string; // beginner | amateur | advanced | pro
  weeks: number;
  startDate: Date;
  weeklyHours?: number;
}): GeneratedWeek[] {
  const { level, weeks, startDate, weeklyHours } = opts;
  const baseWeekly = weeklyHours ?? (level === "pro" ? 14 : level === "advanced" ? 10 : level === "amateur" ? 7 : 5);
  const legacy = (w: number): "base" | "build" | "peak" | "taper" => {
    const inBlock = (w - 1) % 6;
    return inBlock === 5 ? "taper" : inBlock <= 1 ? "base" : inBlock <= 3 ? "build" : "peak";
  };
  const theme: Record<string, string> = {
    base: "Aerobic Base + Strength Foundation",
    build: "Station-Specific + Compromised Running",
    peak: "Race Simulation",
    taper: "Freshness & Taper",
  };

  const weeksOut: GeneratedWeek[] = [];
  for (let w = 1; w <= weeks; w++) {
    const ph = legacy(w);
    const vol = mesoVolume(w - 1, level).vol;

    const totalMin = Math.round(baseWeekly * 60 * vol);
    const sessions: PlanSession[] = [];
    const runMin = Math.round(totalMin * 0.4);
    const strengthMin = Math.round(totalMin * 0.5);
    const otherMin = Math.round(totalMin * 0.1);

    // RUN
    if (ph === "base") {
      sessions.push({ sport: "run", title: "Run: Easy Aerobic", minutes: Math.round(runMin * 0.45), zone: "z2", type: "endurance", description: "Easy Z2 run. HYROX is 8×1km — build the aerobic engine that lets you recover between stations (Seiler 2009)." });
      sessions.push({ sport: "run", title: "Run: Long Run", minutes: Math.round(runMin * 0.4), zone: "z2", type: "endurance", description: "Longer Z2 run. Cap HR at 89% LTHR. Run slow to run fast." });
      sessions.push({ sport: "run", title: "Run: Strides", minutes: Math.round(runMin * 0.15), zone: "z5", type: "interval", description: "Easy run + 6×20s strides at Z5 to keep leg speed without fatigue." });
    } else if (ph === "build") {
      sessions.push({ sport: "run", title: "Run: 1km Repeats", minutes: Math.round(runMin * 0.4), zone: "z5", type: "interval", description: "Coach-selected repeatable running intervals within the allocated time, including warm-up and recovery. Do not infer race pace or a six-kilometre work set from the session label." });
      sessions.push({ sport: "run", title: "Run: Tempo", minutes: Math.round(runMin * 0.3), zone: "z4", type: "threshold", description: "Controlled running work within the allocated time. Use reviewed running anchors and complete recoveries; station fatigue does not establish a threshold or race pace." });
      sessions.push({ sport: "run", title: "Run: Easy + Hills", minutes: Math.round(runMin * 0.3), zone: "z2", type: "endurance", description: "Easy conversational running within the allocated time. Hill intervals are additional hard work and require a separately reviewed prescription." });
    } else if (ph === "peak") {
      sessions.push({ sport: "run", title: "Run: Race-Pace 1km", minutes: Math.round(runMin * 0.5), zone: "z4", type: "interval", description: "Reviewed running intervals within the allocated time including warm-up and recovery. Race pace requires a valid individual anchor; this template does not establish it." });
      sessions.push({ sport: "run", title: "Run: Sharpening", minutes: Math.round(runMin * 0.3), zone: "z3", type: "tempo", description: "Short controlled efforts based on current running anchors, with full recoveries and total work fitted to the allocated time." });
    } else {
      sessions.push({ sport: "run", title: "Run: Taper Jog", minutes: Math.round(runMin * 0.6), zone: "z2", type: "recovery", description: "Easy running within the allocated time. Add only familiar strides after reviewing recovery and proximity to the actual event." });
    }

    // STRENGTH / STATIONS
    if (ph === "base") {
      sessions.push({ sport: "strength", title: "Strength: Sled & Squat Foundation", minutes: Math.round(strengthMin * 0.35), zone: "z1", type: "strength", description: "Technique-focused squat, hinge and light sled practice within the allocated time. A coach should select familiar loads and repetitions from experience, equipment and tolerance. Plyometrics are optional after movement review, not mandatory." });
      sessions.push({ sport: "strength", title: "Engine: SkiErg + Row", minutes: Math.round(strengthMin * 0.3), zone: "z2", type: "endurance", description: "Familiar SkiErg and rowing technique at steady aerobic effort within the allocated time; select repetitions and distances from current capacity." });
      sessions.push({ sport: "strength", title: "Conditioning: Carry + Lunge + Wall Ball", minutes: Math.round(strengthMin * 0.35), zone: "z3", type: "strength", description: "Familiar carries, lunges and wall-ball technique within the allocated time, using reviewed repetitions and loads appropriate to current capacity." });
    } else if (ph === "build") {
      sessions.push({ sport: "strength", title: "Station: Sled Push + Pull", minutes: Math.round(strengthMin * 0.35), zone: "z4", type: "strength", description: "Coach-selected sled push/pull practice within the allocated time. Confirm division, sled surface, equipment and demonstrated capacity before selecting loads or distances. Race loads and depth jumps are not defaults." });
      sessions.push({ sport: "strength", title: "Station: Erg Intervals", minutes: Math.round(strengthMin * 0.3), zone: "z4", type: "interval", description: "SkiErg/row technique and repeatable efforts within the allocated time, with complete recoveries. Adjust damper to your practiced setting; a preset is not an individual prescription." });
      sessions.push({ sport: "strength", title: "Station: Burpees + Carries + Wall Balls", minutes: Math.round(strengthMin * 0.35), zone: "z4", type: "strength", description: "Coach-reviewed station technique within the allocated time. Confirm equipment, division and demonstrated capacity before selecting loads, repetitions or distances; race loads are not defaults." });
    } else if (ph === "peak") {
      sessions.push({ sport: "strength", title: "Station: Reviewed Dress Rehearsal", minutes: Math.round(strengthMin * 0.6), zone: "z4", type: "strength", description: "Scaled station rehearsal within the allocated time using reviewed familiar loads. Full race loads and a complete race simulation require separate approval and sufficient time." });
    } else {
      sessions.push({ sport: "strength", title: "Strength: Maintenance", minutes: Math.round(strengthMin * 0.5), zone: "z1", type: "strength", description: "Use familiar controlled strength movements within the allocated time at coach-reviewed tolerable loads and repetitions. Do not add unfamiliar explosive work during taper; review the maintenance dose before the race." });
    }

    // COMPROMISED RUNNING (the defining HYROX skill)
    if (ph === "build" || ph === "peak") {
      sessions.push({ sport: "hyrox", title: "Compromised Run: Station Intervals", minutes: 45, zone: "z3", type: "brick", description: "Alternate short, controlled running and familiar station technique within the allocated time. Division, equipment, running capacity and station competence must guide the detailed prescription." });
    }
    if (ph === "peak" || ph === "taper") {
      sessions.push({ sport: "hyrox", title: "Race Sim: Full/Short HYROX", minutes: ph === "peak" ? 60 : 40, zone: "z4", type: "brick", description: ph === "peak" ? "Scaled transition practice within the allocated time, using individually reviewed station loads and distances. This is not a complete eight-station race simulation." : "Short reviewed transition practice within the allocated time; scale both running and stations to current capacity." });
    }

    // RECOVERY + MOBILITY
    sessions.push({ sport: "recovery", title: "Recovery: Mobility + Grip/Ankle Care", minutes: Math.round(otherMin > 0 ? otherMin : 25), zone: "z1", type: "recovery", description: "Hip-flexor, ankle and wrist mobility (lunges + wall balls + farmers carry punish them). Easy Z1 flush. Sleep 8h." });

    const capped = sessions.map(x => capSessionMinutes(x, totalMin, undefined));
    const sum = capped.reduce((a, x) => a + x.minutes, 0);
    const factor = Math.min(1, totalMin / Math.max(1, sum));
    const bounded = capped.map(x => ({ ...x, minutes: Math.max(0, Math.floor(x.minutes * factor)) })).filter(x => x.minutes > 0);
    weeksOut.push({ week: w, theme: theme[ph], sessions: bounded, totalMinutes: bounded.reduce((a, x) => a + x.minutes, 0) });
  }
  return weeksOut;
}

// ---- Boxing Fight Camp (individualized, periodized like a real fighter's camp) ----
// Informed by fight-camp practice: aerobic roadwork base → round-intensity build →
// fight-simulation peak → taper. Reactive rounds = offense+defense cues, not just punches.
export function generateBoxingCamp(opts: {
  level: string; // beginner | amateur | advanced | pro
  weeks: number;
  startDate: Date;
  weeklyHours?: number;
}): GeneratedWeek[] {
  const { level, weeks, startDate, weeklyHours } = opts;
  const baseWeekly = weeklyHours ?? (level === "pro" ? 16 : level === "advanced" ? 12 : level === "amateur" ? 8 : 5);
  const phase = (w: number): "base" | "build" | "peak" | "taper" => {
    const pct = w / weeks;
    if (pct <= 0.45) return "base";
    if (pct <= 0.78) return "build";
    if (pct <= 0.9) return "peak";
    return "taper";
  };
  const theme: Record<string, string> = {
    base: "Technique + Aerobic Engine (Roadwork)",
    build: "Round Intensity + Reactive Defense",
    peak: "Fight Simulation + Sparring Sharpening",
    taper: "Freshness & Sharpness",
  };
  // Skill ladder per level (FightFlow-style Skill Academy progression)
  const skillFocus = level === "pro" || level === "advanced"
    ? "feint-and-set traps, check-and-counter angles, pivot exits off the ropes"
    : level === "amateur"
      ? "jab range control, slip-roll-counter chains, lateral exits after combos"
      : "stance symmetry, jab-to-straight 1-2, hands-up reset after every combination";

  const weeksOut: GeneratedWeek[] = [];
  for (let w = 1; w <= weeks; w++) {
    const ph = phase(w);
    const vol = mesoVolume(w - 1, level).vol;

    const totalMin = Math.round(baseWeekly * 60 * vol);
    const sessions: PlanSession[] = [];
    const cardioMin = Math.round(totalMin * 0.25); // roadwork
    const ringMin = Math.round(totalMin * 0.55);    // skill + rounds
    const scMin = Math.round(totalMin * 0.2);       // S&C

    // ROADWORK (the boxer's Z2 base)
    if (ph === "base") {
      sessions.push({ sport: "run", title: "Roadwork: Easy Aerobic Run", minutes: Math.round(cardioMin * 0.5), zone: "z2", type: "endurance", description: "Steady Z2 run — the gas tank that lets you throw round 12 like round 1 (Seiler 2009). Breathe through the nose where you can." });
      sessions.push({ sport: "run", title: "Roadwork: Intervals (fartlek)", minutes: Math.round(cardioMin * 0.3), zone: "z4", type: "interval", description: "Easy jog + 8×2 min hard / 2 min easy surges. Simulates the surge-recover rhythm of exchanges inside a round." });
    } else if (ph === "build" || ph === "peak") {
      sessions.push({ sport: "run", title: "Roadwork: Hill Sprints", minutes: Math.round(cardioMin * 0.4), zone: "z5", type: "interval", description: "10 min easy + 8×30s all-out hill sprints, walk-down recovery. Builds the fast-twitch output behind hand speed and the engine for high-tempo rounds." });
      if (ph === "peak") sessions.push({ sport: "run", title: "Roadwork: Round-Pace Run", minutes: Math.round(cardioMin * 0.3), zone: "z4", type: "tempo", description: "Run 3 min hard / 1 min float ×4 (a 3:1 round shape). Keep the hard floats honest — this maps your engine onto round timing." });
    } else {
      sessions.push({ sport: "run", title: "Roadwork: Shakeout Jog", minutes: Math.round(cardioMin * 0.5), zone: "z1", type: "recovery", description: "20-30 min very easy jog + 4×20s strides. Taper week — flush, don't fish." });
    }

    // RING WORK — skill (technique ladder)
    sessions.push({ sport: "boxing", title: "Skill: Shadowboxing Technique Ladder", minutes: Math.round(ringMin * 0.2), zone: "z2", type: "skill", description: `6×3 min shadow rounds on ${skillFocus}. Film round 4 and 6 — a phone on the gym bag is a coach. Footwork leads, hands follow; reset to stance after every action.` });

    // VISUOMOTOR — eye-brain coordination (top predictor of hit rate: EHC, RT, perceptual span)
    if (ph !== "taper") {
      sessions.push({ sport: "boxing", title: "Reaction Training: Visual Drills", minutes: 20, zone: "z2", type: "skill", description: "10 min: partner or reaction lights (BlazePod/FITLIGHT) call jab/slip/step — react to the cue, don't predict it. 5 min: ball-drop drill (partner drops a tennis ball behind your shoulder, catch before second bounce). 5 min: shadowbox while a partner randomly holds up fingers — call the number mid-combo. EHC + reaction time beat raw eyesight for landing punches (Appelbaum & Erickson 2016; visual-ability study 2025)." });
    }

    // RING WORK — rounds phase-specific
    if (ph === "base") {
      sessions.push({ sport: "boxing", title: "Bag: Volume + Punch Mechanics", minutes: Math.round(ringMin * 0.3), zone: "z3", type: "endurance", description: "6×3 min bag (1 min rest). Every 30s the cue changes: jabs only → 1-2 → 1-2-3 → slip-and-counter shadow. Full extension, exhale on each punch, hands back to the face every time." });
      sessions.push({ sport: "boxing", title: "Defense: Slip-Roll-Block Drill", minutes: Math.round(ringMin * 0.2), zone: "z2", type: "skill", description: "4×3 min partner/bag: throw 1-2, then slip right / roll left / block-high — immediately re-angle 45°. Defense is a footwork problem, not a hand problem." });
    } else if (ph === "build") {
      sessions.push({ sport: "boxing", title: "Reactive Rounds: Offense-Defense Cues", minutes: Math.round(ringMin * 0.3), zone: "z4", type: "interval", description: "8×3 min high-intensity rounds (1 min rest). Structure per round: 30s output burst → 30s counter boxing → footwork-only recovery movement. Have a corner call the cue, or use a timer app — you must REACT, not memorize." });
      sessions.push({ sport: "boxing", title: "Sparring / Drill-Spar: Problem Solving", minutes: Math.round(ringMin * 0.25), zone: "z4", type: "skill", description: level === "beginner" ? "4×2 min technical drill-spar at 50% (touch-points only) against a pad holder or careful partner — eyes open, look for the opening, exit at an angle. Nothing hard yet; this is pattern-building." : "4-6 rounds drill-spar (light-moderate), one tactical problem per round (e.g. land the jab first, or counter the 1-2, or work the body). Debrief one takeaway per round out loud." });
    } else if (ph === "peak") {
      sessions.push({ sport: "boxing", title: "Fight Sim: Full-Dress Rounds", minutes: Math.round(ringMin * 0.35), zone: "z5", type: "interval", description: `${level === "pro" ? "10" : "6"}×3 min at fight tempo (1 min rest): rounds alternate sparring, hard bag with corner instructions, and pad work at full power. Mouthguard, rounds scored by a third party if possible. This is the dress rehearsal.` });
      sessions.push({ sport: "boxing", title: "Conditioning: Burnout Finisher", minutes: Math.round(ringMin * 0.15), zone: "z5", type: "interval", description: "After easy rounds: 3×30s nonstop punches (light bag or shadow, max frequency) with 30s rest, plus 3×20s wall sit. Teach the shoulders to fire when they're gone — that's the last 30 seconds of a close fight." });
    } else {
      sessions.push({ sport: "boxing", title: "Sharp Rounds: Speed, Not Fatigue", minutes: Math.round(ringMin * 0.3), zone: "z3", type: "interval", description: "4×2 min shadow/bag at crisp speed with FULL rest (2 min) between. Quality > quantity all week. Visualize the opening sequences daily — mental reps hold sharpness while the body freshens." });
    }

    // S&C (transfer to punching power / durability)
    if (ph !== "taper") {
      sessions.push({ sport: "strength", title: "S&C: Strength practice — review first", minutes: scMin, zone: "z3", type: "strength", description: "Strength and conditioning: practice familiar coach-reviewed squat, hinge, press, pull and trunk movements within the allocated time. Select loads, repetitions and rests from current experience and tolerance. Plyometrics and explosive lifting are optional only after specific technique and experience review; no jump dose is prescribed automatically." });
    } else {
      sessions.push({ sport: "strength", title: "S&C: Activation Only", minutes: Math.round(scMin * 0.6), zone: "z1", type: "recovery", description: "Banded pull-aparts, hip 90/90s, light med-ball tosses. Keep the nervous system awake, the muscles asleep." });
    }

    // RECOVERY
    sessions.push({ sport: "recovery", title: "Recovery: Mobility + Wrists/Shoulders", minutes: 25, zone: "z1", type: "recovery", description: "Wrist curls + extensor stretches, thoracic openers, hip mobility (roadwork and pivots tax them). 8h sleep is a training session — motor patterns consolidate overnight (Walker)." });

    const csBox = sessions.map((x) => capSessionMinutes(x, totalMin, undefined));
    weeksOut.push({ week: w, theme: theme[ph], sessions: csBox, totalMinutes: csBox.reduce((a, x) => a + x.minutes, 0) });
  }
  return weeksOut;
}

// ---- Track sprint plan generator (100m / 200m / 400m) ----
// Velocity-based sprint training — NOT endurance. Zones are % max velocity.
export function generateTrackSprint(opts: {
  level: string;
  event: string; // "100m" | "200m" | "400m"
  weeks: number;
  startDate: Date;
}): GeneratedWeek[] {
  const { level, event, weeks, startDate } = opts;
  // This template has maximal sprints and reserved strength slots. An experience
  // label alone cannot establish readiness; do not expose it to novices.
  if (!["amateur", "advanced", "pro"].includes(level)) {
    return Array.from({ length: weeks }, (_, index) => ({
      week: index + 1,
      theme: `${event} — coach assessment required`,
      sessions: [{ sport: "recovery" as const, title: "Sprint baseline and technique review",
        minutes: 0, zone: "z1" as const, type: "recovery",
        description: "No automatic sprint dose prescribed. Review training history, injury status, technique and baseline testing with your coach before starting maximal sprints or loaded plyometrics. This is a review placeholder, not a validated beginner protocol." }],
      totalMinutes: 0,
    }));
  }

  const isShort = event === "100m" || event === "200m";

  // PROTOCOL KNOWLEDGE BASE (97 cited entries: Hart/Smith/Seagrave coach
  // practice + SET reviews + pacing models). The Speed-Endurance day is now
  // built from the database's verbatim sets; every session cites its source.
  const PHASE_MAP = {
    general_prep: "fall",
    specific_prep: "early",
    pre_comp: "mid",
    comp: "taper",
  } as const;
  const sprintSessionFor = (planPhase: keyof typeof PHASE_MAP, variant: number) => {
    try {
      // Lazy require avoided — static import is fine (no cycle: the protocol
      // lib has no dependency on science.ts).
      return buildSprintSession(PHASE_MAP[planPhase] as any, variant);
    } catch {
      return null;
    }
  };
  const describeRows = (sess: ReturnType<typeof buildSprintSession> | null): string => {
    if (!sess) return "";
    const rows = sess.rows
      .map((r) => `• ${r.name} @ ${r.intensity}, rest ${r.restBetweenRepsMin} min [${r.sourceId}]`)
      .join(" ");
    return `10 min jog + drills. ${rows} Rest length is the stimulus: <60 s selects fatigue tolerance, 3-5 min selects quality (PCr resynthesis, Bogdanis 1995). Coach-practice rests — no RCT exists for 200/400 m rest dosing.`;
  };

  const weeksOut: GeneratedWeek[] = [];
  for (let w = 1; w <= weeks; w++) {
    const phase = w <= weeks * 0.3 ? "general_prep" : w <= weeks * 0.6 ? "specific_prep" : w <= weeks - 1 ? "pre_comp" : "comp";
    const sessions: PlanSession[] = [];
    const vol = w <= weeks * 0.7 ? 1.0 : 0.6; // reduce volume in competition phase
    const protoSession = sprintSessionFor(phase, w % 4);

    // Speed Day 1
    if (phase === "general_prep") {
      sessions.push({ sport: "run", title: "Acceleration + Mechanics", minutes: 90, zone: "z5", type: "speed", description: "10 min jog + dynamic drills (leg swings, hip openers, ankle circles ×10 each). A-skips, B-skips 2×20m. 6×20m block starts at 100% effort, rest 2-3 min between reps. 4×20m fly-in at 95% MV, rest 4-6 min. Optional plyometrics require specific movement, experience and tolerance review; no jump dose is prescribed automatically. Cool: 10 min walk + static stretch." });
    } else if (phase === "specific_prep") {
      const protoDesc = describeRows(protoSession);
      sessions.push({ sport: "run", title: "Speed Endurance (Hart / SET protocols)", minutes: 100, zone: "z5", type: "speed", description: protoDesc || (isShort ? "10 min jog + drills. 5×120m at 95% max velocity, rest 8-10 min between reps. Optional plyometrics require specific movement, experience and tolerance review; no jump dose is assigned automatically. Cool: 10 min walk + stretch." : "10 min jog + drills. 3×200m at 90-95% max velocity, rest 12-15 min. Optional plyometrics require specific movement, experience and tolerance review; no jump dose is assigned automatically. Cool: 10 min walk + stretch.") });
    } else if (phase === "pre_comp") {
      const midDesc = describeRows(sprintSessionFor(PHASE_MAP["pre_comp" as keyof typeof PHASE_MAP] as any, w % 4));
      sessions.push({ sport: "run", title: "Race Pace Sharpening", minutes: 80, zone: "z5", type: "speed", description: `10 min jog + drills. ${isShort ? "4×60m at race pace, rest 6-8 min. 2×20m fly at 95-100% MV." : "2×150m at race pace, rest 10 min. 1×80m fly at 95% MV."} ${midDesc} Volume reduced 40% — sharpen, don't fatigue.` });
    } else {
      sessions.push({ sport: "run", title: "Competition Week", minutes: 50, zone: "z5", type: "speed", description: "10 min jog + drills. 3×20m build + 1×40m at 95% MV, full recovery. Race in <7 days." });
    }

    // Preserve the strength slot without assuming explosive-lifting eligibility.
    sessions.push({ sport: "strength", title: phase === "general_prep" ? "Strength: Lower + Core" : phase === "specific_prep" ? "Strength: Power preparation" : "Strength: Maintenance", minutes: 75, zone: "z1", type: "strength", description: "Use familiar coach-reviewed lower-body and trunk movements within the allocated time. Select tolerable loads, repetitions and rest from movement technique and training history. Optional explosive lifting or plyometrics require specific experience and tolerance review; no Olympic-lift or jump dose is assigned automatically." });

    // Speed Day 2: Max Velocity or Speed Endurance
    if (phase !== "comp") {
      if (phase === "general_prep") {
        sessions.push({ sport: "run", title: "Max Velocity Development", minutes: 90, zone: "z5", type: "speed", description: "10 min jog + drills. Fly-in sprints: 4×(20m build + 30m max velocity), rest 4-6 min. Optional plyometrics require specific movement, experience and tolerance review; no jump dose is prescribed automatically. Cool: 10 min walk + stretch." });
      } else if (phase === "specific_prep") {
        if (event === "400m") {
          sessions.push({ sport: "run", title: "Special Endurance I", minutes: 100, zone: "z5", type: "speed", description: "10 min jog + drills. 2×(300m @85% MV, rest 15 min + 150m @95% MV, rest 12 min). Optional plyometrics require specific movement, experience and tolerance review; no jump dose is prescribed automatically. Cool: 10 min walk + stretch." });
        } else {
          sessions.push({ sport: "run", title: "Speed Endurance I", minutes: 100, zone: "z5", type: "speed", description: "10 min jog + drills. 4×150m at 95% MV with 8-10 min rest. Optional plyometrics require specific movement, experience and tolerance review; no jump dose is prescribed automatically. Cool: 10 min walk + stretch." });
        }
      } else {
        sessions.push({ sport: "run", title: "Race Model + Speed", minutes: 90, zone: "z5", type: "speed", description: `10 min jog + drills. ${event === "400m" ? "350m time trial @95% + 2×150m at race pace" : "3×120m at race pace + 2×60m fly at 100% MV"}. Volume reduced 40% — sharpen, don't fatigue.` });
      }
    }

    // Tempo Day
    sessions.push({ sport: "run", title: "Tempo + Core", minutes: 45, zone: "z2", type: "tempo", description: "10 min jog. " + Math.floor(weeks * 0.3) + " × 100m @70% MV with 45s rest (extensive tempo — should feel conversational). Core: 3×(30s plank + 20 side plank/side + 10 dead bugs). Cool: 5 min walk + stretch." });

    // Strength Day 2: reviewed power preparation
    if (phase !== "comp") {
      sessions.push({ sport: "strength", title: "Strength: Power preparation — review first", minutes: 60, zone: "z3", type: "plyo", description: "Power preparation: use familiar coach-reviewed strength movements and full recovery within this allocated time. Optional explosive lifts or plyometrics require specific movement, experience, equipment and tolerance review. No automatic Olympic-lift or jump dose is prescribed." });
    }

    // Rest Day
    sessions.push({ sport: "recovery", title: "Rest + Recovery", minutes: 20, zone: "z1", type: "recovery", description: "Complete rest or 20 min easy walk + breathing (extended exhale 2:1). CNS recovery is when speed adaptations consolidate." });

    weeksOut.push({
      week: w,
      theme: event + " " + phase.replace("_", " ") + " — week " + w,
      sessions,
      totalMinutes: sessions.reduce((a, s) => a + s.minutes, 0),
    });
  }
  return weeksOut;
}

// ---- Single-sport plan generator (cycling / swimming / running / lifting-only) ----
// Same 6-week progression wave as the race plans: base→build→peak→taper,
// ~6-8% weekly overload, test weeks re-anchor zones. Non-racers get the same
// wave without the taper (steady cycle restarts every 6 weeks).
export function generateSingleSport(opts: {
  sport: "bike" | "swim" | "run" | "strength";
  level: string;
  weeks: number;
  startDate: Date;
  weeklyHours?: number;
  hasRace?: boolean;
}): GeneratedWeek[] {
  const { sport, level, weeks, startDate, weeklyHours, hasRace } = opts;
  const baseWeekly = weeklyHours ?? (level === "advanced" ? 10 : level === "amateur" ? 7 : level === "beginner" ? 4 : 12);
  const phase = (w: number): "base" | "build" | "peak" | "taper" => {
    const inBlock = (w - 1) % 6;
    return inBlock === 5 ? "taper" : inBlock <= 1 ? "base" : inBlock <= 3 ? "build" : "peak"; // week 6 = baseline test taper even without a race
  };

  const weeksOut: GeneratedWeek[] = [];
  for (let w = 1; w <= weeks; w++) {
    const ph = phase(w);
    const vol = mesoVolume(w - 1, level).vol;

    const totalMin = Math.round(baseWeekly * 60 * vol);
    const sessions: PlanSession[] = [];

    if (sport === "bike") {
      sessions.push({ sport: "bike", title: "Endurance Ride (Z2)", minutes: Math.round(totalMin * 0.35), zone: "z2", type: "endurance", description: "Comfortable aerobic cycling within the available time. Use a comfortable cadence and current effort; research does not prescribe the same intensity split to every rider." });
      sessions.push({ sport: "bike", title: "Sweet Spot Intervals", minutes: Math.round(totalMin * 0.25), zone: "z3", type: "interval", description: "Legacy sweet-spot coaching example: 3×12 min at 88–94% FTP with 6 min easy between. This exact dose is not established as optimal; use a reviewed cycling anchor and duration-matched steps." });
      sessions.push({ sport: "bike", title: ph === "base" ? "Easy Aerobic Session" : "VO2max Intervals", minutes: Math.round(totalMin * 0.15), zone: ph === "base" ? "z2" : "z5", type: ph === "base" ? "endurance" : "interval", description: ph === "base" ? "Endurance spin, keep it easy today." : "Legacy cycling interval example: 5×4 min at 106–120% FTP with 4 min easy. This is a coaching template, not a dose validated by a running trial; current cycling anchors, recovery and available time determine the executable session." });
      sessions.push({ sport: "strength", title: "Cyclist Strength", minutes: Math.round(totalMin * 0.15), zone: "z1", type: "strength", description: "Familiar squat, hip-hinge and single-leg exercises at reviewed loads and repetitions within the session budget. Plyometrics are optional after movement and injury review; progress using recorded tolerance." });
      sessions.push({ sport: "mobility", title: "Recovery Spin + Hip Mobility", minutes: Math.round(totalMin * 0.1), zone: "z1", type: "recovery", description: "Ultra-light spin + hip flexor/hamstring flow. Keep effort light; cycling still contributes training load." });
    } else if (sport === "swim") {
      sessions.push({ sport: "swim", title: "Technique + Aerobic Swim", minutes: Math.round(totalMin * 0.3), zone: "z2", type: "endurance", description: "Drills (catch-up, fingertip drag) then steady swims. Technique first — speed follows form." });
      sessions.push({ sport: "swim", title: "Threshold Swim Set", minutes: Math.round(totalMin * 0.25), zone: "z4", type: "interval", description: "CSS-based swimming practice requires a recent, same-stroke and same-pool field estimate. CSS is not a directly measured lactate threshold; use reviewed repetitions and recovery that fit the session." });
      sessions.push({ sport: "swim", title: ph === "base" ? "Easy Aerobic Session" : "Reviewed short swim efforts", minutes: Math.round(totalMin * 0.15), zone: ph === "base" ? "z2" : "z5", type: ph === "base" ? "endurance" : "interval", description: ph === "base" ? "Easy pull buoy set instead today." : "Short, repeatable swimming efforts with reviewed recovery and safe technique. More maximal swimming is not proven better for every swimmer." });
      sessions.push({ sport: "strength", title: "Swimmer Strength", minutes: Math.round(totalMin * 0.2), zone: "z1", type: "strength", description: "Reviewed pulling and shoulder-strength exercises within the session budget. Choose loads and repetitions for current ability; explosive exercises are optional after movement and injury review." });
      sessions.push({ sport: "mobility", title: "Ankle & Shoulder Mobility", minutes: Math.round(totalMin * 0.1), zone: "z1", type: "recovery", description: "Ankle flexibility = better kick; thoracic mobility = longer catch." });
    } else if (sport === "run") {
      sessions.push({ sport: "run", title: "Long Aerobic Run (Z2)", minutes: Math.round(totalMin * 0.35), zone: "z2", type: "endurance", description: "Steady conversational running. Review recent load, recovery and available time before progressing; a fixed weekly percentage does not establish safe progression." });
      sessions.push({ sport: "run", title: "Tempo / Threshold Run", minutes: Math.round(totalMin * 0.25), zone: "z4", type: "threshold", description: "Legacy controlled-running example: 20–30 min using a reviewed running threshold-pace anchor. This workout does not by itself predict half-marathon or marathon performance; fit work and recovery to available time." });
      sessions.push({ sport: "run", title: ph === "base" ? "Easy Aerobic Session" : "VO2max Intervals", minutes: Math.round(totalMin * 0.15), zone: ph === "base" ? "z2" : "z5", type: ph === "base" ? "endurance" : "interval", description: ph === "base" ? "Easy conversational running within the allocated time." : "6×800m or 5×1000m @ ~5k pace, equal-time jog recovery. Raise the ceiling." });
      sessions.push({ sport: "strength", title: "Runner Strength", minutes: Math.round(totalMin * 0.15), zone: "z1", type: "strength", description: "Reviewed single-leg strength, calf and hip exercises within the session budget. Plyometrics are optional after movement and injury review; strength work does not guarantee injury prevention." });
      sessions.push({ sport: "mobility", title: "Recovery Run + Mobility", minutes: Math.round(totalMin * 0.1), zone: "z1", type: "recovery", description: "Optional easy shakeout plus hip/ankle mobility. Running still adds impact and training load; use non-impact mobility when a recovery run is inappropriate." });
    } else {
      // lifting-only — progressive overload is the plan
      sessions.push({ sport: "strength", title: "Lower Body Heavy", minutes: Math.round(totalMin * 0.3), zone: "z1", type: "strength", description: "Familiar squat, hinge and lunge patterns at reviewed loads and repetitions within the session budget. Log effort, technique and symptoms before progressing; no automatic weekly weight increase. Plyometrics require a separate movement and injury review." });
      sessions.push({ sport: "strength", title: "Upper Body Heavy", minutes: Math.round(totalMin * 0.25), zone: "z1", type: "strength", description: "Bench 4×5, rows 4×8, overhead press 3×8. Log every set — beat the logbook." });
      sessions.push({ sport: "strength", title: "Full Body Volume", minutes: Math.round(totalMin * 0.25), zone: "z1", type: "strength", description: "Familiar resistance exercises at reviewed sets, repetitions and loads that fit the available time. Track effort and technique; no single repetition scheme is optimal for every athlete." });
      sessions.push({ sport: "mobility", title: "Mobility + Core", minutes: Math.round(totalMin * 0.2), zone: "z1", type: "recovery", description: "Hips, shoulders, spine + anti-rotation core. Mobility is what lets you keep loading heavy." });
    }

    weeksOut.push({ week: w, theme: ph === "taper" ? "Freshness & Sharpening" : ph === "peak" ? "Peak Intensity" : ph === "build" ? "Build: Raise the Ceiling" : "Base: Aerobic Foundation", sessions: sessions.map((x) => capSessionMinutes(x, totalMin, opts.sport === "run" ? "half" : undefined)), totalMinutes: sessions.map((x) => capSessionMinutes(x, totalMin, opts.sport === "run" ? "half" : undefined)).reduce((a, x) => a + x.minutes, 0) });
  }
  return weeksOut;
}



// ---- Track sprint plan generator (100m/200m/400m) ----
// Returns GeneratedWeek[] so the plan generator route can use it directly.

export { BLOOD_REFERENCE, DNA_TRAITS, NUTRITION_GUIDELINES, MOTIVATION_LIBRARY, dailyMotivation } from "./reference";
