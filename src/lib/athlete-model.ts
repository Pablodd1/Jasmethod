// JasMiamiMethod — Individual athlete model (perf-engine-v3). Pure, no I/O.
//
// Builds the daily coach's picture of ONE athlete from imported history
// (for example, permitted Garmin, COROS, Apple and manual data),
// overnight metrics and profile facts. Where history is missing it does
// not guess: it returns the onboarding questions the coach must ask.
//
// Personal calibration replaces population defaults once enough evidence exists:
// - recovery spacing after hard sessions (HRV return to the athlete's own SWC),
// - RPE bias (are prescribed zones feeling harder/easier than intended?),
// - weekly key-session capacity.
// Age and sex adjust conservatively and only where evidence supports it:
// - Masters (≥50 y): slower recovery from eccentric/high-intensity work
//   (Easthope 2010; Borges 2018) → +12 h spacing, +24 h at ≥65; key cap −1 at ≥65.
// - Under 18: no automatic overload or heavy neuromuscular work (NSCA youth guidance).
// - Female athletes: no automatic menstrual-phase penalty (McNulty 2020 — trivial,
//   individual effects); energy-availability (RED-S) screening is asked of everyone
//   (Mountjoy 2023 IOC consensus — RED-S affects all sexes).

import { ZONE_RPE } from "./performance-engine";
import type { Level } from "./periodization";
import { actualSessionKj } from "./workout-energy";

export interface HistoryWorkout {
  date: Date | string; sport: string; type?: string | null; intensity?: string | null;
  durationMin?: number | null; actualDurationMin?: number | null; rpe?: number | null;
  avgHr?: number | null; avgPower?: number | null; distanceKm?: number | null; calories?: number | null;
  completed?: boolean | null; planned?: boolean | null; feedbackStatus?: string | null;
  matchedPlanId?: string | null; source?: string | null;
}
export interface HistoryMetric { date: Date | string; hrv?: number | null; hrvType?: string | null; source?: string | null }
export interface ProfileFacts {
  sex?: string | null; birthYear?: number | null; experience?: string | null; weeklyHours?: number | null;
  goal?: string | null; lthr?: number | null; maxHr?: number | null; ftp?: number | null; runPaceBase?: number | null; swimPaceBase?: number | null;
  raceDate?: Date | null; injured?: boolean | null; hasSmartTrainer?: boolean | null; bikeType?: string | null; weightKg?: number | null;
}
export interface OnboardingQuestion { id: string; field: string | null; en: string; es: string; why: string }

export interface AthleteModel {
  version: "athlete-model-v1";
  coverageDays: number;              // span of usable history
  sessions28: number;
  hoursPerWeek28: number | null;     // actual, from history
  sports: string[];                  // modalities actually trained (pivot targets)
  longestRecentMin: number | null;
  coldStart: boolean;                // < 21 d usable history → conservative ramp + questions
  level: Level;
  levelSource: "profile" | "history-estimate" | "default";
  ageYears: number | null;
  ageBand: "youth" | "adult" | "masters" | "masters65" | "unknown";
  sex: "female" | "male" | null;
  spacingH: number;                  // min hours between high-eccentric / key sessions
  keyCap: number;                    // max key sessions per 7 days
  pushAllowed: boolean;
  rpeBias: number | null;            // mean(actual − intended RPE), last 28 d
  personalRecoveryH: number | null;  // median hours for HRV to return within SWC after key sessions
  anchorsStale: string[];            // targets that need a retest
  kjLast7: number | null;            // mechanical bike work only; incomplete/mixed energy stays unknown
  kjWeeklyAvg28: number | null;      // 4-week weekly average, same scale
  kjSources: Record<string, number>; // how each session's kJ was obtained
  onboarding: OnboardingQuestion[];
  notes: string[];
}

const DAY = 86400000;
const t = (d: Date | string) => +new Date(d);
const zoneNum = (z?: string | null) => Math.max(1, Math.min(7, Number(String(z || "").replace(/[^0-9]/g, "")) || 0));
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

