import { dayOffProtocolText } from "./day-off";
import { postFuelPersonalized } from "./fueling";
import { supplementAllowed } from "./supplement-db";
import { resolveCheckinSafety } from "./checkin-safety";
// JasMiamiMethod — Adaptive Engine
// The "changes daily/weekly/monthly, individualized, easy to change" layer.
// Pure functions (no DB, no I/O) so everything here is unit-testable.
//
// References: Balban et al. 2023 (physiological sigh), Lehrer & Gevirtz 2014
// (HRV biofeedback / resonance breathing), Shaffer & Meehan 2020 (coherence),
// AIS Sports Supplement Framework 2021 (Group A/B), Thomas et al. 2016 (fuel),
// Casa et al. 2000 (hydration/sweat rate), Ely et al. 2007 (heat pacing).

import { heatIndex, altitudeFactor } from "./fitness";
import { wetsuitVerdict } from "./wetsuit";
import { buildProtocol, type ProtocolSpec } from "./protocols";

// ---------- 1. AUTONOMIC NERVOUS SYSTEM RECOVERY (post-workout) ----------
// Vagal / parasympathetic techniques. Rotate daily (index), layer weekly theme
// + monthly focus so the athlete never plateaus on a single drill.

export interface RecoveryTechnique {
  key: string;
  name: string;
  minutes: number;
  instructions: string;
  mechanism: string;
}

export const RECOVERY_TECHNIQUES: RecoveryTechnique[] = [
  {
    key: "box",
    name: "Box Breathing",
    minutes: 5,
    instructions:
      "Inhale 4s → hold 4s → exhale 4s → hold 4s. Repeat for 5 min, seated, eyes closed.",
    mechanism:
      "Equal-ratio breathing upregulates parasympathetic tone (HRV) and lowers arousal.",
  },
  {
    key: "sigh",
    name: "Physiological Sigh",
    minutes: 2,
    instructions:
      "Two sharp inhales through the nose (second is a top-up), then one long slow exhale through the mouth. 5-8 rounds.",
    mechanism:
      "Fastest known real-time downregulation of stress; drops HR within seconds (Balban 2023).",
  },
  {
    key: "478",
    name: "4-7-8 Breathing",
    minutes: 4,
    instructions:
      "Inhale 4s → hold 7s → exhale 8s (through mouth). 4-6 rounds. Best before sleep.",
    mechanism:
      "Long exhale activates the vagus nerve; sedative for pre-sleep recovery.",
  },
  {
    key: "resonance",
    name: "Resonance Breathing",
    minutes: 10,
    instructions:
      "Breathe at ~5.5 breaths/min (5.5s in, 5.5s out) — no breath hold. 10 min.",
    mechanism:
      "Resonance frequency maximizes HRV amplitude; the gold-standard HRV biofeedback protocol (Lehrer 2014).",
  },
  {
    key: "nadi",
    name: "Alternate-Nostril Breathing",
    minutes: 5,
    instructions:
      "Close right nostril, inhale left; close left, exhale right; continue alternating. 5 min.",
    mechanism:
      "Nadi Shodhana balances autonomic outflow and calms sympathetic drive.",
  },
  {
    key: "pmr",
    name: "Progressive Muscle Relaxation",
    minutes: 8,
    instructions:
      "Tense each muscle group 5s then release 10s, feet → calves → quads → glutes → core → hands → arms → shoulders → face.",
    mechanism:
      "Reduces muscle tone + cortisol; teaches the body the 'off' signal.",
  },
  {
    key: "dive",
    name: "Cold Face Immersion",
    minutes: 3,
    instructions:
      "Splash or immerse face in cold water (<15°C) for 15-30s, 3 rounds. Breathe slowly between.",
    mechanism: "Mammalian dive reflex → acute bradycardia + vagal activation.",
  },
  {
    key: "legs",
    name: "Legs-Up-The-Wall",
    minutes: 10,
    instructions:
      "Lie on back, legs vertical against a wall, arms wide. Slow nasal breathing. 10 min.",
    mechanism:
      "Facilitates venous return + baroreceptor reset; a passive vagal posture.",
  },
  {
    key: "exhale",
    name: "Extended Exhale (2:1)",
    minutes: 5,
    instructions:
      "Inhale 3s, exhale 6s. 5 min, letting each exhale get longer than the inhale.",
    mechanism:
      "Prolonged exhalation is the most direct vagal lever; lowers HR and BP.",
  },
];

const WEEKLY_THEMES = [
  "Breath Control Basics — nail the mechanics of each drill before chasing duration.",
  "Down-Regulation Speed — how fast can you drop your HR after the session ends?",
  "Nasal-Only Focus — all recovery breathing through the nose this week.",
  "Sleep-Priming — do tonight's technique in bed to shorten sleep latency.",
  "Vagal Tone Build — pair breathing with a 5-min cold shower finish.",
  "Precision Rhythm — use a metronome/breath app to hold exact ratios.",
  "Recovery Audit — log RHR + subjective feel before/after each drill.",
];

const MONTHLY_FOCUS = [
  "Foundation: establish a daily 5-min recovery habit post-workout.",
  "Adaptation: extend to 10 min and add one morning HRV biofeedback session/week.",
  "Integration: attach the technique to brick + race-simulation days (highest ANS load).",
  "Mastery: build CO2 tolerance — lengthen exhale + breath holds gradually.",
  "Autonomy: you pick the drill each day; we just cue the habit.",
];

function dayIndex(date: Date): number {
  return Math.floor(date.getTime() / 86400000);
}

export interface RecoveryPlan {
  technique: RecoveryTechnique;
  dailyKey: string;
  weeklyTheme: string;
  monthlyFocus: string;
  cooldownNote: string;
}

export function recoveryFor(date: Date): RecoveryPlan {
  const di = dayIndex(date);
  const technique =
    RECOVERY_TECHNIQUES[
      ((di % RECOVERY_TECHNIQUES.length) + RECOVERY_TECHNIQUES.length) %
        RECOVERY_TECHNIQUES.length
    ];
  const week = Math.floor(di / 7);
  const month = Math.floor(di / 30);
  const weeklyTheme =
    WEEKLY_THEMES[
      ((week % WEEKLY_THEMES.length) + WEEKLY_THEMES.length) %
        WEEKLY_THEMES.length
    ];
  const monthlyFocus =
    MONTHLY_FOCUS[
      ((month % MONTHLY_FOCUS.length) + MONTHLY_FOCUS.length) %
        MONTHLY_FOCUS.length
    ];
  return {
    technique,
    dailyKey: technique.key,
    weeklyTheme,
    monthlyFocus,
    cooldownNote: `Cool-down: ${technique.minutes} min ${technique.name}. ${technique.instructions}`,
  };
}

