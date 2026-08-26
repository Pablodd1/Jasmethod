// JasMiamiMethod — Adaptive Engine
// The "changes daily/weekly/monthly, individualized, easy to change" layer.
// Pure functions (no DB, no I/O) so everything here is unit-testable.
//
// References: Balban et al. 2023 (physiological sigh), Lehrer & Gevirtz 2014
// (HRV biofeedback / resonance breathing), Shaffer & Meehan 2020 (coherence),
// AIS Sports Supplement Framework 2021 (Group A/B), Thomas et al. 2016 (fuel),
// Casa et al. 2000 (hydration/sweat rate), Ely et al. 2007 (heat pacing).

import { heatIndex, altitudeFactor } from "./fitness";

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
  { key: "box", name: "Box Breathing", minutes: 5, instructions: "Inhale 4s → hold 4s → exhale 4s → hold 4s. Repeat for 5 min, seated, eyes closed.", mechanism: "Equal-ratio breathing upregulates parasympathetic tone (HRV) and lowers arousal." },
  { key: "sigh", name: "Physiological Sigh", minutes: 2, instructions: "Two sharp inhales through the nose (second is a top-up), then one long slow exhale through the mouth. 5-8 rounds.", mechanism: "Fastest known real-time downregulation of stress; drops HR within seconds (Balban 2023)." },
  { key: "478", name: "4-7-8 Breathing", minutes: 4, instructions: "Inhale 4s → hold 7s → exhale 8s (through mouth). 4-6 rounds. Best before sleep.", mechanism: "Long exhale activates the vagus nerve; sedative for pre-sleep recovery." },
  { key: "resonance", name: "Resonance Breathing", minutes: 10, instructions: "Breathe at ~5.5 breaths/min (5.5s in, 5.5s out) — no breath hold. 10 min.", mechanism: "Resonance frequency maximizes HRV amplitude; the gold-standard HRV biofeedback protocol (Lehrer 2014)." },
  { key: "nadi", name: "Alternate-Nostril Breathing", minutes: 5, instructions: "Close right nostril, inhale left; close left, exhale right; continue alternating. 5 min.", mechanism: "Nadi Shodhana balances autonomic outflow and calms sympathetic drive." },
  { key: "pmr", name: "Progressive Muscle Relaxation", minutes: 8, instructions: "Tense each muscle group 5s then release 10s, feet → calves → quads → glutes → core → hands → arms → shoulders → face.", mechanism: "Reduces muscle tone + cortisol; teaches the body the 'off' signal." },
  { key: "dive", name: "Cold Face Immersion", minutes: 3, instructions: "Splash or immerse face in cold water (<15°C) for 15-30s, 3 rounds. Breathe slowly between.", mechanism: "Mammalian dive reflex → acute bradycardia + vagal activation." },
  { key: "legs", name: "Legs-Up-The-Wall", minutes: 10, instructions: "Lie on back, legs vertical against a wall, arms wide. Slow nasal breathing. 10 min.", mechanism: "Facilitates venous return + baroreceptor reset; a passive vagal posture." },
  { key: "exhale", name: "Extended Exhale (2:1)", minutes: 5, instructions: "Inhale 3s, exhale 6s. 5 min, letting each exhale get longer than the inhale.", mechanism: "Prolonged exhalation is the most direct vagal lever; lowers HR and BP." },
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
  const technique = RECOVERY_TECHNIQUES[((di % RECOVERY_TECHNIQUES.length) + RECOVERY_TECHNIQUES.length) % RECOVERY_TECHNIQUES.length];
  const week = Math.floor(di / 7);
  const month = Math.floor(di / 30);
  const weeklyTheme = WEEKLY_THEMES[((week % WEEKLY_THEMES.length) + WEEKLY_THEMES.length) % WEEKLY_THEMES.length];
  const monthlyFocus = MONTHLY_FOCUS[((month % MONTHLY_FOCUS.length) + MONTHLY_FOCUS.length) % MONTHLY_FOCUS.length];
  return {
    technique,
    dailyKey: technique.key,
    weeklyTheme,
    monthlyFocus,
    cooldownNote: `Cool-down: ${technique.minutes} min ${technique.name}. ${technique.instructions}`,
  };
}

