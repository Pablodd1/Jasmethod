// JasMiamiMethod — Sports Science Engine
// Evidence-based training physiology per post-2000 research literature.
//
// Key references baked into the model:
// - Seiler & Tønnessen 2009: polarized training intensity distribution (~80/20)
//   for endurance athletes (Int J Sports Physiol Perform 4:417-429).
// - Billat et al. 1999/2001: vVO2max and time-to-exhaustion at vVO2max
//   (Med Sci Sports Exerc 31:1206-1211; Eur J Appl Physiol 85:299-305).
// - Allen & Coggan (Training and Racing with a Power Meter): TSS, FTP, NP.
// - Joe Friel (Triathlete's Training Bible): 7-zone HR model anchored on LTHR.
// - Buchheit 2014: HRV-guided training (Front Physiol 5:73).
// - Foster 1998: session RPE (TRIMP alternative), J Strength Cond Res 12:109-115.
// - Skiba & Fukuda: W' balance, critical power modeling.
// - Tanaka, Monahan & Seals 2001: age-predicted HRmax accuracy.
// - Bouchard et al. 2011: HERITAGE — VO2max trainability, genomic predictors.

export type Sport = "swim" | "bike" | "run" | "strength" | "mobility" | "recovery" | "brick" | "hyrox";
export type ZoneKey = "z1" | "z2" | "z3" | "z4" | "z5" | "z6" | "z7";

export interface Zone {
  key: ZoneKey;
  name: string;
  pctLow: number; // % of anchor
  pctHigh: number;
  description: string;
}

// ---- Heart rate zones anchored on Lactate Threshold HR (Friel 7-zone model) ----
// Z1 (active recovery)  <81% LTHR; Z2 (aerobic endurance) 81-89%; Z3 (tempo) 90-93%;
// Z4 (sub-LT) 94-99%; Z5 (LT) 100-102%; Z6 (VO2max) 103-106%; Z7 (anaerobic) >106%.
export const HR_ZONES: Zone[] = [
  { key: "z1", name: "Active Recovery", pctLow: 0.5, pctHigh: 0.8, description: "Very easy spinning/jogging, conversational pace. Flush lactate, promote blood flow." },
  { key: "z2", name: "Aerobic Endurance", pctLow: 0.81, pctHigh: 0.89, description: "The engine builder. 80% of training lives here (Seiler 2009)." },
  { key: "z3", name: "Tempo", pctLow: 0.9, pctHigh: 0.93, description: "Comfortably hard. 'Sweet spot' for time-crunched amateurs." },
  { key: "z4", name: "Sub-Lactate Threshold", pctLow: 0.94, pctHigh: 0.99, description: "Sustained effort just below LT. Race-pace work for half/full." },
  { key: "z5", name: "Lactate Threshold", pctLow: 1.0, pctHigh: 1.02, description: "The critical intensity. Elevates LT over time." },
  { key: "z6", name: "VO2max", pctLow: 1.03, pctHigh: 1.06, description: "3-5 min hard efforts. Raises the ceiling (Billat 2001)." },
  { key: "z7", name: "Anaerobic Capacity", pctLow: 1.06, pctHigh: 1.15, description: "Max efforts 30s-2min. Neuromuscular power." },
];

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

export interface ZoneTable {
  hr?: Record<ZoneKey, { low: number; high: number }>;
  power?: Record<ZoneKey, { low: number; high: number }>;
  pace?: Record<ZoneKey, { low: number; high: number }>;
  anchorHr: number;
  anchorPower?: number;
  anchorPace?: number; // sec per unit
}

export function buildZoneTable(opts: {
  lthr: number;
  ftp?: number;
  thresholdPaceSecPerKm?: number; // run
  thresholdPaceSecPer100m?: number; // swim
}): ZoneTable {
  const { lthr, ftp, thresholdPaceSecPerKm, thresholdPaceSecPer100m } = opts;
  const hr: Record<ZoneKey, { low: number; high: number }> = {} as any;
  for (const z of HR_ZONES) {
    hr[z.key] = {
      low: Math.round(lthr * z.pctLow),
      high: Math.round(lthr * z.pctHigh),
    };
  }
  let power: Record<ZoneKey, { low: number; high: number }> | undefined;
  if (ftp) {
    power = {} as Record<ZoneKey, { low: number; high: number }>;
    for (const z of POWER_ZONES) {
      power[z.key] = {
        low: Math.round(ftp * z.pctLow),
        high: Math.round(ftp * z.pctHigh),
      };
    }
  }
  const paceAnchor = thresholdPaceSecPerKm ?? (thresholdPaceSecPer100m ? thresholdPaceSecPer100m : undefined);
  let pace: Record<ZoneKey, { low: number; high: number }> | undefined;
  if (paceAnchor) {
    pace = {} as Record<ZoneKey, { low: number; high: number }>;
    // pace zones: higher % = faster (lower seconds)
    for (const z of PACE_ZONES) {
      pace[z.key] = {
        high: Math.round(paceAnchor / z.pctLow),
        low: Math.round(paceAnchor / z.pctHigh),
      };
    }
  }
  return {
    hr,
    power,
    pace,
    anchorHr: lthr,
    anchorPower: ftp,
    anchorPace: paceAnchor,
  };
}

// ---- Session RPE load (Foster 1998) ----
export function sRPE(rpe: number, minutes: number): number {
  return rpe * minutes;
}

// ---- TSS (Coggan) ----
export function tssFromPower(normalizedPower: number, ftp: number, durationSec: number): number {
  if (!ftp || ftp <= 0) return 0;
  const IF = normalizedPower / ftp;
  const hours = durationSec / 3600;
  return Math.round((durationSec * normalizedPower * IF) / (ftp * 3600) * 100 * 100) / 100;
}