// ---------- 1b. DAY OFF PROTOCOL (picked rest days) ----------
// Planning contains no current safety clearance; use the shared no-exercise guide.
export interface DayOffProtocol {
  title: string;
  minutes: number;
  zone: string;
  description: string;
}

export function dayOffProtocol(_date: Date): DayOffProtocol {
  return { title: "Recovery Day — Rest", minutes: 0, zone: "z1", description: dayOffProtocolText("en") };
}

// ---------- 1c. TRAINING TIME-OF-DAY (athlete-picked window) ----------
// A preferred training window (morning/midday/evening) maps to a default
// start time for each session. The athlete can then fine-tune any single
// session's startTime from the calendar. "any" = flexible (no fixed time).
export const TRAINING_WINDOWS = [
  { key: "any", label: "Flexible — no fixed time", startTime: null },
  { key: "morning", label: "Morning", startTime: "06:30" },
  { key: "midday", label: "Midday", startTime: "12:30" },
  { key: "evening", label: "Evening", startTime: "18:00" },
] as const;

export type TrainingWindow = (typeof TRAINING_WINDOWS)[number]["key"];

export function defaultStartTime(window?: string | null): string | null {
  return TRAINING_WINDOWS.find((w) => w.key === window)?.startTime ?? null;
}

// ---------- 1b. NEUROMUSCULAR READINESS (CMJ gate) ----------
// Morning CMJ vs baseline: >8% drop = neuromuscular fatigue → convert intensity
// to skill work. Grounding: CMJ tracks punch output in boxers (Loturco 2016);
// jump performance is a standard fatigability monitor (Jordan/Plantiga practice;
// Muñoz-López 2024 review uses CMJ as the boxers' neuromuscular measure).
export interface CmjReadiness {
  status: "green" | "amber" | "red";
  advice: string;
}

export function cmjReadiness(
  todayCm: number,
  baselineCm: number,
): CmjReadiness {
  const drop = (baselineCm - todayCm) / baselineCm; // positive = worse
  if (drop >= 0.08) {
    return {
      status: "red",
      advice: `CMJ down ${Math.round(drop * 100)}% vs baseline — neuromuscular fatigue. Convert today's intensity/bag rounds to skill work (shadow technique, footwork, film review). Keep volume low (Loturco 2016: CMJ tracks punch output; a tired CNS throws slow punches and builds bad patterns).`,
    };
  }
  if (drop >= 0.04) {
    return {
      status: "amber",
      advice: `CMJ down ${Math.round(drop * 100)}% — borderline. Warm up, re-test after the warm-up; if it recovers, train as planned but cap explosive work at 80% volume.`,
    };
  }
  return {
    status: "green",
    advice: `CMJ within ${Math.round(drop * 100)}% of baseline${drop < 0 ? ` (up ${Math.abs(Math.round(drop * 100))}%)` : ""} — CNS is fresh. Full intensity green light: reactive rounds, sprint and power work all on.`,
  };
}

// ---------- 2. RACE TEMPERATURE ADJUSTMENT ----------
// Heat degrades sustained pace; adjust pacing + volume + hydration.
// Cold has a milder, opposite effect. (Ely 2007; Casa 2000.)

export interface TempAdjustment {
  tempC: number;
  category: "cold" | "cool" | "mild" | "warm" | "hot" | "extreme";
  paceFactor: number; // multiply target pace (seconds) by this
  volumeFactor: number; // multiply session duration by this
  hydrationFactor: number; // multiply fluid target by this
  advice: string;
}

export function temperatureAdjustment(tempC: number): TempAdjustment {
  // piecewise: baseline neutral 10-18°C
  let paceFactor = 1,
    volumeFactor = 1,
    hydrationFactor = 1,
    category: TempAdjustment["category"] = "mild",
    advice = "";
  if (tempC <= 0) {
    category = "cold";
    paceFactor = 0.98;
    volumeFactor = 0.95;
    hydrationFactor = 1.0;
    advice =
      "Cold — warm up longer, dress in layers, watch grip on wet roads. Keep intensity; shorten exposure.";
  } else if (tempC <= 10) {
    category = "cool";
    paceFactor = 0.99;
    volumeFactor = 1.0;
    hydrationFactor = 1.0;
    advice =
      "Cool — near-ideal for endurance. No adjustment beyond normal hydration.";
  } else if (tempC <= 18) {
    category = "mild";
    paceFactor = 1.0;
    volumeFactor = 1.0;
    hydrationFactor = 1.0;
    advice = "Mild — optimal range. Train as prescribed.";
  } else if (tempC <= 24) {
    category = "warm";
    paceFactor = 1.02;
    volumeFactor = 0.97;
    hydrationFactor = 1.2;
    advice =
      "Warm — ease pace ~2%, pre-hydrate with electrolytes, schedule sessions for shade/morning.";
  } else if (tempC <= 30) {
    category = "hot";
    paceFactor = 1.05;
    volumeFactor = 0.9;
    hydrationFactor = 1.5;
    advice =
      "Hot — cut volume ~10%, drop pace ~5%, drink 500-750ml/h with sodium. Heat acclimation sessions count.";
  } else {
    category = "extreme";
    paceFactor = 1.1;
    volumeFactor = 0.75;
    hydrationFactor = 2.0;
    advice =
      "Extreme heat — move indoors or to early morning. If outside: 25% volume cut, pace by RPE not target, ice slurry + 750ml+/h fluids.";
  }
  return { tempC, category, paceFactor, volumeFactor, hydrationFactor, advice };
}

// ---------- 3. LEGACY TEST SCHEDULING (disabled; reviews live in the cycle) ----------
export interface ScheduledTest {
  date: Date;
  type:
    | "ftp"
    | "lthr"
    | "cp"
    | "run5k"
    | "swim"
    | "run1k"
    | "run200m"
    | "run400m"
    | "erg"
    | "strengthBench"
    | "boxing";
  name: string;
  skipped: boolean;
  reason?: string;
}

/** @deprecated Automatic test batteries are intentionally disabled. A sport-
 * appropriate test needs explicit review of suitability, recovery and the
 * existing session budget. Comfortable observations are handled by the cycle.
 * Retained as a no-op for old callers; never deletes existing test records. */