// ---------- 1b. DAY OFF PROTOCOL (picked rest days) ----------
// A day off is NOT zero: 20 min Z1 in any modality keeps blood flow + habit
// alive, then a breathing technique drives vagal recovery (Lehrer 2014).
export interface DayOffProtocol {
  title: string;
  minutes: number;
  zone: string;
  description: string;
}

export function dayOffProtocol(date: Date): DayOffProtocol {
  const rec = recoveryFor(date);
  return {
    title: "Day Off — 20 min Z1 + Breathing",
    minutes: 20,
    zone: "z1",
    description: `20 minutes in Zone 1 in ANY modality you enjoy (easy walk, spin, swim, stretch, yoga). Then ${rec.technique.minutes} min ${rec.technique.name}: ${rec.technique.instructions}`,
  };
}

// ---------- 2. RACE TEMPERATURE ADJUSTMENT ----------
// Heat degrades sustained pace; adjust pacing + volume + hydration.
// Cold has a milder, opposite effect. (Ely 2007; Casa 2000.)

export interface TempAdjustment {
  tempC: number;
  category: "cold" | "cool" | "mild" | "warm" | "hot" | "extreme";
  paceFactor: number;   // multiply target pace (seconds) by this
  volumeFactor: number; // multiply session duration by this
  hydrationFactor: number; // multiply fluid target by this
  advice: string;
}

export function temperatureAdjustment(tempC: number): TempAdjustment {
  // piecewise: baseline neutral 10-18°C
  let paceFactor = 1, volumeFactor = 1, hydrationFactor = 1, category: TempAdjustment["category"] = "mild", advice = "";
  if (tempC <= 0) { category = "cold"; paceFactor = 0.98; volumeFactor = 0.95; hydrationFactor = 1.0; advice = "Cold — warm up longer, dress in layers, watch grip on wet roads. Keep intensity; shorten exposure."; }
  else if (tempC <= 10) { category = "cool"; paceFactor = 0.99; volumeFactor = 1.0; hydrationFactor = 1.0; advice = "Cool — near-ideal for endurance. No adjustment beyond normal hydration."; }
  else if (tempC <= 18) { category = "mild"; paceFactor = 1.0; volumeFactor = 1.0; hydrationFactor = 1.0; advice = "Mild — optimal range. Train as prescribed."; }
  else if (tempC <= 24) { category = "warm"; paceFactor = 1.02; volumeFactor = 0.97; hydrationFactor = 1.2; advice = "Warm — ease pace ~2%, pre-hydrate with electrolytes, schedule sessions for shade/morning."; }
  else if (tempC <= 30) { category = "hot"; paceFactor = 1.05; volumeFactor = 0.9; hydrationFactor = 1.5; advice = "Hot — cut volume ~10%, drop pace ~5%, drink 500-750ml/h with sodium. Heat acclimation sessions count."; }
  else { category = "extreme"; paceFactor = 1.1; volumeFactor = 0.75; hydrationFactor = 2.0; advice = "Extreme heat — move indoors or to early morning. If outside: 25% volume cut, pace by RPE not target, ice slurry + 750ml+/h fluids."; }
  return { tempC, category, paceFactor, volumeFactor, hydrationFactor, advice };
}

// ---------- 3. SCHEDULED TESTING (every ~2 months, race-aware) ----------
export interface ScheduledTest {
  date: Date;
  type: "ftp" | "lthr" | "cp" | "run5k" | "swim" | "run1k" | "erg" | "strengthBench";
  name: string;
  skipped: boolean;
  reason?: string;
}

const TRIATHLON_TEST_TYPES: { type: ScheduledTest["type"]; name: string; cadenceDays: number }[] = [
  { type: "ftp", name: "FTP Test (20-min)", cadenceDays: 56 },
  { type: "lthr", name: "LTHR Test (30-min TT)", cadenceDays: 56 },
  { type: "cp", name: "Critical Power (3+12-min)", cadenceDays: 56 },
  { type: "run5k", name: "Run Benchmark (5k TT)", cadenceDays: 56 },
  { type: "swim", name: "Swim CSS Test (400/200)", cadenceDays: 56 },
];

