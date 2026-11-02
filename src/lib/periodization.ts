// JasMiamiMethod — Goal × Phase periodization layer (perf-engine-v2). Pure, no I/O.
//
// Decides WHICH quality stimulus a key session should carry for this athlete's
// race, sport, cycle phase and fitness level — and HOW MUCH of it (dose). The
// density builder in performance-engine.ts turns that into exact steps.
//
// Quality over quantity: a key session gets a capped, progressive dose. Unused
// time is not filled with more intervals; the session ends earlier.
//
// Evidence:
// - Intensity distribution: Seiler 2010; Stöggl & Sperlich 2014 (polarized ~80/20).
// - Short vs long VO2max intervals: Rønnestad 2015/2020 (30/15 "fast VO2"),
//   Buchheit & Laursen 2013 (time near VO2max; 3–6 min "slow VO2").
// - Threshold / sweet-spot for long-course: Seiler 2013 (LT2 work), Jones 2019.
// - Race-specific pace work in the specific phase: Issurin 2010 (block periodization).
// - Taper: Bosquet 2007 meta-analysis — reduce volume 41–60% over 8–14 days,
//   keep intensity, keep frequency ≥80%; Mujika & Padilla 2003.
// - Progression ≈ 5–10%/week of key-session work, deload every 3–5 weeks.

export type GoalFamily = "short" | "middle" | "long" | "ultra" | "hyrox";
export type CyclePhase = "base" | "build" | "specific" | "taper" | "race" | "recovery";
export type QualityKind = "vo2" | "vo2-long" | "threshold" | "sweetspot" | "race-pace" | "durability" | "taper-primer" | "neuromuscular" | "compromised" | "aerobic";
export type Level = "beginner" | "amateur" | "advanced" | "pro";

/** Map any stored goal/distance label onto a physiological family. */
export function goalFamily(goal?: string | null): GoalFamily {
  const g = String(goal || "").toLowerCase();
  if (g === "hyrox") return "hyrox";
  if (["5k", "sprint", "track-sprint"].includes(g)) return "short";
  if (["half", "70.3", "marathon"].includes(g)) return "long";
  if (["full", "ironman", "140.6", "ultra"].includes(g)) return "ultra";
  return "middle"; // 10k, olympic, half-marathon, cycle, run-only, swim-only, unknown
}

export function normalizeLevel(level?: string | null): Level {
  return (["beginner", "amateur", "advanced", "pro"] as const).find(l => l === level) ?? "amateur";
}

/** Taper length by family (Bosquet 2007: 8–14 d optimal; shorter for short events). */
export const TAPER_DAYS: Record<GoalFamily, number> = { short: 8, middle: 10, long: 14, ultra: 14, hyrox: 10 };

export function resolvePhase(input: { coachingPhase?: string | null; daysToRace?: number | null; family: GoalFamily; weekIndex?: number | null }): CyclePhase {
  const d = input.daysToRace;
  if (d != null && d >= 0 && d <= 1) return "race";
  if (d != null && d > 1 && d <= TAPER_DAYS[input.family]) return "taper";
  switch (input.coachingPhase) {
    case "foundation": return "base";
    case "development": return "build";
    case "specific": return "specific";
    case "recovery": return "recovery";
  }
  if (d != null && d > TAPER_DAYS[input.family] && d <= TAPER_DAYS[input.family] + 42) return "specific";
  if (input.weekIndex != null) { const w = input.weekIndex % 6; return w === 5 ? "recovery" : w < 2 ? "base" : w < 4 ? "build" : "specific"; }
  return "build";
}