export function scheduleTests(
  _startDate: Date,
  _weeks: number,
  _races: { date: Date }[],
  _opts: { hyrox?: boolean; boxing?: boolean; trackSprint?: boolean } = {},
): ScheduledTest[] {
  return [];
}

// ---------- 4. DAILY QUESTIONNAIRE → TRAINING ADAPTATION ----------
export interface Checkin {
  sleep?: number; // 1-5 (5 = great)
  soreness?: number; // 1-5 (5 = very sore)
  motivation?: number; // 1-5
  energy?: number; // 1-5
  stress?: number; // 1-5 (5 = very stressed)
  sick?: boolean; // unknown is not a negative symptom report
  urgentSymptoms?: boolean; // current chest discomfort/fainting/severe breathlessness/confusion/collapse
  menstrual?: boolean; // female-specific flag
  mood?: number; // 1-5 (5 = great) — distinct from motivation: how you FEEL
  cycleDay?: number; // day of menstrual cycle (1-35) — enables phase-aware training
  weightKg?: number; // morning fasted weight (objective daily signal)
  rhr?: number; // morning resting HR
  rhrBaseline?: number; // 7-day avg RHR, set server-side from daily metrics
  // Device-free daily loop (Saw 2015 self-report monitoring):
  availableMin?: number; // minutes the athlete ACTUALLY has today (0 = no training window)
  newPain?: boolean; // new LOCAL pain (distinct from general soreness above)
  painLocation?: string; // where — free text, shown to coach
  painAffectsMovement?: boolean; // pain changes gait/technique → hard caution
  sessionFelt?: "easier" | "normal" | "harder"; // yesterday's session vs expected → prescription mismatch signal
}

export interface Adaptation {
  score: number; // legacy heuristic, not a measured biomarker; unavailable when scoreAvailable=false
  scoreAvailable?: boolean;
  safetyStatus?: "clear" | "unknown" | "hold" | "urgent";
  ruleId?: string;
  missingFields?: string[];
  verdict: "full" | "trim" | "easy" | "rest";
  durationFactor: number; // multiply session duration
  intensityCap: string; // e.g. "z4" — don't exceed
  message: string;
}

export function adaptSession(checkin: Checkin): Adaptation {
  const safety = resolveCheckinSafety(checkin);
  if (safety.status !== "clear") return {
    score: 0, scoreAvailable: false, verdict: "rest", durationFactor: 0, intensityCap: "z1",
    safetyStatus: safety.status, ruleId: safety.ruleId, missingFields: safety.missingFields, message: safety.message,
  };
  if (checkin.availableMin === 0) return { score: 0, scoreAvailable: false, verdict: "rest", durationFactor: 0, intensityCap: "z1", safetyStatus: "clear", ruleId: "checkin-safety-v1:no-time", message: "No training time is available today. No workout is prescribed and no missed work is added later." };
  // The safety resolver verified all subjective values before numeric scoring.
  const sleep = checkin.sleep!, soreness = checkin.soreness!, motivation = checkin.motivation!, energy = checkin.energy!, stress = checkin.stress!;
  const sick = checkin.sick;
  let score = 50;
  score += (sleep - 3) * 8; // ±16
  score -= (soreness - 3) * 6; // ±12
  score += (energy - 3) * 8; // ±16
  score += (motivation - 3) * 4; // ±8
  if (checkin.mood) score += (checkin.mood - 3) * 4; // ±8
  score -= (stress - 3) * 5; // ±10
  // Menstrual phase does NOT auto-penalize readiness (McNulty et al. 2020:
  // trivial average performance effect across phases; responses are
  // individual). Symptoms the athlete actually reports — soreness, fatigue,
  // poor sleep, stress — already flow through their own weights above. The
  // cycle phase note is contextual guidance only (cycle-tracking.ts).
  if (sick) score -= 40;
  // Objective morning signals: elevated RHR = recovery lagging (Plews 2013),
  // low RHR = recovered. ±6 bpm vs the 7-day baseline.
  if (checkin.rhr && checkin.rhrBaseline) {
    const rhrDelta = checkin.rhr - checkin.rhrBaseline;
    if (rhrDelta > 6) score -= 10;
    else if (rhrDelta < -6) score += 4;
  }
  // Prescription-mismatch signal: yesterday felt HARDER than expected → the
  // current dose may be too big (small dip; "easier" never escalates — no
  // single positive signal raises intensity, engine rule).
  if (checkin.sessionFelt === "harder") score -= 5;
  score = Math.max(0, Math.min(100, score));

  let verdict: Adaptation["verdict"],
    durationFactor: number,
    intensityCap: string,
    message: string;
  if (sick || score < 25) {
    verdict = "rest";
    durationFactor = 0;
    intensityCap = "z1";
    message =
      "Rest today. No structured workout is prescribed; reassess how you feel before resuming training.";
  } else if (score < 45) {
    verdict = "easy";
    durationFactor = 0.6;
    intensityCap = "z2";
    message =
      "Easy day. Keep the habit but drop intensity to Z2 and ~60% duration. Sleep is the priority tonight.";
  } else if (score < 65) {
    verdict = "trim";
    durationFactor = 0.85;
    intensityCap = "z4";
    message =
      "Trim the last interval set. Do the main work, cap intensity at threshold, extend the warm-up.";
  } else {
    verdict = "full";
    durationFactor = 1;
    intensityCap = "z7";
    message =
      "Your reported recovery does not call for an additional reduction. Follow the existing plan and stop if symptoms appear; this score does not authorize extra intensity.";
  }
  return { score, scoreAvailable: true, verdict, durationFactor, intensityCap, message, safetyStatus: "clear", ruleId: `${safety.ruleId}:${verdict}` };
}

// ---------- 4b. HYDRATION & WEIGHT ANALYSIS (uses the data, doesn't just store it) ----------
// Pre/post session weight → sweat loss (1 kg ≈ 1 L). >2% = dehydration flag
// (Casa et al. 2000), >3% = severe — back off tomorrow.
export interface HydrationStatus {
  preKg: number;
  postKg: number;
  lossKg: number;
  pct: number;
  flag: "ok" | "high" | "severe";
  advice: string;
}