const HYROX_TEST_TYPES: { type: ScheduledTest["type"]; name: string; cadenceDays: number }[] = [
  { type: "run1k", name: "1km Run TT (race pace)", cadenceDays: 56 },
  { type: "erg", name: "Erg Benchmark (Ski 1km + Row 1km)", cadenceDays: 56 },
  { type: "strengthBench", name: "Sled + Wall Ball Benchmark", cadenceDays: 56 },
];

export function scheduleTests(startDate: Date, weeks: number, races: { date: Date }[], opts: { hyrox?: boolean } = {}): ScheduledTest[] {
  const testTypes = opts.hyrox ? HYROX_TEST_TYPES : TRIATHLON_TEST_TYPES;
  const out: ScheduledTest[] = [];
  const RACE_GUARD_DAYS = 14; // skip any test within 2 weeks of a race
  const raceDates = races.map((r) => new Date(r.date).getTime());
  // stagger test types across the block so no single week is overloaded
  const stagger = [0, 14, 28, 42, 7];
  for (let i = 0; i < weeks * 7; i += 56) {
    testTypes.forEach((tt, j) => {
      const d = new Date(startDate.getTime() + (i + stagger[j % stagger.length]) * 86400000);
      const end = new Date(startDate.getTime() + weeks * 7 * 86400000);
      if (d.getTime() > end.getTime()) return;
      const nearRace = raceDates.some((r) => Math.abs(r - d.getTime()) < RACE_GUARD_DAYS * 86400000);
      const nearestRace = raceDates.reduce<number | null>((acc, r) => {
        const gap = r - d.getTime();
        if (gap < 0) return acc; // past race, ignore
        return acc === null || gap < acc ? gap : acc;
      }, null);
      out.push({
        date: d,
        type: tt.type,
        name: tt.name,
        skipped: nearRace,
        reason: nearRace ? "skipped — within 2 weeks of a race" : undefined,
      });
      if (!nearRace && nearestRace !== null && nearestRace < 56 * 86400000) {
        // leave a note when a test lands close to (but outside) the guard window
        out[out.length - 1].reason = `note — ${Math.round(nearestRace / 86400000)} days before a race; consider moving if fatigued`;
      }
    });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ---------- 4. DAILY QUESTIONNAIRE → TRAINING ADAPTATION ----------
export interface Checkin {
  sleep: number;     // 1-5 (5 = great)
  soreness: number;  // 1-5 (5 = very sore)
  motivation: number;// 1-5
  energy: number;    // 1-5
  stress: number;    // 1-5 (5 = very stressed)
  sick: boolean;     // ill/injured today
  menstrual?: boolean; // female-specific flag
}

export interface Adaptation {
  score: number;        // 0-100 readiness (lower = back off)
  verdict: "full" | "trim" | "easy" | "rest";
  durationFactor: number;   // multiply session duration
  intensityCap: string;     // e.g. "z4" — don't exceed
  message: string;
}

export function adaptSession(checkin: Checkin): Adaptation {
  const { sleep, soreness, motivation, energy, stress, sick } = checkin;
  let score = 50;
  score += (sleep - 3) * 8;      // ±16
  score -= (soreness - 3) * 6;   // ±12
  score += (energy - 3) * 8;     // ±16
  score += (motivation - 3) * 4; // ±8
  score -= (stress - 3) * 5;     // ±10
  if (checkin.menstrual) score -= 10;
  if (sick) score -= 40;
  score = Math.max(0, Math.min(100, score));

  let verdict: Adaptation["verdict"], durationFactor: number, intensityCap: string, message: string;
  if (sick || score < 25) {
    verdict = "rest"; durationFactor = 0; intensityCap = "z1";
    message = "Full rest or a 20-min Z1 flush. Training now would dig a deeper hole — protect the block.";
  } else if (score < 45) {
    verdict = "easy"; durationFactor = 0.6; intensityCap = "z2";
    message = "Easy day. Keep the habit but drop intensity to Z2 and ~60% duration. Sleep is the priority tonight.";
  } else if (score < 65) {
    verdict = "trim"; durationFactor = 0.85; intensityCap = "z4";
    message = "Trim the last interval set. Do the main work, cap intensity at threshold, extend the warm-up.";
  } else {
    verdict = "full"; durationFactor = 1; intensityCap = "z7";
    message = "Green to go. Take the key session by the horns — chase the quality.";
  }
  return { score, verdict, durationFactor, intensityCap, message };
}

// ---------- 5. FUEL, STIMULANTS & ERGOGENIC AIDS ----------
export interface FuelPlan {
  carbsPerHourG: number;
  sodiumMgPerHour: number;
  fluidMlPerHour: number;
  caffeineMg?: number;
  notes: string;
}

export function recommendFuel(opts: { durationMin: number; intensity: string; heatFactor?: number }): FuelPlan {
  const { durationMin, intensity } = opts;
  const heat = opts.heatFactor ?? 1;
  const hard = intensity === "z4" || intensity === "z5" || intensity === "z6" || intensity === "z7" || intensity === "interval" || intensity === "threshold";
  let carbsPerHourG = 0, sodiumMgPerHour = 0, fluidMlPerHour = 0, caffeineMg: number | undefined;
  const notes: string[] = [];
  if (durationMin < 60) {
    carbsPerHourG = 0; fluidMlPerHour = Math.round(500 * heat); notes.push("Under 60 min — water only; no fuel needed.");
  } else if (durationMin < 90) {
    carbsPerHourG = 30; sodiumMgPerHour = 400; fluidMlPerHour = Math.round(600 * heat); notes.push("30g carbs/h (one gel or 500ml sports drink).");
  } else {
    carbsPerHourG = 60; sodiumMgPerHour = 700; fluidMlPerHour = Math.round(750 * heat); notes.push("60g carbs/h, work up to 90g/h on race day (glucose:fructose 2:1).");
  }
  if (hard && durationMin >= 45) { caffeineMg = 150; notes.push("Caffeine 150mg 45-60 min pre-session (3 mg/kg personalizable)."); }
  return { carbsPerHourG, sodiumMgPerHour, fluidMlPerHour, caffeineMg, notes: notes.join(" ") };
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
  { key: "caffeine", name: "Caffeine", evidence: "A", dose: "3-6 mg/kg (~200-400mg)", when: "45-60 min pre-workout", benefit: "Lowers perceived exertion, improves endurance + high-intensity output (Goldstein 2010).", caution: "Late-day use can impair sleep — stop by ~2pm." },
  { key: "nitrate", name: "Beetroot / Nitrate", evidence: "A", dose: "6-8 mmol (~400-500mg nitrate)", when: "2-3 h pre-workout, or 6 days loading", benefit: "Improves efficiency + endurance; lowers O2 cost (Jones 2018).", caution: "Avoid antibacterial mouthwash — kills the oral bacteria that convert nitrate." },
  { key: "creatine", name: "Creatine Monohydrate", evidence: "A", dose: "3-5 g/day", when: "Any time, daily", benefit: "Power, strength, repeat-sprint + recovery; small endurance benefit.", caution: "Expect ~1kg water-weight gain." },
  { key: "betaAlanine", name: "Beta-Alanine", evidence: "A", dose: "3.2-6.4 g/day (split doses)", when: "Daily, with food", benefit: "Buffers acidosis for 1-4 min efforts (swim/bike/run surges).", caution: "Causes harmless skin tingling (paresthesia)." },
  { key: "bicarb", name: "Sodium Bicarbonate", evidence: "A", dose: "0.2-0.3 g/kg", when: "90-150 min pre-race (not daily)", benefit: "Buffers high-intensity efforts (800m swim, sprint finish).", caution: "GI distress risk — test in training first, never on race day." },
  { key: "phosphate", name: "Sodium Phosphate", evidence: "B", dose: "3-5 g/day, 3-6 days", when: "Loading block pre-race", benefit: "Modest VO2max/efficiency gain (B evidence).", caution: "Lower priority than the Group A list." },
];

export interface SupplementPrefs {
  enabled: boolean;          // master switch (user can turn ALL off)
  likes: string[];           // keys the user liked
  dislikes: string[];        // keys the user rejected
  optsOut: string[];         // keys the user explicitly stopped
}

export function recommendErgogenics(prefs: SupplementPrefs, session: { sport: string; type: string; durationMin: number; intensity?: string }): { recommended: ErgoOption[]; reason: string } {
  if (!prefs.enabled) return { recommended: [], reason: "Ergogenic aids are off. Turn them back on anytime — nothing is pushed on you." };
  const hard = session.type === "interval" || session.type === "threshold" || (session.intensity === "z4" || session.intensity === "z5" || session.intensity === "z6" || session.intensity === "z7");
  const long = session.durationMin >= 90;
  const strength = session.sport === "strength";
  const shortIntense = session.sport === "swim" || session.sport === "run" ? session.type === "interval" || session.type === "threshold" : false;

  const picks: ErgoOption[] = [];
  if (hard || long) picks.push(ERGOGENIC_LIBRARY.find((e) => e.key === "caffeine")!);
  if (long) picks.push(ERGOGENIC_LIBRARY.find((e) => e.key === "nitrate")!);
  if (strength || shortIntense) picks.push(ERGOGENIC_LIBRARY.find((e) => e.key === "creatine")!);
  if (shortIntense) picks.push(ERGOGENIC_LIBRARY.find((e) => e.key === "betaAlanine")!);

  // respect likes (boost), dislikes + opt-outs (remove), then re-rank by evidence
  const liked = picks.filter((e) => prefs.likes.includes(e.key));
  const neutral = picks.filter((e) => !prefs.likes.includes(e.key));
  const filtered = [...liked, ...neutral]
    .filter((e) => !prefs.dislikes.includes(e.key) && !prefs.optsOut.includes(e.key));

  const reason = filtered.length
    ? `Picks matched to this ${session.sport} ${session.type} session; your prior likes/dislikes are respected.`
    : "No aids match this session (or you've opted out of the relevant ones).";
  return { recommended: filtered, reason };
}

export function applySupplementFeedback(prefs: SupplementPrefs, key: string, feedback: "like" | "dislike" | "stop"): SupplementPrefs {
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

export function hydrationFromWeight(preKg: number, postKg: number, durationMin: number, fluidConsumedMl = 0): WeightHydration {
  const loss = Math.max(0, preKg - postKg);
  const pct = preKg > 0 ? (loss / preKg) * 100 : 0;
  const hours = Math.max(durationMin / 60, 0.25);
  const totalSweatL = loss + fluidConsumedMl / 1000;
  const sweatRate = totalSweatL / hours;
  const status: WeightHydration["status"] = pct > 3 ? "severe" : pct > 2 ? "dehydrated" : "ok";
  const advice = status === "severe"
    ? `Severe fluid loss (${pct.toFixed(1)}%). Replace 150% of lost weight (${Math.round(loss * 1500)}ml) over the next 2h with electrolytes. Flag for tomorrow's plan.`
    : status === "dehydrated"
      ? `Dehydrated (${pct.toFixed(1)}%). Replace ~${Math.round(loss * 1250)}ml with sodium within 2h.`
      : `Hydration on point (<2% loss). Replace ~${Math.round(loss * 1000)}ml to be safe.`;
  return {
    weightLossKg: Math.round(loss * 100) / 100,
    weightLossPct: Math.round(pct * 10) / 10,
    sweatRateLPerH: Math.round(sweatRate * 100) / 100,
    fluidToReplaceMl: Math.round(loss * (status === "severe" ? 1500 : status === "dehydrated" ? 1250 : 1000)),
    status,
    advice,
  };
}

// ---------- 7. RACE VENUE (elevation / terrain / water) ----------
export interface VenueProfile {
  targetTempC?: number;
  humidity?: number;     // % — folded into heat index
  baseElevM?: number;    // venue base elevation (thin-air altitude)
  bikeElevM?: number;    // total climb on the bike leg
  bikeTerrain?: string;  // flat | rolling | hilly | mountain
  runElevM?: number;     // total climb on the run leg
  runTerrain?: string;   // flat | rolling | hilly | trail
  swimVenue?: string;    // pool | lake | ocean | river
  waterTempC?: number;
  swimCurrent?: string;  // none | mild | strong
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

function terrainNote(terrain?: string, elevM?: number): { detail: string; training: string } {
  const elev = elevM ?? 0;
  const t = (terrain || "").toLowerCase();
  if (t === "trail") return { detail: `Trail terrain, ${elev}m gain.`, training: "Trail runs, technical descents, ankle stability work. Road pace doesn't transfer — train on similar surface." };
  if (t === "mountain" || elev > 1500) return { detail: `Mountainous / ${elev}m climb.`, training: "Big climbing blocks, low gearing, practice long descents — bike handling under fatigue is the skill." };
  if (t === "hilly" || elev > 800) return { detail: `Hilly / ${elev}m climb.`, training: "Weekly hill repeats + climbing intervals; train gearing and momentum, not just power." };
  if (t === "rolling" || elev > 300) return { detail: `Rolling / ${elev}m climb.`, training: "Variable-power work: short surges over rollers, keep momentum through transitions." };
  return { detail: `Flat / ${elev || 0}m climb.`, training: "Aero/steady-state work; prioritize sustained power over climbing." };
}

export function venueAdjustment(v: VenueProfile): VenueAdjustment {
  const bike = terrainNote(v.bikeTerrain, v.bikeElevM);
  const run = terrainNote(v.runTerrain, v.runElevM);

  const swimVenue = (v.swimVenue || "pool").toLowerCase();
  const swimNote: DisciplineNote = { label: "Swim", detail: "", training: "" };
  if (swimVenue === "ocean" || swimVenue === "lake" || swimVenue === "river") {
    const current = v.swimCurrent === "strong" ? "strong current" : v.swimCurrent === "mild" ? "mild current" : "no significant current";
    swimNote.detail = `Open water (${swimVenue}) — ${current}.`;
    swimNote.training = "Open-water sessions: sighting every 4-6 strokes, drafting, buoy turns. Pool fitness does not transfer without open-water practice.";
    if (swimVenue === "ocean") swimNote.training += " Add surf entry/exit practice if applicable.";
  } else {
    swimNote.detail = "Pool swim — controlled conditions.";
    swimNote.training = "Train in the pool; add open-water skills only if the venue changes.";
  }

  let heat: TempAdjustment | undefined;
  if (v.targetTempC !== undefined) {
    const effective = v.humidity !== undefined ? heatIndex(v.targetTempC, v.humidity) : v.targetTempC;
    heat = temperatureAdjustment(effective);
  }

  let altitude: { vo2factor: number; paceFactor: number; advice: string } | undefined;
  if (v.baseElevM !== undefined) altitude = altitudeFactor(v.baseElevM);

  // Wetsuit legality (ITU-style: mandatory <22°C, optional 22-24.5°C, banned >24.5°C)
  let wetsuit: VenueAdjustment["wetsuit"] = { legal: false, note: "Not applicable — no water temperature set." };
  if (v.waterTempC !== undefined) {
    if (v.waterTempC < 22) wetsuit = { legal: true, waterTempC: v.waterTempC, note: `${v.waterTempC}°C — wetsuit mandatory/strongly advised (ITU <22°C).` };
    else if (v.waterTempC <= 24.5) wetsuit = { legal: "optional", waterTempC: v.waterTempC, note: `${v.waterTempC}°C — wetsuit optional (age-group legal 22-24.5°C).` };
    else wetsuit = { legal: false, waterTempC: v.waterTempC, note: `${v.waterTempC}°C — wetsuit NOT permitted (>24.5°C).` };
  }

  const overall = [
    heat ? `Race temp ~${heat.tempC}°C${v.humidity !== undefined ? ` (feels like, ${v.humidity}% RH)` : ""} (${heat.category}) — ${heat.advice}` : null,
    altitude ? `Altitude: ${altitude.advice}` : null,
    `Bike: ${bike.detail}`, `Run: ${run.detail}`, `Swim: ${swimNote.detail}`,
  ].filter(Boolean).join(" ");

  return { bike: { label: "Bike", ...bike }, run: { label: "Run", ...run }, swim: swimNote, heat, altitude, wetsuit, overall };
}