// Ordered preferences per family × phase. The engine rotates through them by day
// so consecutive key sessions don't repeat the same stimulus.
const MATRIX: Record<GoalFamily, Record<CyclePhase, QualityKind[]>> = {
  short:  { base: ["threshold", "vo2-long"],       build: ["vo2", "vo2-long", "threshold"], specific: ["race-pace", "vo2"],            taper: ["taper-primer"], race: ["taper-primer"], recovery: ["aerobic"] },
  middle: { base: ["sweetspot", "threshold"],      build: ["threshold", "vo2-long"],        specific: ["race-pace", "threshold", "vo2"], taper: ["taper-primer"], race: ["taper-primer"], recovery: ["aerobic"] },
  long:   { base: ["durability", "sweetspot"],     build: ["threshold", "sweetspot", "vo2-long"], specific: ["race-pace", "durability"], taper: ["taper-primer"], race: ["taper-primer"], recovery: ["aerobic"] },
  ultra:  { base: ["durability"],                  build: ["sweetspot", "durability", "threshold"], specific: ["race-pace", "durability"], taper: ["taper-primer"], race: ["taper-primer"], recovery: ["aerobic"] },
  hyrox:  { base: ["threshold", "neuromuscular"],  build: ["compromised", "vo2-long", "neuromuscular"], specific: ["compromised", "race-pace"], taper: ["taper-primer"], race: ["taper-primer"], recovery: ["aerobic"] },
};

export interface QualityChoice { kind: QualityKind; reason: string }

/** Pick the quality stimulus for a key/PUSH session. */
export function qualityFor(input: {
  family: GoalFamily; phase: CyclePhase; sport: string; level: Level; availMin: number; daySeed: number;
}): QualityChoice {
  const { family, phase, sport, level, availMin } = input;
  const prefs = MATRIX[family][phase];
  let kind = prefs[((input.daySeed % prefs.length) + prefs.length) % prefs.length];
  let reason = `${family}-course goal · ${phase} phase → ${kind}`;

  // Sport constraints.
  if (sport === "strength") kind = level === "beginner" ? "threshold" : "neuromuscular";
  if (kind === "compromised" && sport !== "hyrox") kind = "threshold";
  if (kind === "neuromuscular" && sport !== "strength" && sport !== "hyrox") kind = "vo2";
  if (sport === "swim" && (kind === "durability" || kind === "race-pace") && availMin < 45) kind = "threshold";

  // Time window: very short windows favour dense work that still matches the goal.
  if (availMin < 45 && !["taper-primer", "aerobic", "neuromuscular", "compromised"].includes(kind)) {
    const dense: QualityKind = family === "long" || family === "ultra" ? "threshold" : "vo2";
    if (kind !== dense) reason += ` · T_avail ${availMin} min → ${dense} (density)`;
    kind = dense;
  }
  if (kind === "durability" && availMin <= 90) { kind = family === "ultra" || family === "long" ? "sweetspot" : "threshold"; reason += " · window too short for durability"; }

  // Fitness level: beginners build threshold tolerance before VO2/neuromuscular work.
  if (level === "beginner" && ["vo2", "vo2-long", "neuromuscular"].includes(kind)) { kind = "threshold"; reason += " · beginner: threshold before VO2"; }
  return { kind, reason };
}

/** Work-dose multiplier: level × within-phase progression; recovery/taper cut volume, not intensity. */
export function doseScale(input: { level: Level; phase: CyclePhase; weekInPhase?: number | null; chronicLoad?: number | null }): number {
  const base = { beginner: 0.6, amateur: 0.8, advanced: 1, pro: 1.15 }[input.level];
  const prog = 1 + 0.08 * Math.max(0, Math.min(3, (input.weekInPhase ?? 1) - 1)); // ≈ +8%/week, max +24%
  const phase = input.phase === "taper" ? 0.5 : input.phase === "race" ? 0.35 : input.phase === "recovery" ? 0.6 : 1;
  // A low chronic load (sRPE/week) cannot support a full pro-level dose.
  const chronic = input.chronicLoad != null && input.chronicLoad < 1200 ? 0.85 : 1;
  return Math.round(base * prog * phase * chronic * 100) / 100;
}

/** Reference work reps at dose 1.0 — the "full" key-session dose per kind. */
export const REFERENCE_REPS: Record<QualityKind, number> = {
  "vo2": 3,          // sets of 13×30/15
  "vo2-long": 5,     // × 4 min
  "threshold": 3,    // × 10 min
  "sweetspot": 3,    // × 12–15 min
  "race-pace": 5,    // family-specific blocks
  "durability": 2,   // late threshold blocks
  "taper-primer": 5, // × 90 s at race pace
  "neuromuscular": 4,
  "compromised": 6,
  "aerobic": 1,
};
export function repsFor(kind: QualityKind, scale: number): number {
  return Math.max(1, Math.round(REFERENCE_REPS[kind] * scale));
}