export function analyzeHydration(
  preKg: number,
  postKg: number,
): HydrationStatus {
  const lossKg = Math.max(0, Math.round((preKg - postKg) * 100) / 100);
  const pct = preKg > 0 ? Math.round((lossKg / preKg) * 1000) / 10 : 0;
  let flag: HydrationStatus["flag"] = "ok";
  let advice =
    lossKg > 0.3
      ? `Lost ${lossKg} L sweat this session — that's your sweat rate. Replace with fluids + electrolytes.`
      : "Sweat loss within limits — hydrate normally.";
  if (pct > 3) {
    flag = "severe";
    advice = `Lost ${pct}% of body weight (${lossKg} L) — significant dehydration. Replace 150% of the loss with fluids + electrolytes over the next 2h and ease tomorrow's intensity.`;
  } else if (pct > 2) {
    flag = "high";
    advice = `Lost ${pct}% of body weight (${lossKg} L). Drink 1.5× the loss in the next 2h with sodium.`;
  }
  return { preKg, postKg, lossKg, pct, flag, advice };
}

// Morning weight trend: last 3 vs previous mornings. ±1.5% = flag (up = likely
// overhydration/under-fuelling/inflammation; down = dehydration/fuel deficit).
export interface WeightTrend {
  deltaPct: number;
  flag: "ok" | "up" | "down";
  advice: string;
}

export function morningWeightTrend(
  weights: { date: Date; weightKg: number | null }[],
): WeightTrend | null {
  const vals = weights
    .filter((w) => w.weightKg)
    .map((w) => w.weightKg as number);
  if (vals.length < 4) return null;
  const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const recent = avg(vals.slice(-3));
  const prior = avg(vals.slice(0, -3));
  const deltaPct = Math.round(((recent - prior) / prior) * 1000) / 10;
  let flag: WeightTrend["flag"] = "ok";
  let advice = `Weight stable (${deltaPct >= 0 ? "+" : ""}${deltaPct}% vs last week).`;
  if (deltaPct > 1.5) {
    flag = "up";
    advice = `Weight up ${deltaPct}% vs last week — often overhydration, under-fuelling or inflammation. Keep carbs consistent and re-check in 3 days.`;
  } else if (deltaPct < -1.5) {
    flag = "down";
    advice = `Weight down ${deltaPct}% — possible dehydration or fuel deficit. Hydrate and eat at maintenance.`;
  }
  return { deltaPct, flag, advice };
}

// ---------- 5. FUEL, STIMULANTS & ERGOGENIC AIDS ----------
export interface FuelPlan {
  carbsPerHourG: number;
  sodiumMgPerHour: number;
  fluidMlPerHour: number;
  kcalPerHour?: number;
  caffeineMg?: number;
  notes: string;
}

export function recommendFuel(opts: {
  durationMin: number;
  intensity: string;
  heatFactor?: number;
  ergosIncludeCaffeine?: boolean;
}): FuelPlan {
  const { durationMin, intensity } = opts;
  const heat = opts.heatFactor ?? 1;
  const hard =
    intensity === "z4" ||
    intensity === "z5" ||
    intensity === "z6" ||
    intensity === "z7" ||
    intensity === "interval" ||
    intensity === "threshold";
  let carbsPerHourG = 0,
    sodiumMgPerHour = 0,
    fluidMlPerHour = 0,
    caffeineMg: number | undefined;
  const notes: string[] = [];
  if (durationMin < 60) {
    carbsPerHourG = 0;
    fluidMlPerHour = Math.round(500 * heat);
    notes.push("Under 60 min — water only; no fuel needed.");
  } else if (durationMin < 90) {
    carbsPerHourG = 30;
    sodiumMgPerHour = 400;
    fluidMlPerHour = Math.round(600 * heat);
    notes.push("30g carbs/h (one gel or 500ml sports drink).");
  } else {
    carbsPerHourG = 60;
    sodiumMgPerHour = 700;
    fluidMlPerHour = Math.round(750 * heat);
    notes.push(
      "60g carbs/h, work up to 90g/h on race day (glucose:fructose 2:1).",
    );
  }
  if (hard && durationMin >= 45 && !opts.ergosIncludeCaffeine) {
    caffeineMg = 150;
    notes.push(
      "Caffeine 150mg 45-60 min pre-session (3 mg/kg personalizable).",
    );
  } else if (hard && durationMin >= 45) {
    notes.push(
      "Caffeine already covered in your ergogenic picks — same pre-session timing.",
    );
  }
  return {
    carbsPerHourG,
    sodiumMgPerHour,
    fluidMlPerHour,
    caffeineMg,
    notes: notes.join(" "),
  };
}

export interface ErgoOption {
  key: string;
  name: string;
  evidence: "A" | "B" | "C";
  dose: string;
  when: string;
  benefit: string;
  caution?: string;
}