/** Intensity for imported rows that carry only heart rate: zone from avg HR vs LTHR (or HRmax). */
export function inferZone(w: HistoryWorkout, p: ProfileFacts): string | null {
  if (w.intensity && zoneNum(w.intensity)) return w.intensity;
  if (w.avgHr && p.lthr) { const r = w.avgHr / p.lthr; return r < 0.8 ? "z1" : r < 0.89 ? "z2" : r < 0.94 ? "z3" : r < 1 ? "z4" : "z5"; }
  if (w.avgHr && p.maxHr) { const r = w.avgHr / p.maxHr; return r < 0.68 ? "z1" : r < 0.78 ? "z2" : r < 0.85 ? "z3" : r < 0.92 ? "z4" : "z5"; }
  return null;
}
export const actualMinutes = (w: HistoryWorkout): number | null =>
  w.actualDurationMin ?? (w.feedbackStatus === "partial" ? null : (w.completed || w.feedbackStatus === "completed") ? (w.durationMin ?? null) : null);
const performed = (w: HistoryWorkout) => !w.matchedPlanId && w.feedbackStatus !== "skipped" && (w.completed || w.feedbackStatus === "completed" || w.feedbackStatus === "partial");
const isKey = (w: HistoryWorkout, p: ProfileFacts) => zoneNum(inferZone(w, p)) >= 4 || ["interval", "threshold", "race", "test"].includes(String(w.type)) || (w.rpe ?? 0) >= 7;