export function tssFromHr(normalizedHr: number, lthr: number, durationSec: number, sex: "male" | "female" = "male"): number {
  // TSS-like HR-based load using TRIMP-style exponential weighting (Banister)
  const ratio = normalizedHr / lthr;
  const y = sex === "male" ? 0.64 : 0.86; // Banister TRIMP constants
  const trimp = durationSec / 60 * ratio * 0.64 * Math.exp(y * ratio);
  return Math.round(trimp * 10) / 10;
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
  score: number; // 0-100
  advice: string;
  deltaPct: number;
} {
  const avg = baseline7d.reduce((a, b) => a + b, 0) / baseline7d.length;
  const deltaPct = ((hrvToday - avg) / avg) * 100;
  const z = sd > 0 ? (hrvToday - avg) / sd : 0;
  let score = 50;
  let advice = "HRV within normal range — proceed with planned session.";
  if (z >= 1) {
    score = 85;
    advice = "HRV elevated vs baseline — recovery is ahead of schedule. Consider a slightly harder session or enjoy the surplus.";
  } else if (z >= 0.5) {
    score = 70;
    advice = "HRV slightly elevated — good day to train. Push the key session.";
  } else if (z <= -1) {
    score = 25;
    advice = "HRV suppressed beyond 1 SD — body is not recovered. Swap the key session for Z1/Z2 or rest. High risk of overreaching (Plews 2013).";
  } else if (z <= -0.5) {
    score = 40;
    advice = "HRV trending down — keep the session easy and prioritize sleep tonight.";
  }
  return { score, advice, deltaPct: Math.round(deltaPct * 10) / 10 };
}