export const ERGOGENIC_LIBRARY: ErgoOption[] = [
  {
    key: "caffeine",
    name: "Caffeine",
    evidence: "A",
    dose: "3-6 mg/kg (~200-400mg)",
    when: "45-60 min pre-workout",
    benefit:
      "Lowers perceived exertion, improves endurance + high-intensity output (Goldstein 2010).",
    caution: "Late-day use can impair sleep — stop by ~2pm.",
  },
  {
    key: "citrulline",
    name: "L-Citrulline Malate",
    evidence: "A",
    dose: "6-8 g (2:1 malate) or 3g citrulline",
    when: "60 min pre-workout",
    benefit:
      "Increases nitric oxide availability, reduces fatigue in high-volume and strength sessions; complements beetroot (Bailey 2015, Pérez-Guisado 2010).",
    caution: "Can cause mild GI upset — start with half dose.",
  },
  {
    key: "nitrate",
    name: "Beetroot / Nitrate",
    evidence: "A",
    dose: "6-8 mmol (~400-500mg nitrate)",
    when: "2-3 h pre-workout, or 6 days loading",
    benefit: "Improves efficiency + endurance; lowers O2 cost (Jones 2018).",
    caution:
      "Avoid antibacterial mouthwash — kills the oral bacteria that convert nitrate.",
  },
  {
    key: "creatine",
    name: "Creatine Monohydrate",
    evidence: "A",
    dose: "3-5 g/day",
    when: "Any time, daily",
    benefit:
      "Power, strength, repeat-sprint + recovery; small endurance benefit. 2025 umbrella review of 61 RCT meta-analyses: best-evidenced supplement in sport (Ashtary-Larky 2025). Also counters age-related anabolic resistance in masters athletes.",
    caution:
      "Expect ~1kg water-weight gain during loading. 2025 safety review: no adverse effects on kidney/liver function in healthy people across the lifespan (Kreider 2025). Monohydrate only — other forms are pricier without better evidence.",
  },
  {
    key: "betaAlanine",
    name: "Beta-Alanine",
    evidence: "A",
    dose: "3.2-6.4 g/day (split doses)",
    when: "Daily, with food",
    benefit: "Buffers acidosis for 1-4 min efforts (swim/bike/run surges).",
    caution: "Causes harmless skin tingling (paresthesia).",
  },
  {
    key: "bicarb",
    name: "Sodium Bicarbonate",
    evidence: "A",
    dose: "0.2-0.3 g/kg",
    when: "90-150 min pre-race (not daily)",
    benefit: "Buffers high-intensity efforts (800m swim, sprint finish).",
    caution: "GI distress risk — test in training first, never on race day.",
  },
  {
    key: "choline",
    name: "Alpha-GPC / Citicoline",
    evidence: "B",
    dose: "300 mg alpha-GPC (or 250-500 mg citicoline)",
    when: "60 min pre-session (acute) or daily (chronic)",
    benefit:
      "Acetylcholine precursor — the neurotransmitter of reaction time and motor-unit recruitment. Punch sports burn ACh at high rates; supplementation supports cognitive speed under fatigue and may enhance power output (Bellar 2015; ISSN combat 2025).",
    caution: "Mild headache in a minority — start at half dose.",
  },
  {
    key: "phosphate",
    name: "Sodium Phosphate",
    evidence: "B",
    dose: "3-5 g/day, 3-6 days",
    when: "Loading block pre-race",
    benefit: "Modest VO2max/efficiency gain (B evidence).",
    caution: "Lower priority than the Group A list.",
  },
  // ---- RECOVERY STACK (2026 meta-analyses) ----
  {
    key: "tartCherry",
    name: "Tart Cherry (Montmorency)",
    evidence: "B",
    dose: "30 ml concentrate ×2/day (or 480 mg extract)",
    when: "Start 4-5 days pre-competition; continue 2-3 days after",
    benefit:
      "Anthocyanins speed muscle-function recovery and reduce soreness after hard bouts — 2026 meta-analyses of RCTs confirm recovery benefit (Hagele 2026; Kim 2026). Most useful for multi-day competition or back-to-back hard sessions.",
    caution:
      "Contains ~30 g sugar per 30 ml concentrate. Not a daily supplement — use around competition blocks only.",
  },
  {
    key: "collagen",
    name: "Collagen Peptides + Vitamin C",
    evidence: "B",
    dose: "15 g hydrolyzed collagen + 50 mg vitamin C",
    when: "30-60 min BEFORE training (needs elevated blood amino acids DURING loading)",
    benefit:
      "Provides glycine/proline building blocks for tendon and ligament repair when combined with mechanical loading — increases tendon cross-sectional area in RCTs (Bischof 2024; Baar 2017). Targets connective tissue, not muscle.",
    caution:
      "Timing matters: it must be taken before loading, not after. Not a substitute for dietary protein.",
  },
];

export interface SupplementPrefs {
  enabled: boolean; // master switch (user can turn ALL off)
  likes: string[]; // keys the user liked
  dislikes: string[]; // keys the user rejected
  optsOut: string[]; // keys the user explicitly stopped
}

export function recommendErgogenics(
  prefs: SupplementPrefs,
  session: {
    sport: string;
    type: string;
    durationMin: number;
    intensity?: string;
  },
): { recommended: ErgoOption[]; reason: string } {
  if (!prefs.enabled)
    return {
      recommended: [],
      reason:
        "Ergogenic aids are off. Turn them back on anytime — nothing is pushed on you.",
    };
  const hard =
    session.type === "interval" ||
    session.type === "threshold" ||
    session.intensity === "z4" ||
    session.intensity === "z5" ||
    session.intensity === "z6" ||
    session.intensity === "z7";
  const long = session.durationMin >= 90;
  const strength = session.sport === "strength";
  const shortIntense =
    session.sport === "swim" || session.sport === "run"
      ? session.type === "interval" || session.type === "threshold"
      : false;

  const picks: ErgoOption[] = [];
  if (hard || long)
    picks.push(ERGOGENIC_LIBRARY.find((e) => e.key === "caffeine")!);
  if (long) picks.push(ERGOGENIC_LIBRARY.find((e) => e.key === "nitrate")!);
  if (strength || shortIntense)
    picks.push(ERGOGENIC_LIBRARY.find((e) => e.key === "creatine")!);
  if (shortIntense)
    picks.push(ERGOGENIC_LIBRARY.find((e) => e.key === "betaAlanine")!);
  if (strength || session.type === "volume" || session.durationMin >= 75)
    picks.push(ERGOGENIC_LIBRARY.find((e) => e.key === "citrulline")!);
  if (session.type === "test" || session.type === "race")
    picks.push(ERGOGENIC_LIBRARY.find((e) => e.key === "bicarb")!);

  // Combat recommendations concern performance, never protection from head impacts.
  if (session.sport === "boxing") {
    picks.push(ERGOGENIC_LIBRARY.find((e) => e.key === "creatine")!); // repeated-effort power
    picks.push(ERGOGENIC_LIBRARY.find((e) => e.key === "choline")!); // reaction speed
    if (!shortIntense)
      picks.push(ERGOGENIC_LIBRARY.find((e) => e.key === "betaAlanine")!); // 1-4 min round buffering
  }

  // Explicit per-item opt-in; an enabled master switch is not supplement consent.
  const liked = picks.filter((e) => prefs.likes.includes(e.key));
  const filtered = liked.filter(
    (e, index, list) => supplementAllowed(e.key, prefs) && list.findIndex(x => x.key === e.key) === index,
  );

  const reason = filtered.length
    ? `Picks matched to this ${session.sport} ${session.type} session; your prior likes/dislikes are respected.`
    : "No aids match this session (or you've opted out of the relevant ones).";
  return { recommended: filtered, reason };
}

export function applySupplementFeedback(
  prefs: SupplementPrefs,
  key: string,
  feedback: "like" | "dislike" | "stop",
): SupplementPrefs {
  const next: SupplementPrefs = {
    ...prefs,
    likes: prefs.likes.filter((k) => k !== key),
    dislikes: prefs.dislikes.filter((k) => k !== key),
    optsOut: prefs.optsOut.filter((k) => k !== key),
  };
  if (feedback === "like") next.likes.push(key);
  else if (feedback === "dislike") next.dislikes.push(key);
  else if (feedback === "stop") next.optsOut.push(key);
  return next;
}