export function buildAthleteModel(input: { history: HistoryWorkout[]; metrics: HistoryMetric[]; profile: ProfileFacts | null; now?: Date }): AthleteModel {
  const now = input.now ?? new Date(), nowT = +now, p = input.profile ?? {};
  const done = input.history.filter(w => performed(w) && t(w.date) <= nowT && t(w.date) > nowT - 90 * DAY);
  const oldest = done.length ? Math.min(...done.map(w => t(w.date))) : nowT;
  const coverageDays = Math.floor((nowT - oldest) / DAY);
  const last28 = done.filter(w => t(w.date) > nowT - 28 * DAY);
  const mins28 = last28.map(actualMinutes);
  const knownMins = mins28.filter((m): m is number => m != null);
  const hoursPerWeek28 = coverageDays >= 14 && knownMins.length ? Math.round((knownMins.reduce((a, b) => a + b, 0) / 60 / Math.min(4, Math.max(2, coverageDays / 7))) * 10) / 10 : null;
  const sports = Array.from(new Set(done.map(w => w.sport).filter(s => s && !["mobility", "recovery", "other"].includes(s))));
  const longestRecentMin = knownMins.length ? Math.max(...knownMins) : null;
  const coldStart = coverageDays < 21 || last28.length < 6;

  // Level: stated profile wins; else a labelled estimate from actual volume; never upgraded from a goal label.
  const stated = (["beginner", "amateur", "advanced", "pro"] as const).find(l => l === p.experience);
  let level: Level = stated ?? "amateur", levelSource: AthleteModel["levelSource"] = stated ? "profile" : "default";
  if (!stated && hoursPerWeek28 != null) { level = hoursPerWeek28 < 4 ? "beginner" : hoursPerWeek28 < 8 ? "amateur" : hoursPerWeek28 < 14 ? "advanced" : "pro"; levelSource = "history-estimate"; }
  if (!stated && hoursPerWeek28 == null) level = "beginner"; // no evidence → start conservative

  const ageYears = p.birthYear ? now.getUTCFullYear() - p.birthYear : null;
  const ageBand: AthleteModel["ageBand"] = ageYears == null ? "unknown" : ageYears < 18 ? "youth" : ageYears >= 65 ? "masters65" : ageYears >= 50 ? "masters" : "adult";
  const sex = p.sex === "female" || p.sex === "male" ? p.sex : null;
  const notes: string[] = [];

  // ---- Personal calibration ----
  const rpePairs = last28.filter(w => w.rpe != null && inferZone(w, p)).map(w => w.rpe! - ZONE_RPE[zoneNum(inferZone(w, p))]);
  const rpeBias = rpePairs.length >= 4 ? Math.round((rpePairs.reduce((a, b) => a + b, 0) / rpePairs.length) * 10) / 10 : null;
  if (rpeBias != null && rpeBias >= 1) notes.push(`Sessions feel ~${rpeBias} RPE harder than intended: targets may be set too high.`);
  if (rpeBias != null && rpeBias <= -1.5) notes.push(`Sessions feel ~${Math.abs(rpeBias)} RPE easier than intended: a retest may raise your targets.`);

  // Heuristic: elapsed hours to an observed lnRMSSD within the baseline band. This is not a smoothed or validated recovery time.
  const hrv = input.metrics.filter(m => m.hrv && m.hrv > 0 && m.hrv <= 300 && (m.hrvType || "rmssd") === "rmssd" && m.source !== "strava").map(m => ({ ts: t(m.date), ln: Math.log(m.hrv!) })).sort((a, b) => a.ts - b.ts);
  let personalRecoveryH: number | null = null;
  if (hrv.length >= 30) {
    const lns = hrv.map(h => h.ln), mean = lns.reduce((a, b) => a + b, 0) / lns.length;
    const sd = Math.sqrt(lns.reduce((a, b) => a + (b - mean) ** 2, 0) / (lns.length - 1)) || 0.02, swc = 0.5 * sd;
    const recoveries: number[] = [];
    for (const k of done.filter(w => isKey(w, p))) {
      const after = hrv.filter(h => h.ts > t(k.date) && h.ts <= t(k.date) + 4 * DAY);
      if (after.length < 2) continue;
      const back = after.find(h => h.ln >= mean - swc);
      recoveries.push(back ? Math.round((back.ts - t(k.date)) / 3600000) : 96);
    }
    if (recoveries.length >= 4) personalRecoveryH = median(recoveries);
  }

  let spacingH = 48;
  if (personalRecoveryH != null) { spacingH = Math.max(36, Math.min(72, Math.round(personalRecoveryH / 12) * 12)); notes.push(`Estimated recovery spacing: HRV observations returned to the baseline band ~${personalRecoveryH} h after hard sessions → ${spacingH} h spacing.`); }
  if (ageBand === "masters") { spacingH = Math.max(spacingH, personalRecoveryH != null ? spacingH : 60); }
  if (ageBand === "masters65") { spacingH = Math.max(spacingH, personalRecoveryH != null ? spacingH : 72); }
  let keyCap = level === "beginner" ? 2 : 3;
  if (ageBand === "masters65" || ageBand === "youth") keyCap = Math.min(keyCap, 2);
  if (rpeBias != null && rpeBias >= 1.5) keyCap = Math.max(1, keyCap - 1);
  const pushAllowed = ageBand !== "youth" && !coldStart && !p.injured;
  if (ageBand === "youth") notes.push("Youth athlete: no automatic overload or heavy neuromuscular loading; supervised training only.");
  if (coldStart) notes.push(`Only ${coverageDays} days of usable history: conservative first block (no overload) until 21 days are recorded.`);

  // ---- Anchor freshness: imported best efforts vs saved targets ----
  const anchorsStale: string[] = [];
  const bikeHard = done.filter(w => w.sport === "bike" && w.avgPower && (actualMinutes(w) ?? 0) >= 20 && zoneNum(inferZone(w, p)) >= 4);
  if (p.ftp && bikeHard.some(w => w.avgPower! > p.ftp! * 1.05)) anchorsStale.push("ftp");
  if (!p.ftp && sports.includes("bike")) anchorsStale.push("ftp");
  if (!p.lthr && !p.maxHr) anchorsStale.push("lthr");
  if (!p.runPaceBase && sports.includes("run")) anchorsStale.push("runPace");
  if (!p.swimPaceBase && sports.includes("swim")) anchorsStale.push("swimCss");

  // ---- Onboarding: ask only for what history and profile cannot provide ----
  const q: OnboardingQuestion[] = [];
  const ask = (id: string, field: string | null, en: string, es: string, why: string) => q.push({ id, field, en, es, why });
  if (!p.goal) ask("goal", "goal", "What are you training for (race, distance, date)?", "¿Para qué entrenas (carrera, distancia, fecha)?", "Selects the stimulus matrix and taper timing.");
  if (!p.birthYear) ask("birthYear", "birthYear", "What year were you born?", "¿En qué año naciste?", "Recovery spacing changes with age (masters, youth).");
  if (!sex) ask("sex", "sex", "Sex (female/male)? Used only for evidence-based adjustments, never to lower your plan.", "Sexo (mujer/hombre)? Solo para ajustes con evidencia, nunca para rebajar tu plan.", "Energy-availability screening and reference ranges.");
  if (!stated) ask("experience", "experience", "How long have you trained consistently, and at what level (beginner, amateur, advanced, pro)?", "¿Cuánto tiempo llevas entrenando con constancia y a qué nivel (principiante, amateur, avanzado, pro)?", "Sets the work dose and key-session cap.");
  if (coldStart) {
    ask("connectHistory", null, "Connect Garmin or COROS (or import files) so I can read your last 3 months of training.", "Conecta Garmin o COROS (o importa archivos) para leer tus últimos 3 meses de entrenamiento.", "History replaces guesses: load ratio needs 21+ days.");
    ask("weeklyHours", "weeklyHours", "If you can't import: about how many hours per week have you trained over the last month?", "Si no puedes importar: ¿cuántas horas por semana has entrenado el último mes?", "Starting volume without history.");
    ask("longest", null, "Longest session in the last month, per sport?", "¿Sesión más larga del último mes, por deporte?", "Caps long sessions so they build from what you've actually done.");
    ask("recentRace", null, "Any recent race or time trial result (distance and time)?", "¿Algún resultado reciente de carrera o test (distancia y tiempo)?", "Estimates starting paces/power until a test is done.");
  }
  if (anchorsStale.length) ask("anchors", null, `Targets to set or retest: ${anchorsStale.join(", ")}. I'll schedule a short test, or you can tell me a recent value.`, `Objetivos a fijar o revisar: ${anchorsStale.join(", ")}. Programaré un test corto o dime un valor reciente.`, "Every interval target depends on these.");
  ask("injuries", null, "Any injuries in the last 12 months, or pain now?", "¿Lesiones en los últimos 12 meses o dolor ahora?", "Protects loading choices; current pain pauses training.");
  ask("energy", null, "In the last 3 months: frequent illness, unexplained fatigue, stress fractures, or (if applicable) missed periods?", "En los últimos 3 meses: ¿enfermedades frecuentes, fatiga sin explicación, fracturas por estrés o (si aplica) reglas ausentes?", "RED-S screening (IOC 2023). A yes means review with a clinician before hard training.");
  if (!p.hasSmartTrainer && !p.bikeType && !sports.includes("bike")) ask("equipment", "hasSmartTrainer", "Do you have access to a bike or indoor trainer? A pool?", "¿Tienes bici o rodillo? ¿Piscina?", "Lets the coach move hard work off your legs when needed.");

  // Energy workload on one scale (kJ ≈ kcal): compare this week with the 4-week norm.
  const kjSources: Record<string, number> = {};
  const kjOf = (w: HistoryWorkout) => { const r = actualSessionKj({ sport: w.sport, avgPower: w.avgPower, actualDurationMin: w.actualDurationMin, durationMin: actualMinutes(w), calories: w.calories ?? null, intensity: inferZone(w, p) }, { weightKg: p.weightKg ?? null }); kjSources[r.source] = (kjSources[r.source] ?? 0) + 1; return r.kj; };
  const kj28 = last28.map(kjOf);
  const allKnown = kj28.every(k => k != null) && kj28.length > 0;
  const kjLast7 = allKnown ? last28.reduce((a, w, i) => a + (t(w.date) > nowT - 7 * DAY ? kj28[i]! : 0), 0) : null;
  const kjWeeklyAvg28 = allKnown && coverageDays >= 21 ? Math.round(kj28.reduce((a, k) => a + k!, 0) / 4) : null;
  if (kjLast7 != null && kjWeeklyAvg28) notes.push(`Mechanical bike work: this week ${kjLast7} kJ vs 4-week average ${kjWeeklyAvg28} kJ (${Math.round((kjLast7 / kjWeeklyAvg28 - 1) * 100)}%).`);
  if (last28.length && !allKnown) notes.push("Mechanical-work totals are unavailable because some sessions lack measured bike power. Device calories and metabolic estimates remain separate; missing work is not zero.");

  return { version: "athlete-model-v1", kjLast7, kjWeeklyAvg28, kjSources, coverageDays, sessions28: last28.length, hoursPerWeek28, sports, longestRecentMin, coldStart, level, levelSource, ageYears, ageBand, sex, spacingH, keyCap, pushAllowed, rpeBias, personalRecoveryH, anchorsStale, onboarding: q, notes };
}