/** Max key (hard) sessions per rolling 7 days — the polarized guard. */
export function maxKeySessions(level: Level): number { return level === "beginner" ? 2 : level === "pro" ? 3 : 3; }

// ---------------- Taper ----------------
/** Plan-level progressive taper factor (Bosquet 2007): day N of the taper → volume factor.
 * Exponential-style decay from ~0.8 to ~0.45; intensity kept; frequency kept ≥80%.
 * The cycle generator owns plan volume; the daily engine uses this only to cap a
 * session it is re-shaping and never multiplies it on top of a plan taper. */
export function taperVolumeFactor(daysToRace: number, family: GoalFamily): number {
  const len = TAPER_DAYS[family];
  if (daysToRace > len) return 1;
  const progress = 1 - Math.max(0, daysToRace) / len; // 0 at taper start → 1 on race day
  return Math.round((0.8 - 0.35 * progress) * 100) / 100;
}

// ---------------- Session purpose and cues (text that accompanies the visual) ----------------
export interface SessionNarrative { purpose: string; science: string; cues: string[]; stopRule: string }
export function narrativeFor(kind: QualityKind, family: GoalFamily, phase: CyclePhase, es = false): SessionNarrative {
  const T = (en: string, sp: string) => (es ? sp : en);
  const stopRule = T("Stop the set if form breaks, pain appears, or you can't hit the target in two consecutive reps.", "Detén la serie si la técnica se rompe, aparece dolor o no alcanzas el objetivo en dos repeticiones seguidas.");
  const map: Record<QualityKind, Omit<SessionNarrative, "stopRule">> = {
    "vo2": { purpose: T("Fast VO2max: accumulate time near maximal oxygen uptake with short work bouts.", "VO2max rápido: acumular tiempo cerca del consumo máximo de oxígeno con esfuerzos cortos."), science: "Rønnestad 2020: 30/15 short intervals raise VO2max and power more than equal-work long intervals.", cues: [T("Even effort every rep — no sprint start.", "Esfuerzo parejo en cada repetición, sin salir a tope."), T("Breathing should be near-maximal by rep 4–5.", "La respiración debe ser casi máxima hacia la rep 4–5.")] },
    "vo2-long": { purpose: T("Slow VO2max: 3–5 min reps held at ~90–95% of max aerobic speed/power.", "VO2max lento: repeticiones de 3–5 min a ~90–95% de la velocidad/potencia aeróbica máxima."), science: "Buchheit & Laursen 2013: long intervals maximize stroke volume and time ≥90% VO2max.", cues: [T("Settle into the target within 60 s, then hold.", "Alcanza el objetivo en 60 s y mantenlo."), T("Recoveries easy, not walking.", "Recuperaciones suaves, sin parar.")] },
    "threshold": { purpose: T("Raise lactate threshold (LT2): long, controlled, sustainable-hard work.", "Elevar el umbral de lactato (LT2): trabajo largo, controlado y sostenible."), science: "Seiler 2013; LT2 work improves sustainable power/pace for 20–60 min events.", cues: [T("Comfortably hard: you can say short phrases.", "Duro pero cómodo: puedes decir frases cortas."), T("Last rep should match the first.", "La última repetición igual a la primera.")] },
    "sweetspot": { purpose: T("Sweet spot (88–94% FTP / just under threshold): high aerobic load with low recovery cost.", "Sweet spot (88–94% FTP, justo bajo el umbral): mucha carga aeróbica con bajo coste de recuperación."), science: "Long-course durability; repeatable several times per week in build phases.", cues: [T("Steady cadence, seated, smooth.", "Cadencia estable, sentado, fluido."), T("Fuel from minute 30 if >75 min.", "Come desde el minuto 30 si dura >75 min.")] },
    "race-pace": { purpose: T(`Race-specific pace for your ${family}-course goal: rehearse the exact intensity you'll race at.`, `Ritmo específico de carrera para tu objetivo ${family}: ensaya la intensidad exacta de competición.`), science: "Issurin 2010: the specific phase concentrates race-pace work to transfer fitness to the event.", cues: [T("Hit pace with relaxed form — this is a rehearsal.", "Ritmo objetivo con técnica relajada: es un ensayo."), T("Practice race fueling and pacing decisions.", "Practica la nutrición y las decisiones de ritmo de carrera.")] },
    "durability": { purpose: T("Durability: aerobic volume, then threshold when glycogen is lower — fatigue resistance for long races.", "Durabilidad: volumen aeróbico y luego umbral con menos glucógeno: resistencia a la fatiga para carreras largas."), science: "Maunder 2021 / Jones 2023: durability (power decay after prolonged work) predicts long-course performance.", cues: [T("Keep Z2 honest for the first block.", "Mantén Z2 de verdad en el primer bloque."), T("Fuel 60–90 g/h as practised.", "Come 60–90 g/h si lo has practicado.")] },
    "taper-primer": { purpose: T("Taper primer: keep intensity, cut volume — short race-pace touches keep you sharp.", "Activación de taper: mantener intensidad, reducir volumen; toques cortos a ritmo de carrera."), science: "Bosquet 2007: reduce volume 41–60% over 8–14 days, maintain intensity and frequency.", cues: [T("Finish feeling better than you started.", "Termina sintiéndote mejor que al empezar."), T("No new stimuli this close to the race.", "Nada nuevo tan cerca de la carrera.")] },
    "neuromuscular": { purpose: T("Neuromuscular power: heavy low-rep strength + reactive contacts to improve economy and force.", "Potencia neuromuscular: fuerza pesada de pocas reps + contactos reactivos para mejorar economía y fuerza."), science: "Rønnestad & Mujika 2014: heavy strength training improves endurance economy.", cues: [T("Only lifts you are already coached on.", "Solo ejercicios que ya dominas."), T("Full rest — quality of each rep matters.", "Descanso completo: cuenta la calidad de cada repetición.")] },
    "compromised": { purpose: T("Compromised running: race-pace running on fatigued legs between stations.", "Carrera comprometida: ritmo de carrera con piernas fatigadas entre estaciones."), science: "HYROX-specific: lactate clearance and pacing under station fatigue.", cues: [T("Run the first 200 m controlled after each station.", "Controla los primeros 200 m tras cada estación."), T("Hold station technique when tired.", "Mantén la técnica de estación con fatiga.")] },
    "aerobic": { purpose: T("Aerobic: easy, conversational — this is what makes the hard days possible.", "Aeróbico: suave, conversacional; esto hace posibles los días duros."), science: "Seiler 2010: ~80% of elite endurance volume is low intensity.", cues: [T("Nose-breathing pace.", "Ritmo de respiración nasal.")] },
  };
  return { ...map[kind], stopRule };
}

/** Deterministic idea list for the chat brainstorm (goal × phase), no athlete data required. */
export function trainingIdeas(family: GoalFamily, phase: CyclePhase, es = false): string[] {
  const kinds = Array.from(new Set(MATRIX[family][phase]));
  const label: Record<QualityKind, [string, string]> = { vo2: ["Fast VO2max (30/15)", "VO2max rápido (30/15)"], "vo2-long": ["Slow VO2max (3–5 min)", "VO2max lento (3–5 min)"], threshold: ["Threshold", "Umbral"], sweetspot: ["Sweet spot", "Sweet spot"], "race-pace": ["Race pace", "Ritmo de carrera"], durability: ["Durability", "Durabilidad"], "taper-primer": ["Taper primer", "Activación de taper"], neuromuscular: ["Neuromuscular power", "Potencia neuromuscular"], compromised: ["Compromised running", "Carrera comprometida"], aerobic: ["Aerobic", "Aeróbico"] };
  return kinds.map(k => `${label[k][es ? 1 : 0]}: ${narrativeFor(k, family, phase, es).purpose}`);
}