// ---------- 6. WEIGHT (pre/post) → HYDRATION & SWEAT RATE ----------
export interface WeightHydration {
  weightLossKg: number;
  weightLossPct: number;
  sweatRateLPerH: number;
  fluidToReplaceMl: number;
  status: "ok" | "dehydrated" | "severe";
  advice: string;
}

export function hydrationFromWeight(
  preKg: number,
  postKg: number,
  durationMin: number,
  fluidConsumedMl = 0,
): WeightHydration {
  const loss = Math.max(0, preKg - postKg);
  const pct = preKg > 0 ? (loss / preKg) * 100 : 0;
  const hours = Math.max(durationMin / 60, 0.25);
  const totalSweatL = loss + fluidConsumedMl / 1000;
  const sweatRate = totalSweatL / hours;
  const status: WeightHydration["status"] =
    pct > 3 ? "severe" : pct > 2 ? "dehydrated" : "ok";
  const advice =
    status === "severe"
      ? `Severe fluid loss (${pct.toFixed(1)}%). Replace 150% of lost weight (${Math.round(loss * 1500)}ml) over the next 2h with electrolytes. Flag for tomorrow's plan.`
      : status === "dehydrated"
        ? `Dehydrated (${pct.toFixed(1)}%). Replace ~${Math.round(loss * 1250)}ml with sodium within 2h.`
        : `Hydration on point (<2% loss). Replace ~${Math.round(loss * 1000)}ml to be safe.`;
  return {
    weightLossKg: Math.round(loss * 100) / 100,
    weightLossPct: Math.round(pct * 10) / 10,
    sweatRateLPerH: Math.round(sweatRate * 100) / 100,
    fluidToReplaceMl: Math.round(
      loss *
        (status === "severe" ? 1500 : status === "dehydrated" ? 1250 : 1000),
    ),
    status,
    advice,
  };
}

// ---------- 7. RACE VENUE (elevation / terrain / water) ----------
export interface VenueProfile {
  targetTempC?: number;
  humidity?: number; // % — folded into heat index
  baseElevM?: number; // venue base elevation (thin-air altitude)
  bikeElevM?: number; // total climb on the bike leg
  bikeTerrain?: string; // flat | rolling | hilly | mountain
  runElevM?: number; // total climb on the run leg
  runTerrain?: string; // flat | rolling | hilly | trail
  swimVenue?: string; // pool | lake | ocean | river
  waterTempC?: number;
  swimCurrent?: string; // none | mild | strong
  federation?: string;  // USAT | WORLD_TRIATHLON | BRITISH_TRIATHLON | IRONMAN
  category?: string;    // age_group | elite (wetsuit rules differ)
}

export interface DisciplineNote {
  label: string;
  detail: string;
  training: string; // what to change in training
}

export interface VenueAdjustment {
  bike: DisciplineNote;
  run: DisciplineNote;
  swim: DisciplineNote;
  heat?: TempAdjustment;
  altitude?: { vo2factor: number; paceFactor: number; advice: string };
  wetsuit: { legal: boolean | "optional"; waterTempC?: number; note: string };
  overall: string;
}

function terrainNote(
  terrain?: string,
  elevM?: number,
): { detail: string; training: string } {
  const elev = elevM ?? 0;
  const t = (terrain || "").toLowerCase();
  if (t === "trail")
    return {
      detail: `Trail terrain, ${elev}m gain.`,
      training:
        "Trail runs, technical descents, ankle stability work. Road pace doesn't transfer — train on similar surface.",
    };
  if (t === "mountain" || elev > 1500)
    return {
      detail: `Mountainous / ${elev}m climb.`,
      training:
        "Big climbing blocks, low gearing, practice long descents — bike handling under fatigue is the skill.",
    };
  if (t === "hilly" || elev > 800)
    return {
      detail: `Hilly / ${elev}m climb.`,
      training:
        "Weekly hill repeats + climbing intervals; train gearing and momentum, not just power.",
    };
  if (t === "rolling" || elev > 300)
    return {
      detail: `Rolling / ${elev}m climb.`,
      training:
        "Variable-power work: short surges over rollers, keep momentum through transitions.",
    };
  return {
    detail: `Flat / ${elev || 0}m climb.`,
    training:
      "Aero/steady-state work; prioritize sustained power over climbing.",
  };
}

export function venueAdjustment(v: VenueProfile): VenueAdjustment {
  const bike = terrainNote(v.bikeTerrain, v.bikeElevM);
  const run = terrainNote(v.runTerrain, v.runElevM);

  const swimVenue = (v.swimVenue || "pool").toLowerCase();
  const swimNote: DisciplineNote = { label: "Swim", detail: "", training: "" };
  if (swimVenue === "ocean" || swimVenue === "lake" || swimVenue === "river") {
    const current =
      v.swimCurrent === "strong"
        ? "strong current"
        : v.swimCurrent === "mild"
          ? "mild current"
          : "no significant current";
    swimNote.detail = `Open water (${swimVenue}) — ${current}.`;
    swimNote.training =
      "Open-water sessions: sighting every 4-6 strokes, drafting, buoy turns. Pool fitness does not transfer without open-water practice.";
    if (swimVenue === "ocean")
      swimNote.training += " Add surf entry/exit practice if applicable.";
  } else {
    swimNote.detail = "Pool swim — controlled conditions.";
    swimNote.training =
      "Train in the pool; add open-water skills only if the venue changes.";
  }

  let heat: TempAdjustment | undefined;
  if (v.targetTempC !== undefined) {
    const effective =
      v.humidity !== undefined
        ? heatIndex(v.targetTempC, v.humidity)
        : v.targetTempC;
    heat = temperatureAdjustment(effective);
  }

  let altitude:
    | { vo2factor: number; paceFactor: number; advice: string }
    | undefined;
  if (v.baseElevM !== undefined) altitude = altitudeFactor(v.baseElevM);

  // Wetsuit legality — federation-specific per the 2026-09-08 adjudication
  // (Conflict 5, CRITICAL SAFETY). The old single ITU-style cutoff was
  // rejected: it could DQ an athlete or talk a weaker swimmer out of a
  // legal, safety-enhancing wetsuit. Bands live in src/lib/wetsuit.ts with
  // citations and a standing "verify current rulebook" flag.
  let wetsuit: VenueAdjustment["wetsuit"] = {
    legal: false,
    note: "Not applicable — no water temperature set.",
  };
  if (v.waterTempC !== undefined) {
    const wd = wetsuitVerdict(v.waterTempC, {
      federation: v.federation,
      category: v.category,
    });
    wetsuit = {
      legal: wd.legal,
      waterTempC: v.waterTempC,
      note: `${wd.note} [${wd.citation} — VERIFY against the current rulebook.]`,
    };
  }

  const overall = [
    heat
      ? `Race temp ~${heat.tempC}°C${v.humidity !== undefined ? ` (feels like, ${v.humidity}% RH)` : ""} (${heat.category}) — ${heat.advice}`
      : null,
    altitude ? `Altitude: ${altitude.advice}` : null,
    `Bike: ${bike.detail}`,
    `Run: ${run.detail}`,
    `Swim: ${swimNote.detail}`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    bike: { label: "Bike", ...bike },
    run: { label: "Run", ...run },
    swim: swimNote,
    heat,
    altitude,
    wetsuit,
    overall,
  };
}

