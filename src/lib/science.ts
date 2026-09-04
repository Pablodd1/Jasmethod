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
// ---- 6-week mesocycle engine (user product rule) ----
// Everything cycles in 6-week blocks: 5 build weeks stepping up + week 6 = taper
// + baseline test. Each block is 5-10% higher than the last, scaled by level.
// After a race: volume dips (race = block end), next block rebuilds from lower.
export function mesoBlock(level: string): number {
  // per-block volume increase: fitter athletes progress slower (less headroom)
  return level === "beginner" ? 1.10 : level === "amateur" ? 1.07 : level === "advanced" ? 1.06 : 1.05;
}

export function mesoVolume(weekIndex: number, level: string, raceDates: Date[] = [], startDate: Date = new Date(0)): { vol: number; phase: "build" | "taper"; block: number } {
  // weekIndex 0-based
  const block = Math.floor(weekIndex / 6);
  const inBlock = weekIndex % 6;
  // within-block wave: 0.85 → 1.0 across 5 build weeks
  const within = 0.85 + (inBlock / 4) * 0.15;
  // block-to-block: each cycle 5-10% higher
  const step = Math.pow(mesoBlock(level), block);
  // post-race dip: the week right after a race drops to rebuild
  const wkStart = startDate.getTime() + weekIndex * 7 * 86400000;
  const prevWeekStart = wkStart - 7 * 86400000;
  const afterRace = raceDates.some((r) => { const rt = new Date(r).getTime(); return rt >= prevWeekStart && rt < wkStart; });
  const isTaper = inBlock === 5;
  if (afterRace) return { vol: 0.6 * step, phase: "build", block }; // post-race regeneration week
  if (isTaper) return { vol: 0.55 * step, phase: "taper", block };
  return { vol: within * step, phase: "build", block };
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
}): GeneratedWeek[] {
  const { level, distance, weeks, startDate, weeklyHours, easyPct, raceDate } = opts;
  const splitTarget = easyPct ?? 70; // 70/30 default, manual-adjustable
  const baseWeekly = weeklyHours ?? (level === "pro" ? 20 : level === "advanced" ? 14 : level === "amateur" ? 10 : 6);
  // Distance multipliers for weekly hours
  const distFactor: Record<string, number> = { sprint: 0.6, olympic: 0.8, half: 1.0, full: 1.3 };
  const targetHours = baseWeekly * (distFactor[distance] ?? 1);
  // 6-week mesocycles: week 6 = taper + baseline test, each block +5-10%
  const races = raceDate ? [raceDate] : [];

  const weeksOut: GeneratedWeek[] = [];
  for (let w = 1; w <= weeks; w++) {
    const { vol: volumeFactor, phase: ph, block } = mesoVolume(w - 1, level, races, startDate);
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

    // ---- STRENGTH + PLYOMETRICS (product rule: plyo 1-2×/week is MANDATORY
    // in every plan, alongside sport-specific lifting — Rønnestad & Mujika 2014;
    // Ramírez-Campillo et al. 2022 plyometric jump training meta-analysis) ----
    if (strengthMin >= 30) {
      const phaseFocus = legacy === "base"
        ? "Strength: Foundation — heavy compound lifts (squat, deadlift, bench, row) 3×5-8 + plyometric primer (box jumps 3×5, med-ball throws 3×8). Strength improves running economy and time-trial performance (Rønnestad & Mujika 2014); plyo 1-2×/week is mandatory in every plan (Ramírez-Campillo 2022)."
        : legacy === "build"
          ? "Strength: Power — Olympic lifts / loaded jumps 3×5 + plyometric circuit (depth jumps, bounds, hopping drills) 2×/week. Converts strength into speed (Rønnestad 2014; Ramírez-Campillo 2022)."
          : "Strength: Maintenance — light, explosive. 2×8 moderate load + 3×5 box jumps. Stop heavy lifting 7-10 days pre-race.";
      sessions.push({ sport: "strength", title: legacy === "taper" ? "Strength: Maintenance" : `Strength: ${legacy === "base" ? "Foundation + Plyo" : legacy === "build" ? "Power + Plyo" : "Maintenance"}`, minutes: strengthMin, zone: "z1", type: "strength", description: phaseFocus });
      // Dedicated plyometric session: 1×/week in base, 2nd in build/peak (the
      // 2nd rides inside the strength day above). Never in taper.
      if (legacy === "base") {
        sessions.push({ sport: "strength", title: "Plyometrics: Jump Training", minutes: Math.max(25, Math.round(strengthMin * 0.5)), zone: "z3", type: "plyo", description: "Plyometrics (mandatory 1-2×/week): box jumps 4×5, standing long jumps 3×5, pogo hops 3×20s, single-leg bounds 2×6/leg. Full recovery between sets — quality of contact, not fatigue. Improves economy, power and injury resilience (Ramírez-Campillo 2022)." });
      }
      if (legacy === "build" || legacy === "peak") {
        sessions.push({ sport: "strength", title: "Plyometrics: Reactive Power", minutes: Math.max(25, Math.round(strengthMin * 0.5)), zone: "z3", type: "plyo", description: "Plyometrics (mandatory 2×/week in build): depth jumps 4×5 (drop height ≤40cm), lateral bounds 3×8/side, single-leg hops 3×10, sprint-specific bounding 4×20m. Full recoveries, land quiet — stiff ankles, quiet knees (Ramírez-Campillo 2022)." });
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
    const finalSessions = legacy !== "taper" ? enforceSplit(sessions, splitTarget) : sessions;

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
      } else if (!isEasy(s) && s.sport !== "brick" && s.type !== "brick" && s.type !== "strength" && s.type !== "plyo") {
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
    if (type === "strength") return `Main: power circuit ${Math.round(work)} min: 4 rounds of 20 max-speed bag punches, 8 explosive push-ups, 10 rotational throws, 30s plank, 60s rest → ${t}. Every rep FAST.`;
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
  threshold: "Friel 7-zone LT model (Triathlete's Training Bible); Seiler & Tønnessen 2009, Int J Sports Physiol Perform 4:417-429",
  tempo: "Seiler & Tønnessen 2009 — polarized distribution (Int J Sports Physiol Perform 4:417-429)",
  endurance: "Seiler & Tønnessen 2009 — 80/20 polarized model (Int J Sports Physiol Perform 4:417-429)",
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

// ---- Daily motivation engine ----
// Combines science-grounded coaching cues with psychology research
// (self-determination theory — Ryan & Deci 2000; implementation intentions — Gollwitzer 1999).
export const MOTIVATION_LIBRARY: { quote: string; science: string; coach: string; es?: { quote: string; coach: string } }[] = [
  { quote: "The body achieves what the mind believes.", science: "Self-efficacy is one of the strongest predictors of endurance performance (Hagger et al. 2001).", coach: "Today is a brick in the wall. Lay it well.", es: { quote: "El cuerpo logra lo que la mente cree.", coach: "Hoy pones un ladrillo en la pared. Colócalo bien." } },
  { quote: "Discipline is choosing what you want most over what you want now.", science: "Delay of gratification and habit automation are trainable (Gollwitzer 1999 implementation intentions).", coach: "Set your gear out tonight. Remove the choice, remove the friction.", es: { quote: "La disciplina es elegir lo que más quieres sobre lo que quieres ahora.", coach: "Deja tu equipo listo esta noche. Sin decisión, sin fricción." } },
  { quote: "You don't rise to the level of your goals. You fall to the level of your systems.", science: "Consistency of training load beats heroic single sessions — CTL is built daily (Coggan).", coach: "One session today beats two tomorrow. Go.", es: { quote: "No subes al nivel de tus metas; caes al nivel de tus sistemas.", coach: "Una sesión hoy vale más que dos mañana. Ve." } },
  { quote: "Pain is temporary. Quitting lasts forever.", science: "Perceived exertion is modulated by mindset — reframing effort as a positive signal improves performance (Crum & Langer 2007).", coach: "When it hurts in Z4, tell yourself: this is exactly where the adaptation happens.", es: { quote: "El dolor es temporal. Rendirse dura para siempre.", coach: "Cuando duela en Z4, dime: aquí es exactamente donde ocurre la adaptación." } },
  { quote: "The miracle isn't that I finished. It's that I had the courage to start.", science: "Behavioral activation — starting is the hardest part; once moving, commitment rises (Lewin's task-initiation research).", coach: "Warm-up is the hardest 10 minutes. Get them done and the rest flows.", es: { quote: "El milagro no es que terminé; es que tuve el valor de empezar.", coach: "El calentamiento son los 10 minutos más difíciles. Hazlos y el resto fluye." } },
  { quote: "Champions are made in the hours others spend sleeping.", science: "Sleep is when training adaptations consolidate — growth hormone, tissue repair, memory of motor patterns (Fullagar 2015, Sports Med).", coach: "Actually — champions ARE made in sleep. 8 hours is a training session. Guard it.", es: { quote: "Los campeones se hacen en las horas que otros gastan durmiendo.", coach: "De hecho — los campeones SE hacen durmiendo. 8 horas son una sesión de entreno. Protégelas." } },
  { quote: "Run when you can, walk if you must, crawl if you have to; just never give up.", science: "Pacing flexibility preserves performance when conditions change (Abbiss & Laursen 2008).", coach: "Bad day? Cut the pace, keep the time. Load is load.", es: { quote: "Corre cuando puedas, camina si hace falta, gatea si tienes que; pero nunca te rindas.", coach: "¿Mal día? Baja el ritmo, mantén el tiempo. La carga es carga." } },
  { quote: "What you do every day matters more than what you do once in a while.", science: "Aerobic base requires chronic stimulus — 12+ weeks of consistent Z2 (Seiler 2009).", coach: "The long game is the only game. Today's easy session IS the adaptation.", es: { quote: "Lo que haces cada día importa más que lo que haces de vez en cuando.", coach: "El juego largo es el único juego. La sesión fácil de hoy ES la adaptación." } },
  { quote: "Sweat is fat crying.", science: "Well — sweat is thermoregulation, but the sentiment stands: hard work signals adaptation (ACSM 2021).", coach: "Hydrate. Electrolytes. Now. Then train.", es: { quote: "El sudor es la grasa llorando.", coach: "Hidrátate. Electrolitos. Ya. Luego entrena." } },
  { quote: "It never gets easier, you just get faster.", science: "As fitness improves, the same RPE yields higher absolute output — this is the hallmark of adaptation (Foster 1998).", coach: "If today's Z2 feels easier than last month, raise the bar — that's progress.", es: { quote: "Nunca se hace más fácil, solo te haces más rápido.", coach: "Si tu Z2 de hoy se siente más fácil que el mes pasado, sube el listón — eso es progreso." } },
];

// Style prefixes localized (prepended to the coach message).
const MOTIVATION_PREFIX: Record<string, { tough: string; gentle: string }> = {
  en: { tough: "No excuses. ", gentle: "You've got this. " },
  es: { tough: "Sin excusas. ", gentle: "Tú puedes. " },
  ht: { tough: "Pa gen ekskoz. ", gentle: "Ou kapab. " },
  fr: { tough: "Aucune excuse. ", gentle: "Tu peux le faire. " },
  ru: { tough: "Без оправданий. ", gentle: "У тебя получится. " },
};

export function dailyMotivation(dayIndex: number, style: string = "coach", lang: string = "en"): { quote: string; message: string } {
  const item = MOTIVATION_LIBRARY[dayIndex % MOTIVATION_LIBRARY.length];
  const es = lang === "es" && item.es ? item.es : null;
  const quote = es ? es.quote : item.quote;
  const coach = es ? es.coach : item.coach;
  const prefix = MOTIVATION_PREFIX[lang] || MOTIVATION_PREFIX.en;
  if (style === "science") return { quote, message: item.science };
  if (style === "tough") return { quote, message: `${prefix.tough}${coach}` };
  if (style === "gentle") return { quote, message: `${prefix.gentle}${coach}` };
  return { quote, message: coach };
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
  { key: "ski", name: "SkiErg", spec: "1000m", women: "—", men: "—", pro: "—", focus: "Lats, shoulders, core + aerobic. Arrive off Run 1 — don't spike HR here. 2026/27: clarified SkiErg standard — full handle return, no partial pulls." },
  { key: "sledpush", name: "Sled Push", spec: "50m (4×12.5m)", women: "102kg", men: "152kg", pro: "202kg", focus: "Legs, posterior chain, calves. Raw strength + grip shoes." },
  { key: "sledpull", name: "Sled Pull", spec: "50m (4×12.5m)", women: "78kg", men: "103kg", pro: "153kg", focus: "Glutes, back, biceps, grip. Hand-over-hand rope under fatigue." },
  { key: "burpee", name: "Burpee Broad Jumps", spec: "80m", women: "—", men: "—", pro: "—", focus: "Full body + biggest HR spike of the race. Pacing beats sprinting. 2026/27: tighter burpee broad-jump movement standard — full hip extension every rep." },
  { key: "row", name: "Rowing", spec: "1000m", women: "—", men: "—", pro: "—", focus: "Back, legs, aerobic. Go conservative early — pays off late." },
  { key: "farmers", name: "Farmers Carry", spec: "200m", women: "2×16kg", men: "2×24kg", pro: "2×32kg", focus: "Grip, traps, postural endurance. Grip is already compromised here." },
  { key: "lunges", name: "Sandbag Lunges", spec: "100m", women: "10kg", men: "20kg", pro: "30kg", focus: "Quads, hip flexors. Knee-to-floor standard fails when hip flexors are tight. 2026/27: clarified lunge standard — sandbag penalty (not DQ) on first fault; incomplete station = DQ." },
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
      sessions.push({ sport: "strength", title: "Strength: Sled & Squat Foundation", minutes: Math.round(strengthMin * 0.35), zone: "z1", type: "strength", description: "Heavy compound lifts (back squat, deadlift, sled push/pull light) 3×5-8 + plyometric primer (box jumps 3×5, broad jumps 3×5) — plyo 1-2×/week is mandatory in every plan (Ramírez-Campillo 2022). Build the raw posterior-chain strength HYROX stations demand." });
      sessions.push({ sport: "strength", title: "Engine: SkiErg + Row", minutes: Math.round(strengthMin * 0.3), zone: "z2", type: "endurance", description: "SkiErg 5×500m + Row 5×500m at steady aerobic pace. Learn the erg technique you'll use on race day." });
      sessions.push({ sport: "strength", title: "Conditioning: Carry + Lunge + Wall Ball", minutes: Math.round(strengthMin * 0.35), zone: "z3", type: "strength", description: "Farmers carry 4×50m, sandbag lunges 4×25m, wall balls 3×20. Light weights, full movement standards." });
    } else if (ph === "build") {
      sessions.push({ sport: "strength", title: "Station: Sled Push + Pull", minutes: Math.round(strengthMin * 0.35), zone: "z4", type: "strength", description: "Sled push 8×12.5m + sled pull 8×12.5m at race weight (build toward it) + plyometric circuit 2×/week: depth jumps 3×5, bounding 3×20m — the explosive stiffness that makes sleds and walls cheaper (Ramírez-Campillo 2022)." });
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
      sessions.push({ sport: "strength", title: "S&C: Punching Power + Neck/Core Armor", minutes: scMin, zone: "z3", type: "strength", description: "Mandatory plyometrics 1-2×/week: jump squat 3×5, depth jumps 3×5, plyo push-ups 3×8; landmine punch 4×6/side, rotational med-ball throw 4×6/side; armor: neck isometrics 3×30s, Pallof press 3×10, farmers carry 3×40m. Move the bar FAST — force = mass × acceleration (Suchomel 2016). Ground-up power transfer is what the punch rides on (Turner 2011); jump and throw power track punch impact in elite boxers (Loturco 2016)." });
    } else {
      sessions.push({ sport: "strength", title: "S&C: Activation Only", minutes: Math.round(scMin * 0.6), zone: "z1", type: "recovery", description: "Banded pull-aparts, hip 90/90s, light med-ball tosses. Keep the nervous system awake, the muscles asleep." });
    }

    // RECOVERY
    sessions.push({ sport: "recovery", title: "Recovery: Mobility + Wrists/Shoulders", minutes: 25, zone: "z1", type: "recovery", description: "Wrist curls + extensor stretches, thoracic openers, hip mobility (roadwork and pivots tax them). 8h sleep is a training session — motor patterns consolidate overnight (Walker)." });

    weeksOut.push({ week: w, theme: theme[ph], sessions, totalMinutes: totalMin });
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
      sessions.push({ sport: "bike", title: "Endurance Ride (Z2)", minutes: Math.round(totalMin * 0.35), zone: "z2", type: "endurance", description: "Steady aerobic miles — cadence 85-95 rpm. The engine builder (Seiler 2009: 80/20)." });
      sessions.push({ sport: "bike", title: "Sweet Spot Intervals", minutes: Math.round(totalMin * 0.25), zone: "z3", type: "interval", description: "3×12 min @ 88-94% FTP, 6 min spin between. Best fitness-per-minute of any bike workout (Seiler 2010)." });
      sessions.push({ sport: "bike", title: "VO2max Intervals", minutes: Math.round(totalMin * 0.15), zone: "z5", type: "interval", description: ph === "base" ? "Endurance spin, keep it easy today." : "5×4 min @ 106-120% FTP, 4 min easy. Raise the ceiling (Billat 2001)." });
      sessions.push({ sport: "strength", title: "Cyclist Strength", minutes: Math.round(totalMin * 0.15), zone: "z1", type: "strength", description: "Squats, hip thrusts, single-leg work 3×8 + plyometric primer (box jumps 3×5, pogo hops 3×20s) — plyo 1-2×/week mandatory (Ramírez-Campillo 2022). Preserves power and bone (Ronnestad 2020)." });
      sessions.push({ sport: "mobility", title: "Recovery Spin + Hip Mobility", minutes: Math.round(totalMin * 0.1), zone: "z1", type: "recovery", description: "Ultra-light spin + hip flexor/hamstring flow. Blood flow without load." });
    } else if (sport === "swim") {
      sessions.push({ sport: "swim", title: "Technique + Aerobic Swim", minutes: Math.round(totalMin * 0.3), zone: "z2", type: "endurance", description: "Drills (catch-up, fingertip drag) then steady swims. Technique first — speed follows form." });
      sessions.push({ sport: "swim", title: "Threshold Swim Set", minutes: Math.round(totalMin * 0.25), zone: "z4", type: "interval", description: "10×100 @ CSS pace, 15s rest. Threshold is the swim engine (Olbrecht 2015)." });
      sessions.push({ sport: "swim", title: "VO2max Sprints", minutes: Math.round(totalMin * 0.15), zone: "z5", type: "interval", description: ph === "base" ? "Easy pull buoy set instead today." : "8×50m max effort, 60s full recovery. Race-speed Neuromuscular work." });
      sessions.push({ sport: "strength", title: "Swimmer Strength", minutes: Math.round(totalMin * 0.2), zone: "z1", type: "strength", description: "Pull-ups, rows, rotator cuff work 3×10 + plyometric primer (clap push-ups 3×5, med-ball slams 3×8) — plyo 1-2×/week mandatory (Ramírez-Campillo 2022). Shoulder durability = swim career length." });
      sessions.push({ sport: "mobility", title: "Ankle & Shoulder Mobility", minutes: Math.round(totalMin * 0.1), zone: "z1", type: "recovery", description: "Ankle flexibility = better kick; thoracic mobility = longer catch." });
    } else if (sport === "run") {
      sessions.push({ sport: "run", title: "Long Aerobic Run (Z2)", minutes: Math.round(totalMin * 0.35), zone: "z2", type: "endurance", description: "Steady conversational miles — the aerobic engine (Seiler 2009: 80/20). Build the long run ≤10% distance per week." });
      sessions.push({ sport: "run", title: "Tempo / Threshold Run", minutes: Math.round(totalMin * 0.25), zone: "z4", type: "threshold", description: "20-30 min @ lactate threshold (T-pace). The single best marathon/half predictor (Billat 2001)." });
      sessions.push({ sport: "run", title: "VO2max Intervals", minutes: Math.round(totalMin * 0.15), zone: "z5", type: "interval", description: ph === "base" ? "Easy strides instead today." : "6×800m or 5×1000m @ ~5k pace, equal-time jog recovery. Raise the ceiling." });
      sessions.push({ sport: "strength", title: "Runner Strength", minutes: Math.round(totalMin * 0.15), zone: "z1", type: "strength", description: "Single-leg squats, calf raises, glute bridge 3×10 + plyometrics 1-2×/week (pogo hops, A-skips, bounds — mandatory, Ramírez-Campillo 2022). Running economy + injury-proofing (Ronnestad 2020)." });
      sessions.push({ sport: "mobility", title: "Recovery Run + Mobility", minutes: Math.round(totalMin * 0.1), zone: "z1", type: "recovery", description: "Easy shakeout jog + hip/ankle mobility flow. Blood flow with zero load." });
    } else {
      // lifting-only — progressive overload is the plan
      sessions.push({ sport: "strength", title: "Lower Body Heavy", minutes: Math.round(totalMin * 0.3), zone: "z1", type: "strength", description: "Squat 4×5, RDL 3×8, lunges 3×10 + plyometric primer (jump squats 3×5, med-ball throws 3×8) — plyo 1-2×/week mandatory (Ramírez-Campillo 2022). Add 2.5kg or 1 rep vs last week — the 6-week wave adds ~8% load (Schoenfeld 2016)." });
      sessions.push({ sport: "strength", title: "Upper Body Heavy", minutes: Math.round(totalMin * 0.25), zone: "z1", type: "strength", description: "Bench 4×5, rows 4×8, overhead press 3×8. Log every set — beat the logbook." });
      sessions.push({ sport: "strength", title: "Full Body Volume", minutes: Math.round(totalMin * 0.25), zone: "z1", type: "strength", description: "3×10 hypertrophy circuit @ 70% — the volume that grows muscle and work capacity." });
      sessions.push({ sport: "mobility", title: "Mobility + Core", minutes: Math.round(totalMin * 0.2), zone: "z1", type: "recovery", description: "Hips, shoulders, spine + anti-rotation core. Mobility is what lets you keep loading heavy." });
    }

    weeksOut.push({ week: w, theme: ph === "taper" ? "Freshness & Sharpening" : ph === "peak" ? "Peak Intensity" : ph === "build" ? "Build: Raise the Ceiling" : "Base: Aerobic Foundation", sessions, totalMinutes: totalMin });
  }
  return weeksOut;
}