// ---- Training intensity distribution target (Seiler 2009 / Stöggl 2016) ----
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
}): GeneratedWeek[] {
  const { level, distance, weeks, startDate, weeklyHours, easyPct } = opts;
  const splitTarget = easyPct ?? 70; // 70/30 default, manual-adjustable
  const baseWeekly = weeklyHours ?? (level === "pro" ? 20 : level === "advanced" ? 14 : level === "amateur" ? 10 : 6);
  // Distance multipliers for weekly hours
  const distFactor: Record<string, number> = { sprint: 0.6, olympic: 0.8, half: 1.0, full: 1.3 };
  const targetHours = baseWeekly * (distFactor[distance] ?? 1);
  const phase = (w: number): "base" | "build" | "peak" | "taper" => {
    const pct = w / weeks;
    if (pct <= 0.5) return "base";
    if (pct <= 0.8) return "build";
    if (pct <= 0.92) return "peak";
    return "taper";
  };
  const phaseTheme: Record<string, string> = {
    base: "Aerobic Foundation",
    build: "Threshold & Speed",
    peak: "Race Simulation",
    taper: "Freshness & Taper",
  };

  const weeksOut: GeneratedWeek[] = [];
  for (let w = 1; w <= weeks; w++) {
    const ph = phase(w);
    // Volume curve: build up through base, level in build, drop in peak, sharp taper
    let volumeFactor = 1;
    if (ph === "base") volumeFactor = 0.8 + 0.4 * (w / (weeks * 0.5)); // 0.8 → 1.2
    else if (ph === "build") volumeFactor = 1.2 + 0.1 * ((w - weeks * 0.5) / (weeks * 0.3)); // 1.2 → 1.3
    else if (ph === "peak") volumeFactor = 0.9;
    else volumeFactor = 0.55; // taper week ~45% volume drop

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
    if (ph === "base") {
      sessions.push({ sport: "swim", title: "Swim: Endurance & Technique", minutes: swimMin, zone: "z2", type: "endurance", description: "Continuous swim with 4×50m technique drills. Focus on body position and breathing. Swim as one of the most technical sports — drill quality over speed." });
    } else if (ph === "build") {
      sessions.push({ sport: "swim", title: "Swim: Threshold Set", minutes: swimMin, zone: "z4", type: "threshold", description: "Warm-up 400m, then 8×100m at T-pace with 20s rest, cool-down 200m. Or 4×200m at threshold (Friel swim zone 4)." });
    } else if (ph === "peak") {
      sessions.push({ sport: "swim", title: "Swim: Race Pace + Open Water", minutes: swimMin, zone: "z4", type: "interval", description: "Simulate race start: 200m hard, 6×100m at race pace, sighting drills every 4th stroke. Open-water practice if possible — sighting and drafting are race-specific skills." });
    } else {
      sessions.push({ sport: "swim", title: "Swim: Sharpening", minutes: Math.round(swimMin * 0.6), zone: "z4", type: "interval", description: "Short and sharp: 200m w/u, 6×50m fast with 30s rest, 200m c/d. Keep the nervous system primed without fatigue." });
    }

    // ---- BIKE ----
    const bikeSessions = level === "pro" ? 4 : level === "advanced" ? 3 : level === "amateur" ? 3 : 2;
    for (let i = 0; i < bikeSessions; i++) {
      const part = Math.round(bikeMin / bikeSessions);
      if (ph === "base") {
        sessions.push({ sport: "bike", title: i === 0 ? "Bike: Long Endurance" : "Bike: Aerobic Spin", minutes: i === 0 ? part + 15 : part, zone: "z2", type: "endurance", description: i === 0 ? `Long ride in Z2 (81-89% LTHR). Nutrition practice: 60-90g carbs/hour. This is the session that builds the aerobic engine (Seiler 2009).` : `Steady Z2 spin. Keep cadence 85-95 rpm. Optional: 3×10 min at Z3 at the end if feeling fresh.` });
      } else if (ph === "build") {
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
      } else if (ph === "peak") {
        sessions.push({ sport: "bike", title: i === 0 ? "Bike: Race Simulation" : "Bike: Race Pace Intervals", minutes: part, zone: i === 0 ? "z4" : "z3", type: "interval", description: i === 0 ? `Simulate race day: long ride with race-pace blocks, including climbs at Z4 and flats at Z3. Practice aero position and nutrition.` : `Race pace work: 4×8 min at Z4 with 4 min Z1 between.` });
      } else {
        sessions.push({ sport: "bike", title: "Bike: Taper Spin", minutes: Math.round(part * 0.5), zone: "z2", type: "recovery", description: "Short, easy spins. 3-4 accelerations of 1 min at Z4 to keep legs fresh, then easy. Less is more." });
      }
    }

    // ---- RUN ----
    const runSessions = level === "pro" ? 4 : level === "advanced" ? 3 : level === "amateur" ? 2 : 2;
    for (let i = 0; i < runSessions; i++) {
      const part = Math.round(runMin / runSessions);
      if (ph === "base") {
        sessions.push({ sport: "run", title: i === 0 ? "Run: Long Aerobic" : "Run: Easy + Strides", minutes: i === 0 ? part + 10 : part, zone: "z2", type: "endurance", description: i === 0 ? `Long run in Z2. Heart rate capped at 89% LTHR. Run slow to run fast — 80% of weekly volume should be easy (Stöggl 2016).` : `Easy Z2 run finishing with 6×20s strides at Z5 to maintain leg speed without fatigue.` });
      } else if (ph === "build") {
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
      } else if (ph === "peak") {
        sessions.push({ sport: "run", title: i === 0 ? "Run: Race Pace" : "Run: Cruise Intervals", minutes: part, zone: i === 0 ? "z4" : "z3", type: "interval", description: i === 0 ? `Race pace simulation: 4×10 min at target race pace with 3 min easy. Practice fueling — gels at race intervals.` : `Comfortably hard cruise intervals at 90-93% LTHR.` });
      } else {
        sessions.push({ sport: "run", title: "Run: Taper Jog", minutes: Math.round(part * 0.5), zone: "z2", type: "recovery", description: "Easy 20-30 min jog with 4×20s strides. Legs stay sharp, fatigue stays low." });
      }
    }

    // ---- STRENGTH ----
    if (strengthMin >= 30) {
      const phaseFocus = ph === "base"
        ? "Strength: Foundation — heavy compound lifts (squat, deadlift, bench, row) 3×5-8. Post-2000 evidence: strength training improves running economy and time-trial performance (Rønnestad & Mujika 2014, Scand J Med Sci Sports)."
        : ph === "build"
          ? "Strength: Power — add Olympic lifts / plyometrics (jumps, throws) 3×5. Converts strength into speed (Rønnestad 2014)."
          : "Strength: Maintenance — light, explosive. 2×8 with moderate load. Stop heavy lifting 7-10 days pre-race.";
      sessions.push({ sport: "strength", title: ph === "taper" ? "Strength: Maintenance" : `Strength: ${ph === "base" ? "Foundation" : ph === "build" ? "Power" : "Maintenance"}`, minutes: strengthMin, zone: "z1", type: "strength", description: phaseFocus });
    }

    // ---- BRICK (bike→run) ----
    if (ph === "build" || ph === "peak") {
      sessions.push({ sport: "brick", title: "Brick: Bike → Run", minutes: 75, zone: "z3", type: "brick", description: "60 min ride (last 20 at race effort) + 15 min run off the bike at race pace. The legs learn to run tired — this is where triathlon is won. Do this weekly in build, twice in peak." });
    }

    // ---- RECOVERY ----
    sessions.push({ sport: "recovery", title: "Recovery: Active Recovery + Mobility", minutes: 30, zone: "z1", type: "recovery", description: "Easy Z1 spin/walk/row. 15 min mobility work (hips, ankles, T-spine). Sleep is the #1 recovery tool — target 8h, prioritize early bedtime." });

    // Enforce the user's easy/quality split in base + build (peak/taper keep
    // race-specific + fresh work as designed — converting those would be wrong).
    const finalSessions = ph === "base" || ph === "build" ? enforceSplit(sessions, splitTarget) : sessions;

    weeksOut.push({
      week: w,
      theme: phaseTheme[ph],
      sessions: finalSessions,
      totalMinutes: totalMin,
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

const EASY_TITLE: Record<string, string> = {
  "Bike: Threshold Intervals": "Bike: Easy Aerobic",
  "Bike: Tempo": "Bike: Easy Aerobic",
  "Bike: VO2max Intervals": "Bike: Easy Aerobic",
  "Bike: Race Simulation": "Bike: Easy Aerobic",
  "Bike: Race Pace Intervals": "Bike: Easy Aerobic",
  "Run: Track Intervals": "Run: Easy Aerobic",
  "Run: Tempo": "Run: Easy Aerobic",
  "Run: Hill Repeats": "Run: Easy Aerobic",
  "Run: Race Pace": "Run: Easy Aerobic",
  "Run: Cruise Intervals": "Run: Easy Aerobic",
  "Swim: Threshold Set": "Swim: Easy Aerobic",
  "Swim: Race Pace + Open Water": "Swim: Easy Aerobic",
  "Swim: Sharpening": "Swim: Easy Aerobic",
};

const QUALITY_TITLE: Record<string, string> = {
  "Bike: Long Endurance": "Bike: Tempo",
  "Bike: Aerobic Spin": "Bike: Tempo",
  "Run: Long Aerobic": "Run: Tempo",
  "Run: Easy + Strides": "Run: Tempo",
  "Swim: Endurance & Technique": "Swim: Tempo Set",
};

export function enforceSplit(sessions: PlanSession[], easyPct: number): PlanSession[] {
  const target = Math.max(45, Math.min(90, easyPct));
  const work = sessions.map((s) => ({ ...s }));
  const isEasy = (s: PlanSession) => s.zone === "z1" || s.zone === "z2";
  for (let i = 0; i < 12; i++) {
    const E = work.filter(isEasy).reduce((a, s) => a + s.minutes, 0);
    const T = work.reduce((a, s) => a + s.minutes, 0) || 1;
    const cur = (E / T) * 100;
    if (Math.abs(cur - target) <= 3) break;
    // Best single flip: solve the new minutes so (easy)/(total) lands on target.
    let bestIdx = -1, bestM2 = 0, bestDist = Infinity, bestDir: "promote" | "demote" | null = null;
    work.forEach((s, idx) => {
      if (isEasy(s) && s.zone === "z2" && s.type === "endurance") {
        const m2 = Math.max(10, Math.min(s.minutes * 1.5, Math.round((100 * E - target * T + target * s.minutes) / (100 + target))));
        const dist = Math.abs(((E - m2) / (T - s.minutes + m2)) * 100 - target);
        if (dist < bestDist) { bestDist = dist; bestIdx = idx; bestM2 = m2; bestDir = "promote"; }
      } else if (!isEasy(s) && s.sport !== "brick" && s.type !== "brick") {
        const m2 = Math.max(10, Math.min(s.minutes * 1.5, Math.round((target * T - target * s.minutes - 100 * E) / (100 - target))));
        const dist = Math.abs(((E + m2) / (T - s.minutes + m2)) * 100 - target);
        if (dist < bestDist) { bestDist = dist; bestIdx = idx; bestM2 = m2; bestDir = "demote"; }
      }
    });
    if (bestIdx < 0 || !bestDir || bestM2 === work[bestIdx].minutes) break;
    const s = work[bestIdx];
    work[bestIdx] = bestDir === "promote"
      ? { ...s, minutes: bestM2, zone: "z3", type: "tempo", title: QUALITY_TITLE[s.title] || s.title, description: `${s.description} Auto-promoted (${bestM2} min) to hit your ${target}% easy / ${100 - target}% quality split.` }
      : { ...s, minutes: bestM2, zone: "z2", type: "endurance", title: EASY_TITLE[s.title] || s.title, description: `${s.description} Auto-demoted (${bestM2} min) to hit your ${target}% easy / ${100 - target}% quality split.` };
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
  z1: "Z1 active recovery (<81% LTHR — very easy, conversational)",
  z2: "Z2 aerobic (81-89% LTHR — easy, nose-breathing pace)",
  z3: "Z3 tempo (90-93% LTHR — comfortably hard)",
  z4: "Z4 threshold (94-99% LTHR — sustained, 'race-effort' hard)",
  z5: "Z5 lactate threshold (100-102% LTHR)",
  z6: "Z6 VO2max (103-106% LTHR — 3-5 min hard reps)",
  z7: "Z7 anaerobic (>106% LTHR — 30s-2min max efforts)",
};

function mainTemplate(sport: string, type: string, zone: string, minutes: number): string {
  const z = ZONE_LABEL[zone] || ZONE_LABEL.z2;
  const work = Math.max(15, minutes - 25); // minus WU/CD
  if (sport === "swim") {
    if (type === "interval") return `Main: ${Math.round(work / 6)}×100m fast (${z}) with 20s rest after each. Count strokes — fewer strokes per lap = more efficient. Finish each rep with 5m strong off the wall.`;
    if (type === "threshold") return `Main: 4-8×100m at T-pace (${z}) with 20s rest, or 4×200m with 30s rest. Hold pace — the clock doesn't lie. If pace drops >3s/100m, stop the set.`;
    return `Main: ${Math.round(work / 15)}×(150m easy + 50m technique drill: catch-up, fingertip drag, 3-3-3 breathing). Steady ${z}. Total focus: body position high, hips up, long stroke.`;
  }
  if (sport === "bike") {
    if (type === "interval") return `Main: 5×3 min at ${z} with 3 min easy spin between. Seated, cadence 90+. Each rep should feel like a hard but repeatable climb. ${Math.round(work)} min total work.`;
    if (type === "threshold") return `Main: 3×10 min at ${z} (or 91-105% FTP) with 5 min easy between. This is THE session — hold power steady, don't surge the first rep. Aero position on the intervals.`;
    if (type === "tempo") return `Main: 2×20 min at ${z} with 8 min easy between. Steady effort, cadence 85-95. Eat/drink during this session — it's race-practice for the gut too.`;
    return `Main: ${Math.round(work)} min steady ${z}. Cadence 85-95 rpm. Fuel 60-90g carbs/hour if over 90 min (Jeukendrup 2014). This ride builds your aerobic engine.`;
  }
  if (sport === "run") {
    if (type === "interval") return `Main: 6×800m at vVO2max (${z}) — roughly 3-5s/400m faster than 5k pace — with 400m jog recovery (Billat 2001). ${Math.round(work)} min of work. Stop the set if pace drops or form breaks.`;
    if (type === "threshold") return `Main: 3×10 min at T-pace (${z}) with 3 min easy jog between. Threshold pace = what you could race for 1 hour. Controlled discomfort — 7/10 effort.`;
    if (type === "tempo") return `Main: 20-30 min continuous at ${z} (marathon-effort). Relax the shoulders, quick feet, breathe on a 3-3 rhythm.`;
    return `Main: ${Math.round(work)} min easy ${z}. Cap HR at 89% LTHR. Conversational — if you can't talk, slow down. This is where the engine is built (Seiler: 80% of volume lives here).`;
  }
  if (sport === "strength") {
    return `Main: 3-5 sets of 5-8 reps, compound lifts — back squat, deadlift, bench/row (Rønnestad 2014: heavy strength improves endurance economy). 2-3 min rest between sets. Bar speed intentional on every rep; leave 2 reps in reserve.`;
  }
  if (sport === "brick") {
    return `Main: 60 min ride with the last 20 min at race effort, then IMMEDIATELY off the bike into a 15 min run at target race pace. The first 400m on foot will feel like running on stilts — that's exactly the skill you're training.`;
  }
  if (sport === "recovery") {
    return `Main: ${Math.round(work)} min anything-goes at ${z} — walk, easy spin, swim, stretch, yoga. The goal is blood flow, NOT fitness. If your breathing is labored, you're going too hard.`;
  }
  return `Main: ${Math.round(work)} min at ${z}.`;
}

const WU_TEMPLATES: Record<string, string> = {
  swim: "200-400m easy swim + 4×50m technique drills (body position, breathing, catch). Keep HR in Z1-Z2.",
  bike: "15 min easy spin (Z1-Z2), cadence 85-95 rpm, then 3×1 min at Z3 openers with 1 min easy between.",
  run: "10 min easy jog (Z1-Z2) + dynamic drills: 4×20s high knees, butt kicks, leg swings, 2×20m strides.",
  strength: "5 min light cardio (bike/row) + dynamic warm-up: leg swings, arm circles, 10 bodyweight squats, 10 push-ups.",
  brick: "15 min easy spin (Z1-Z2), then practice a quick transition: shoes off, 2×1 min run off the bike.",
  recovery: "2 min easy — this is a recovery day; just get moving.",
};

const CD_TEMPLATES: Record<string, string> = {
  swim: "200m easy swim + 5 min mobility (shoulders, hips, ankles).",
  bike: "10 min easy spin (Z1) + 5 min light stretching (quads, hips, hamstrings).",
  run: "10 min easy jog (Z1) + 5 min mobility (hips, calves, T-spine).",
  strength: "5 min light cardio + 10 min static stretching of the trained muscle groups.",
  brick: "10 min easy jog + 5 min mobility. Legs will feel heavy — that's the adaptation.",
  recovery: "Done — that was the workout.",
};

const STUDY_BY_TYPE: Record<string, string> = {
  interval: "Billat et al. 2001 — vVO2max interval prescription (Med Sci Sports Exerc 33:1597-1602)",
  threshold: "Friel 7-zone LT model (Triathlete's Training Bible); Seiler & Tønnessen 2009, Int J Sports Physiol Perform 4:417-429",
  tempo: "Seiler & Tønnessen 2009 — polarized distribution (Int J Sports Physiol Perform 4:417-429)",
  endurance: "Seiler & Tønnessen 2009 — 80/20 polarized model (Int J Sports Physiol Perform 4:417-429)",
  strength: "Rønnestad & Mujika 2014 — strength improves endurance economy (Scand J Med Sci Sports)",
  brick: "Friel — transition practice (The Triathlete's Training Bible)",
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
  const breathing = recoveryNote || "Cool-down: 2-5 min breathing — box (4-4-4-4), physiological sigh, or 4-7-8.";
  const study = STUDY_BY_TYPE[s.type] || STUDY_BY_TYPE.endurance;
  return { wu, main, cd, breathing, study };
}

// ---- Daily motivation engine ----
// Combines science-grounded coaching cues with psychology research
// (self-determination theory — Ryan & Deci 2000; implementation intentions — Gollwitzer 1999).
export const MOTIVATION_LIBRARY: { quote: string; science: string; coach: string }[] = [
  { quote: "The body achieves what the mind believes.", science: "Self-efficacy is one of the strongest predictors of endurance performance (Hagger et al. 2001).", coach: "Today is a brick in the wall. Lay it well." },
  { quote: "Discipline is choosing what you want most over what you want now.", science: "Delay of gratification and habit automation are trainable (Gollwitzer 1999 implementation intentions).", coach: "Set your gear out tonight. Remove the choice, remove the friction." },
  { quote: "You don't rise to the level of your goals. You fall to the level of your systems.", science: "Consistency of training load beats heroic single sessions — CTL is built daily (Coggan).", coach: "One session today beats two tomorrow. Go." },
  { quote: "Pain is temporary. Quitting lasts forever.", science: "Perceived exertion is modulated by mindset — reframing effort as a positive signal improves performance (Crum & Langer 2007).", coach: "When it hurts in Z4, tell yourself: this is exactly where the adaptation happens." },
  { quote: "The miracle isn't that I finished. It's that I had the courage to start.", science: "Behavioral activation — starting is the hardest part; once moving, commitment rises (Lewin's task-initiation research).", coach: "Warm-up is the hardest 10 minutes. Get them done and the rest flows." },
  { quote: "Champions are made in the hours others spend sleeping.", science: "Sleep is when training adaptations consolidate — growth hormone, tissue repair, memory of motor patterns (Fullagar 2015, Sports Med).", coach: "Actually — champions ARE made in sleep. 8 hours is a training session. Guard it." },
  { quote: "Run when you can, walk if you must, crawl if you have to; just never give up.", science: "Pacing flexibility preserves performance when conditions change (Abbiss & Laursen 2008).", coach: "Bad day? Cut the pace, keep the time. Load is load." },
  { quote: "What you do every day matters more than what you do once in a while.", science: "Aerobic base requires chronic stimulus — 12+ weeks of consistent Z2 (Seiler 2009).", coach: "The long game is the only game. Today's easy session IS the adaptation." },
  { quote: "Sweat is fat crying.", science: "Well — sweat is thermoregulation, but the sentiment stands: hard work signals adaptation (ACSM 2021).", coach: "Hydrate. Electrolytes. Now. Then train." },
  { quote: "It never gets easier, you just get faster.", science: "As fitness improves, the same RPE yields higher absolute output — this is the hallmark of adaptation (Foster 1998).", coach: "If today's Z2 feels easier than last month, raise the bar — that's progress." },
];

export function dailyMotivation(dayIndex: number, style: string = "coach"): { quote: string; message: string } {
  const item = MOTIVATION_LIBRARY[dayIndex % MOTIVATION_LIBRARY.length];
  if (style === "science") return { quote: item.quote, message: item.science };
  if (style === "tough") return { quote: item.quote, message: `No excuses. ${item.coach}` };
  if (style === "gentle") return { quote: item.quote, message: `You've got this. ${item.coach}` };
  return { quote: item.quote, message: item.coach };
}

// ---- Blood panel reference ranges (post-2000 clinical + sports medicine) ----
// Sources: Brutsaert et al. 2003 (iron & endurance), Peeling et al. 2008 (females),
// Ross et al. 2016 (hemoglobin & VO2max), Holick 2007 (vitamin D), and
// standard clinical ranges (Mayo Clinic / AACC 2020).
export const BLOOD_REFERENCE: Record<string, { unit: string; refLow: number; refHigh: number; athleteNote: string }> = {
  Hemoglobin: { unit: "g/dL", refLow: 13.5, refHigh: 17.5, athleteNote: "Athletes often run 0.5-1.0 g/dL lower due to plasma volume expansion (Ross 2016)." },
  Hematocrit: { unit: "%", refLow: 38.3, refHigh: 48.6, athleteNote: "Dilutional pseudoanemia is common in endurance athletes — not pathology." },
  Ferritin: { unit: "ng/mL", refLow: 30, refHigh: 300, athleteNote: "For endurance athletes, target ≥50-60 ng/mL; <30 = deficient (Peeling 2008)." },
  "Vitamin D": { unit: "ng/mL", refLow: 30, refHigh: 80, athleteNote: "Optimize to 40-60 ng/mL; deficiency impairs muscle function & immunity (Holick 2007)." },
  "Vitamin B12": { unit: "pg/mL", refLow: 200, refHigh: 900, athleteNote: "Vegetarian athletes at higher risk of low B12." },
  Folate: { unit: "ng/mL", refLow: 3.1, refHigh: 20, athleteNote: "Needed for red cell production." },
  Testosterone: { unit: "ng/dL", refLow: 300, refHigh: 1000, athleteNote: "Overtraining can suppress T; total T <300 warrants investigation (male)." },
  Cortisol: { unit: "µg/dL", refLow: 6, refHigh: 23, athleteNote: "Morning cortisol trends matter more than single values — chronic elevation = overreach." },
  "TSH": { unit: "mIU/L", refLow: 0.4, refHigh: 4.0, athleteNote: "Even subclinical hypothyroidism impairs performance." },
  "Total Cholesterol": { unit: "mg/dL", refLow: 125, refHigh: 200, athleteNote: "Endurance training usually improves HDL/LDL ratio." },
  HDL: { unit: "mg/dL", refLow: 40, refHigh: 90, athleteNote: "HDL >60 mg/dL is protective; training raises it." },
  LDL: { unit: "mg/dL", refLow: 0, refHigh: 100, athleteNote: "Athletes can tolerate slightly higher LDL if HDL is high." },
  Triglycerides: { unit: "mg/dL", refLow: 0, refHigh: 150, athleteNote: "Low TG + high HDL = the endurance athlete signature." },
  Glucose: { unit: "mg/dL", refLow: 70, refHigh: 100, athleteNote: "Fasting glucose <100; train low sessions can transiently lower it." },
  HbA1c: { unit: "%", refLow: 4, refHigh: 5.6, athleteNote: "Carbohydrate loading doesn't meaningfully change A1c in healthy athletes." },
  Creatinine: { unit: "mg/dL", refLow: 0.74, refHigh: 1.35, athleteNote: "Higher muscle mass → slightly higher creatinine is normal." },
  "Creatine Kinase": { unit: "U/L", refLow: 39, refHigh: 308, athleteNote: "CK spikes 24-72h after hard sessions; chronic elevation = inadequate recovery." },
  CRP: { unit: "mg/L", refLow: 0, refHigh: 3, athleteNote: "High-sensitivity CRP >3 mg/L with fatigue = investigate overtraining or infection." },
  "Iron": { unit: "µg/dL", refLow: 60, refHigh: 170, athleteNote: "Total iron is less informative than ferritin + transferrin saturation." },
  "Transferrin Saturation": { unit: "%", refLow: 15, refHigh: 50, athleteNote: "TSAT <15% = functional iron deficiency even with normal ferritin (Brutsaert 2003)." },
  Magnesium: { unit: "mg/dL", refLow: 1.7, refHigh: 2.2, athleteNote: "Athletes lose Mg in sweat; deficiency worsens cramps & sleep." },
  Sodium: { unit: "mmol/L", refLow: 135, refHigh: 145, athleteNote: "Hyponatremia risk in long events — match fluids to sweat rate (Noakes 2003)." },
  Potassium: { unit: "mmol/L", refLow: 3.5, refHigh: 5.0, athleteNote: "Sweat potassium losses are usually covered by diet." },
  "Uric Acid": { unit: "mg/dL", refLow: 3.5, refHigh: 7.2, athleteNote: "Elevated with hard training volume; also antioxidant (controversial)." },
  "White Blood Cells": { unit: "K/µL", refLow: 4.5, refHigh: 11, athleteNote: "High volume training can cause transient leucopenia — check with fatigue." },
};

// ---- DNA sport-relevant SNPs (post-2000 genomics of performance) ----
// References: Yang et al. 2003 ACTN3 R577X (Nat Genet 34:460-461); Montgomery et al. 1998
// ACE I/D; Bouchard et al. 2011 HERITAGE VO2max trainability; MacArthur & North 2004.
export const DNA_TRAITS: { rsid: string; gene: string; trait: string; pairs: Record<string, { impact: string; note: string }> }[] = [
  {
    rsid: "rs1815739", gene: "ACTN3", trait: "Power vs Endurance Profile",
    pairs: {
      "CC": { impact: "beneficial", note: "RR genotype (C/C): α-actinin-3 present — sprint/power advantage (Yang 2003). Sprint-trained athletes overrepresented." },
      "CT": { impact: "neutral", note: "RX heterozygote: mixed profile — well suited to triathlon's hybrid demands." },
      "TT": { impact: "beneficial", note: "XX genotype: ACTN3 deficiency — associated with elite endurance performance (Eynon 2009). Common among pro cyclists/rowers." },
    },
  },
  {
    rsid: "rs4646994", gene: "ACE", trait: "Endurance Adaptation (I/D)",
    pairs: {
      "II": { impact: "beneficial", note: "II genotype: higher ACE activity → better endurance economy, high-altitude performance (Montgomery 1998; Gayagay 1998)." },
      "ID": { impact: "neutral", note: "Heterozygote: balanced." },
      "DD": { impact: "caution", note: "DD genotype: sprint/power association; may require more careful volume progression to avoid overuse injury." },
    },
  },
  {
    rsid: "rs4680", gene: "COMT", trait: "Pain Tolerance & Stress Response",
    pairs: {
      "GG": { impact: "neutral", note: "Val/Val: fast catecholamine breakdown — lower baseline pain tolerance, benefits from mental skills training." },
      "GA": { impact: "neutral", note: "Val/Met: intermediate." },
      "AA": { impact: "beneficial", note: "Met/Met: higher endogenous dopamine — better pain tolerance & stress resilience under load." },
    },
  },
  {
    rsid: "rs8192678", gene: "PPARGC1A", trait: "VO2max Trainability",
    pairs: {
      "AA": { impact: "neutral", note: "Gly482: standard trainability." },
      "AG": { impact: "neutral", note: "Heterozygote." },
      "GG": { impact: "caution", note: "Ser482 variant: associated with lower aerobic training response in some cohorts (Bouchard 2011). Requires more consistent Z2 volume." },
    },
  },
  {
    rsid: "rs1799983", gene: "NOS3", trait: "Blood Flow & Oxygen Delivery",
    pairs: {
      "GG": { impact: "beneficial", note: "Glu298Glu: normal eNOS — good microcirculation for endurance." },
      "GT": { impact: "neutral", note: "Heterozygote." },
      "TT": { impact: "caution", note: "Asp298 variant: reduced NO production — prioritize aerobic base and recovery; some studies link to hypertension risk." },
    },
  },
  {
    rsid: "rs1042713", gene: "ADRB2", trait: "Cardiorespiratory Response",
    pairs: {
      "AA": { impact: "beneficial", note: "Gly16Gly: favorable bronchodilation & VO2max response to training." },
      "AG": { impact: "neutral", note: "Heterozygote." },
      "GG": { impact: "neutral", note: "Arg16: fine — monitor respiratory response to hard intervals." },
    },
  },
];

// ---- Nutrition guidance (post-2000 sports nutrition consensus) ----
// Burke et al. 2001/2011 (carb periodization); Thomas et al. 2016 (ACSM/AND/DC joint position);
// Jeukendrup 2011 (multiple transportable carbs); Phillips & Van Loon 2011 (protein).
export const NUTRITION_GUIDELINES = {
  dailyProtein: { endurance: 1.2, strength: 1.6, unit: "g/kg", source: "Thomas et al. 2016 (ACSM/AND/DC)" },
  carbDuring: { under1h: 0, under2h: 30, over2h: 60, unit: "g/h", source: "Jeukendrup 2011" },
  carbLong: { target: 90, unit: "g/h", source: "Jeukendrup 2014 — multiple transportable carbs" },
  hydration: { sweatRate: 0.8, range: "0.4-1.2", unit: "L/h", source: "Noakes 2003; ACSM 2007" },
  sodium: { target: 700, range: "400-1000", unit: "mg/L", source: "ACSM 2007" },
  proteinPost: { target: 0.3, unit: "g/kg within 2h", source: "Phillips & Van Loon 2011" },
};

// ---------- HYROX ----------
// 8 × (1km run + functional station), 8km running total. Weights/distances from the
// official HYROX rulebook (Singles, Open divisions). W/M = Open women/men; Pro listed separately.
export interface HyroxStation {
  key: string;
  name: string;
  spec: string;   // distance/reps
  women: string;  // open weight (or "—")
  men: string;
  pro: string;
  focus: string;
}

export const HYROX_STATIONS: HyroxStation[] = [
  { key: "ski", name: "SkiErg", spec: "1000m", women: "—", men: "—", pro: "—", focus: "Lats, shoulders, core + aerobic. Arrive off Run 1 — don't spike HR here." },
  { key: "sledpush", name: "Sled Push", spec: "50m (4×12.5m)", women: "102kg", men: "152kg", pro: "202kg", focus: "Legs, posterior chain, calves. Raw strength + grip shoes." },
  { key: "sledpull", name: "Sled Pull", spec: "50m (4×12.5m)", women: "78kg", men: "103kg", pro: "153kg", focus: "Glutes, back, biceps, grip. Hand-over-hand rope under fatigue." },
  { key: "burpee", name: "Burpee Broad Jumps", spec: "80m", women: "—", men: "—", pro: "—", focus: "Full body + biggest HR spike of the race. Pacing beats sprinting." },
  { key: "row", name: "Rowing", spec: "1000m", women: "—", men: "—", pro: "—", focus: "Back, legs, aerobic. Go conservative early — pays off late." },
  { key: "farmers", name: "Farmers Carry", spec: "200m", women: "2×16kg", men: "2×24kg", pro: "2×32kg", focus: "Grip, traps, postural endurance. Grip is already compromised here." },
  { key: "lunges", name: "Sandbag Lunges", spec: "100m", women: "10kg", men: "20kg", pro: "30kg", focus: "Quads, hip flexors. Knee-to-floor standard fails when hip flexors are tight." },
  { key: "wallball", name: "Wall Balls", spec: "100 reps", women: "4kg", men: "6kg", pro: "9kg", focus: "Squat mechanics, shoulders, lungs. Everything is loaded by this point." },
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
  const phase = (w: number): "base" | "build" | "peak" | "taper" => {
    const pct = w / weeks;
    if (pct <= 0.5) return "base";
    if (pct <= 0.8) return "build";
    if (pct <= 0.92) return "peak";
    return "taper";
  };
  const theme: Record<string, string> = {
    base: "Aerobic Base + Strength Foundation",
    build: "Station-Specific + Compromised Running",
    peak: "Race Simulation",
    taper: "Freshness & Taper",
  };

  const weeksOut: GeneratedWeek[] = [];
  for (let w = 1; w <= weeks; w++) {
    const ph = phase(w);
    let vol = 1;
    if (ph === "base") vol = 0.8 + 0.4 * (w / (weeks * 0.5));
    else if (ph === "build") vol = 1.2 + 0.1 * ((w - weeks * 0.5) / (weeks * 0.3));
    else if (ph === "peak") vol = 0.9;
    else vol = 0.55;

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
      sessions.push({ sport: "run", title: "Run: 1km Repeats", minutes: Math.round(runMin * 0.4), zone: "z5", type: "interval", description: "6×1km at ~5k pace (Z5) with 90s jog recovery. Mirrors the exact HYROX run segment length." });
      sessions.push({ sport: "run", title: "Run: Tempo", minutes: Math.round(runMin * 0.3), zone: "z4", type: "threshold", description: "3×10 min at T-pace (Z4) with 3 min easy. The sustained run pace you'll hold between stations." });
      sessions.push({ sport: "run", title: "Run: Easy + Hills", minutes: Math.round(runMin * 0.3), zone: "z2", type: "endurance", description: "Easy Z2 + 8×60s hill repeats for run economy (Rønnestad 2014)." });
    } else if (ph === "peak") {
      sessions.push({ sport: "run", title: "Run: Race-Pace 1km", minutes: Math.round(runMin * 0.5), zone: "z4", type: "interval", description: "5×1km at race pace with 2 min walk/jog. Dial in the exact effort you'll race at." });
      sessions.push({ sport: "run", title: "Run: Sharpening", minutes: Math.round(runMin * 0.3), zone: "z3", type: "tempo", description: "Short and sharp: 3×8 min at 90-93% LTHR." });
    } else {
      sessions.push({ sport: "run", title: "Run: Taper Jog", minutes: Math.round(runMin * 0.6), zone: "z2", type: "recovery", description: "Easy 20-30 min with 4×20s strides. Legs stay sharp, fatigue stays low." });
    }

    // STRENGTH / STATIONS
    if (ph === "base") {
      sessions.push({ sport: "strength", title: "Strength: Sled & Squat Foundation", minutes: Math.round(strengthMin * 0.35), zone: "z1", type: "strength", description: "Heavy compound lifts (back squat, deadlift, sled push/pull light) 3×5-8. Build the raw posterior-chain strength HYROX stations demand." });
      sessions.push({ sport: "strength", title: "Engine: SkiErg + Row", minutes: Math.round(strengthMin * 0.3), zone: "z2", type: "endurance", description: "SkiErg 5×500m + Row 5×500m at steady aerobic pace. Learn the erg technique you'll use on race day." });
      sessions.push({ sport: "strength", title: "Conditioning: Carry + Lunge + Wall Ball", minutes: Math.round(strengthMin * 0.35), zone: "z3", type: "strength", description: "Farmers carry 4×50m, sandbag lunges 4×25m, wall balls 3×20. Light weights, full movement standards." });
    } else if (ph === "build") {
      sessions.push({ sport: "strength", title: "Station: Sled Push + Pull", minutes: Math.round(strengthMin * 0.35), zone: "z4", type: "strength", description: "Sled push 8×12.5m + sled pull 8×12.5m at race weight (build toward it). Grip the floor, drive through the posterior chain." });
      sessions.push({ sport: "strength", title: "Station: Erg Intervals", minutes: Math.round(strengthMin * 0.3), zone: "z4", type: "interval", description: "SkiErg + Row 8×500m at race pace with 1:1 rest. Damper ~6 (race setting)." });
      sessions.push({ sport: "strength", title: "Station: Burpees + Carries + Wall Balls", minutes: Math.round(strengthMin * 0.35), zone: "z4", type: "strength", description: "80m burpee broad jumps, 200m farmers carry, 100m lunges, 3×30 wall balls — full movement standards, race weights." });
    } else if (ph === "peak") {
      sessions.push({ sport: "strength", title: "Station: Full-Weight Dress Rehearsal", minutes: Math.round(strengthMin * 0.6), zone: "z4", type: "strength", description: "Every station at race weight, once through, with 500m jog between. Lock in the movement standards." });
    } else {
      sessions.push({ sport: "strength", title: "Strength: Maintenance", minutes: Math.round(strengthMin * 0.5), zone: "z1", type: "strength", description: "Light, explosive: 2×8 moderate load. No heavy lifting within 7-10 days of race." });
    }

    // COMPROMISED RUNNING (the defining HYROX skill)
    if (ph === "build" || ph === "peak") {
      sessions.push({ sport: "hyrox", title: "Compromised Run: Station Intervals", minutes: 45, zone: "z3", type: "brick", description: "Run 1km → 1 station (ski/sled/wallball, rotating) → run 1km → next station, ×4. This is where HYROX is won — learn to run on tired, loaded legs." });
    }
    if (ph === "peak" || ph === "taper") {
      sessions.push({ sport: "hyrox", title: "Race Sim: Full/Short HYROX", minutes: ph === "peak" ? 60 : 40, zone: "z4", type: "brick", description: ph === "peak" ? "Full 8-station simulation with 1km runs (or scaled to 60 min). Practice pacing + transitions." : "Half simulation — 4 stations + 4×500m. Stay sharp, don't dig deep." });
    }

    // RECOVERY + MOBILITY
    sessions.push({ sport: "recovery", title: "Recovery: Mobility + Grip/Ankle Care", minutes: Math.round(otherMin > 0 ? otherMin : 25), zone: "z1", type: "recovery", description: "Hip-flexor, ankle and wrist mobility (lunges + wall balls + farmers carry punish them). Easy Z1 flush. Sleep 8h." });

    weeksOut.push({ week: w, theme: theme[ph], sessions, totalMinutes: totalMin });
  }
  return weeksOut;
}