// ---------- POST-WORKOUT RECOVERY FUELING ----------
// The 30-60 min window after training: carbs to refill glycogen, protein for
// repair, electrolytes + fluid to rehydrate (Thomas 2016; Kerksick 2017).
export interface PostWorkoutFuel {
  carbsG: number | null;
  proteinG: number | null;
  ratio: string; // carb:protein
  sodiumMg: number | null;
  fluidMl: number | null;
  window: string;
  examples: string;
  notes: string;
}

export function postWorkoutFuel(opts: {
  durationMin: number;
  intensity: string;
  heatFactor?: number;
  sport?: string;
  weightKg?: number | null;
}): PostWorkoutFuel {
  const fuel = postFuelPersonalized(opts);
  return {
    carbsG: fuel.carbsG, proteinG: fuel.proteinG, ratio: fuel.ratio,
    sodiumMg: null, fluidMl: null,
    window: "After training, with normal meal timing adapted to the next session",
    examples: "Choose familiar carbohydrate and protein foods compatible with your dietary needs.",
    notes: fuel.note + " Fluid and sodium totals are unavailable without measured losses and relevant conditions. Drink according to thirst; extra sodium does not protect against overdrinking.",
  };
}

// ---------- DAILY PRESCRIPTION (the "don't think, just execute" step) ----------
// After the morning check-in, build the athlete's ACTUAL session for today:
// exact warm-up / main set / cool-down / breathing, scaled by recovery verdict,
// calendar busy time, and their own HR/power baselines. Science-backed detail
// comes from buildSessionDetail (WU/CD templates, main-set generator).
import { buildSessionDetail } from "./science";
import {
  structuredSteps,
  cycleMovementSteps,
  stepsText,
  zoneTargets,
  type WorkoutStep,
} from "./prescription";

export interface DailyPrescription {
  protocol?: ProtocolSpec;
  intensity: string;
  type: string;
  steps: WorkoutStep[];
  title: string;
  sport: string;
  durationMin: number;
  startTime?: string | null; // "HH:mm" when a fixed session time is scheduled
  verdict: string;
  detail: {
    wu: string;
    main: string;
    cd: string;
    breathing: string;
    study: string;
  };
  targets: { hr?: string; power?: string; pace?: string; effort?: string; rpe: number };
  scaled: { originalMin: number; factor: number; reason: string };
  sources: string[];
}

export function prescribeToday(opts: {
  session: {
    sport: string;
    title: string;
    type: string;
    intensity?: string | null;
    durationMin: number;
    description?: string | null;
    startTime?: string | null;
    variantSeed?: number;
    cycleVersion?: string;
    protocol?: ProtocolSpec;
  };
  adaptation: { verdict: string; durationFactor: number; intensityCap: string };
  busyNote?: string | null;
  busyHrs?: number;
  // Available time for THIS session — enforced at the very END, after the
  // readiness factors and the coach intensity multiplier, so no combination
  // of settings can exceed what the athlete actually has (review finding:
  // 120% multiplier turned a 30-min limit into 38 min).
  timeBudgetMin?: number;
  profile?: {
    lthr?: number | null;
    ftp?: number | null;
    runPaceBase?: number | null;
    intensityPct?: number | null; // coach-set multiplier % (null/100 = as planned)
  } | null;
}): DailyPrescription {
  let session = opts.session;
  const profile = opts.profile;
  // Coach intensity multiplier folds into the same factors as the daily
  // check-in: <100 eases (caps zones stepwise, trims duration), >100 sharpens
  // (raises the planned zone by at most 2, modestly extends duration). A rest
  // verdict stays a rest verdict — the coach multiplier never overrides it.
  let { adaptation } = opts;
  const pct = profile?.intensityPct;
  if (pct != null && pct !== 100 && adaptation.verdict !== "rest" && (pct < 100 || session.cycleVersion !== "bounded-cycle-v1")) {
    const plannedZone = Number((session.intensity || "z2").slice(1)) || 2;
    const autoCap = Number(adaptation.intensityCap.slice(1)) || 2;
    if (pct < 100) {
      const shift = Math.min(2, Math.floor((100 - pct) / 20)); // 80% → -1 zone, 60% → -2
      adaptation = {
        ...adaptation,
        durationFactor: adaptation.durationFactor * Math.max(0.6, pct / 100),
        intensityCap: "z" + Math.max(1, Math.min(plannedZone - shift, autoCap)),
      };
    } else {
      const bump = Math.min(2, Math.floor((pct - 100) / 10)); // 110% → +1 zone, 120% → +2
      if (bump > 0) {
        // Raise the effective planned zone itself — the cap is only a ceiling,
        // so it could never push a session up.
        session = { ...session, intensity: "z" + Math.min(7, plannedZone + bump) };
        adaptation = {
          ...adaptation,
          durationFactor: Math.min(adaptation.durationFactor * 1.25, 1.25),
        };
      }
    }
  }
  const rest = adaptation.verdict === "rest" || session.durationMin <= 0;
  if (session.protocol && !rest) {
    const budget = Math.min(session.durationMin * Math.min(1, adaptation.durationFactor), (opts.busyHrs || 0) >= 6 ? 25 : Infinity, opts.timeBudgetMin == null ? Infinity : Math.max(0, Math.floor(opts.timeBudgetMin)));
    const capped = Number(adaptation.intensityCap.slice(1)) < Number((session.intensity || "z2").slice(1));
    const pausePower = ["speed", "power", "anaerobic-capacity"].includes(session.protocol.id) && adaptation.verdict !== "full";
    if (!capped && !pausePower && adaptation.verdict !== "easy") {
      try {
        const p = buildProtocol(session.protocol, budget);
        return { ...p, title: session.title, startTime: session.startTime, verdict: adaptation.verdict, scaled: { ...p.scaled, originalMin: session.durationMin, factor: p.durationMin / session.durationMin, reason: `Readiness: ${adaptation.verdict}. Whole bouts retained with full recovery.` } };
      } catch { /* The minimum complete dose does not fit; prescribe easy work. */ }
    }
    const easy = prescribeToday({
      ...opts,
      session: { ...session, protocol: undefined, sport: session.sport === "strength" ? "mobility" : session.sport, type: "recovery", title: "Easy movement · protocol paused" },
      adaptation: { verdict: "easy", durationFactor: Math.min(1, adaptation.durationFactor), intensityCap: "z1" },
    });
    easy.scaled.reason = "The protocol was paused because readiness or available time cannot support its complete work and recovery periods.";
    easy.detail.main = `${easy.detail.main} Use gentle, comfortable movement; no hard repetitions or loaded power work.`;
    return easy;
  }
  const originalZone = Number((session.intensity || "z2").slice(1)) || 2;
  // TIME BUDGET ENFORCED LAST: availability clamps the FINAL duration — after
  // readiness factors AND the coach multiplier (a 30-min limit stays ≤30 min
  // even at 120% intensity). Steps then regenerate inside the clamped time.
  const durationMin = (() => {
    const d = rest
      ? 0
      : Math.max(
          1,
          Math.min(
            (opts.busyHrs || 0) >= 6 ? 25 : Infinity,
            Math.round(session.durationMin * adaptation.durationFactor),
          ),
        );
    return opts.timeBudgetMin != null
      ? Math.min(d, Math.max(0, Math.round(opts.timeBudgetMin)))
      : d;
  })();
  const intensity =
    "z" + Math.min(originalZone, Number(adaptation.intensityCap.slice(1)) || 2);
  const type = rest
    ? "recovery"
    : ["strength", "mobility", "hyrox", "boxing"].includes(session.sport)
      ? session.type
      : intensity === "z1"
        ? "recovery"
        : Number(intensity.slice(1)) <= 2
          ? "endurance"
          : session.type;
  const steps = session.cycleVersion === "bounded-cycle-v1" && ["strength", "hyrox", "mobility"].includes(session.sport)
    ? cycleMovementSteps(durationMin, intensity, session.title)
    : structuredSteps(
    durationMin,
    intensity,
    type,
    session.variantSeed,
    session.sport,
  );
  // Per-step considered metrics: every step carries the targets that govern
  // it — zone + HR (LTHR-based) + pace (run) or power (bike) — same math as
  // the session-level targets, applied per step zone.
  const stepsWithTargets = steps.map((s) => ({
    ...s,
    targets: rest ? undefined : zoneTargets(s.zone, session.sport, profile),
  }));
  const detail = buildSessionDetail({
    sport: session.sport,
    type,
    zone: intensity,
    minutes: durationMin,
    description: "",
  });
  detail.wu = steps.length
    ? `Warm up for ${steps[0].seconds / 60} min at Z1.`
    : "No warm-up needed.";
  detail.main = rest
    ? "Rest today. The planned hard session is paused."
    : `${session.cycleVersion === "bounded-cycle-v1" && session.description ? `${session.description} ` : ""}${stepsText(steps)}`;
  detail.cd = steps.length
    ? `Cool down for ${steps[steps.length - 1].seconds / 60} min at Z1.`
    : "Resume training after reassessing readiness.";
  if (session.cycleVersion === "bounded-cycle-v1") {
    detail.breathing = "Optional: a brief comfortable breathing pause to focus. No breath holds, recovery-score bonus or guaranteed physiological effect.";
    detail.study = "Conservative JMM planning template. Exact session dose and progression are coaching choices, not an individually validated result.";
  }
  return {
    title: rest ? "Rest and recover" : session.title,
    sport: session.sport,
    durationMin,
    intensity,
    type,
    steps: stepsWithTargets,
    startTime: session.startTime ?? null,
    verdict: adaptation.verdict,
    detail,
    targets: rest ? { rpe: 0 } : zoneTargets(intensity, session.sport, profile),
    scaled: {
      originalMin: session.durationMin,
      factor: session.durationMin ? durationMin / session.durationMin : 0,
      reason: `Readiness: ${adaptation.verdict}${(opts.busyHrs || 0) >= 6 ? "; limited by calendar availability" : ""}`,
    },
    sources: session.cycleVersion === "bounded-cycle-v1" ? [] : ["Seiler 2009", "Plews 2013"],
  };
}

// ---------- PROGRESSION OVERSIGHT ----------
// Summarizes adherence. Completion alone cannot justify dose changes or infer adaptation.
export function progressionAdvice(
  recentWeeks: { weekStart: Date; planned: number; completed: number }[],
): {
  status: "on_track" | "push" | "deload";
  pct: number;
  message: string;
} {
  const valid = recentWeeks.filter((w) => w.planned > 0);
  if (!valid.length)
    return {
      status: "on_track",
      pct: 0,
      message:
        "Complete your first training week to unlock progression tracking.",
    };
  const planned = valid.reduce((s, w) => s + w.planned, 0);
  const completed = valid.reduce((s, w) => s + w.completed, 0);
  const pct = Math.round((completed / planned) * 100);
  const last3 = valid.slice(-3);
  const last3Pct = last3.length
    ? Math.round(
        (last3.reduce((s, w) => s + w.completed, 0) /
          last3.reduce((s, w) => s + w.planned, 0)) *
          100,
      )
    : pct;
  // Completion is adherence, not evidence of recovery or physiological adaptation.
  // No dose increase/decrease is authorized by this summary alone.
  return {
    status: "on_track",
    pct,
    message: `${last3Pct}% completion across ${last3.length} recorded week${last3.length === 1 ? "" : "s"}. ${last3Pct < 60 ? "Review missed sessions and availability with your coach." : "Review effort, recovery and performance trends before changing training load."}`,
  };
}
