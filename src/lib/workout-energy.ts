// JasMiamiMethod — Step guides + kilojoule energy accounting (energy-v1). Pure, no I/O.
//
// 1. STEP GUIDE: every step (work AND rest) is described in every unit the athlete
//    might own: zone, RPE + feel, heart rate (bpm and %LTHR), power (W and %FTP),
//    running power (%run-CP), pace (/km or /mi, %threshold) and swim pace (/100,
//    vs CSS). Absolute numbers appear only when the athlete has a dated reference
//    (the same evidence-gated TargetProfile the canonical session uses); the
//    percentage always appears, so any watch, power meter or app can be set.
//
// 2. KILOJOULES: one currency to compare any two workouts and to drive fueling.
//    - Bike with FTP: mechanical work kJ = Σ watts × seconds / 1000 (what a power
//      meter reports). Gross efficiency ≈ 20–25% ⇒ 1 kJ of work ≈ 1 kcal burned
//      (Jeukendrup 2004; Coyle 1992).
//    - Without power: energy estimated from sport × zone METs × body mass
//      (Ainsworth 2011 Compendium), expressed as work-equivalent kJ (= kcal) so the
//      numbers sit on the same scale. Always labelled as an estimate.
//    - Carbohydrate burned: kcal × CHO fraction by intensity (Romijn 1993;
//      van Loon 2001: ~45% at Z2 → ~95% above threshold) / 4 kcal·g⁻¹.
//    - High-intensity kJ (Z4+) is reported separately: it is the part that
//      empties glycogen and costs the most recovery (Skiba 2012 W′ model).
//    kJ measures work and energy, not tissue damage. "Damage" is reported as
//    a separate cost profile: high-intensity kJ (metabolic) + eccentric minutes
//    (musculoskeletal, from performance-engine).
//
// 3. HYDRATION: planned fluid from a measured sweat rate if one exists; otherwise a
//    prompt to weigh before and after (the existing SessionMeasurementsFields).

import { HR_ZONE_UPPER_FACTORS, POWER_ZONE_UPPER_FACTORS, SWIM_ZONE_MULT } from "./zone-factors";

export interface GuideProfile {
  ftp?: number | null; lthr?: number | null; runPaceBase?: number | null; swimPaceBase?: number | null;
  weightKg?: number | null; sweatRateMlH?: number | null; units?: string | null;
}
export interface GuideStep { name?: string; seconds: number; zone: string; phase?: string }

export interface StepGuide {
  zone: string; rpe: number; feel: string;
  hr: string | null; hrPct: string;
  power: string | null; powerPct: string | null;
  runPowerPct: string | null;
  pace: string | null; pacePct: string | null;
  text: string;            // one line: everything, in priority order for this sport
  kj: number | null;       // work-equivalent kJ for this step
  kcal: number | null;
}

export interface SessionEnergy {
  version: "energy-v1";
  method: "power" | "met-estimate" | "unavailable";
  workKj: number | null;        // compare workouts with this
  kcal: number | null;
  kjPerHour: number | null;
  kjPerKg: number | null;
  highIntensityKj: number | null; // Z4+ share
  highIntensityPct: number | null;
  carbsBurnedG: number | null;
  carbsIntakeTargetG: number | null; // from the canonical fuel curve
  carbsReplacedPct: number | null;
  fluidPlanMl: number | null;
  hydrationNote: string;
  recoveryCarbNote: string | null;
  note: string;
}

const Z = (zone: string) => Math.max(1, Math.min(7, Number(String(zone).replace(/[^0-9]/g, "")) || 1));
const RPE = [0, 2, 3, 5, 7, 8, 9, 10];
const FEEL_EN = ["", "very easy, recovery", "easy, conversational", "steady, short sentences", "comfortably hard, few words", "hard, breathing heavy", "very hard, near max", "all-out"];
const FEEL_ES = ["", "muy suave, recuperación", "suave, puedes conversar", "constante, frases cortas", "duro pero controlado, pocas palabras", "duro, respiración fuerte", "muy duro, casi al máximo", "máximo"];
const pct = (lo: number, hi: number) => `${Math.round(lo * 100)}–${Math.round(hi * 100)}%`;
const mmss = (s: number) => `${Math.floor(Math.round(s) / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;
const RUN_PACE = [0, 1.4, 1.2, 1.08, 1, 0.95, 0.9, 0.85]; // × threshold pace (same table as canonical-session)
const RUN_POWER = [0, 0.8, 0.88, 0.95, 1.05, 1.15, 1.3, 1.3]; // Stryd-style % of running CP (upper bounds)

// METs by sport × zone (Ainsworth 2011 Compendium; representative values).
const MET: Record<string, number[]> = {
  run: [0, 6, 8.5, 10.5, 12.5, 14.5, 16, 16],
  bike: [0, 4.5, 7, 9, 11, 13, 15, 15],
  swim: [0, 5, 7, 8.5, 10, 11, 11, 11],
  hyrox: [0, 4, 6.5, 8.5, 10, 11.5, 12, 12],
  strength: [0, 3, 3.5, 5, 6, 6, 6, 6],
  brick: [0, 5, 7.5, 9.5, 11.5, 13.5, 15, 15],
  mobility: [0, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5, 2.5],
};
const CHO_FRACTION = [0, 0.35, 0.45, 0.65, 0.85, 0.95, 1, 1];

export function stepGuide(step: GuideStep, sport: string, p: GuideProfile | null | undefined, es = false): StepGuide {
  const z = Z(step.zone), lo = z === 1 ? 0 : z - 1, imperial = p?.units === "imperial";
  const hrLo = HR_ZONE_UPPER_FACTORS[lo], hrHi = HR_ZONE_UPPER_FACTORS[z];
  const hrPct = z >= 7 ? `>${Math.round(HR_ZONE_UPPER_FACTORS[6] * 100)}% LTHR` : z === 1 ? `≤${Math.round(hrHi * 100)}% LTHR` : `${pct(hrLo, hrHi)} LTHR`;
  const hr = p?.lthr && z < 7 ? (z === 1 ? `≤${Math.round(p.lthr * hrHi)} bpm` : `${Math.round(p.lthr * hrLo) + 1}–${Math.round(p.lthr * hrHi)} bpm`) + (sport === "swim" ? (es ? " (en el agua ~10 lpm menos)" : " (swim HR runs ~10 bpm lower)") : "") : null;

  let power: string | null = null, powerPct: string | null = null, runPowerPct: string | null = null, pace: string | null = null, pacePct: string | null = null;
  if (sport === "bike" || sport === "brick") {
    const pl = POWER_ZONE_UPPER_FACTORS[lo], ph = POWER_ZONE_UPPER_FACTORS[z];
    powerPct = z >= 7 ? `>${Math.round(POWER_ZONE_UPPER_FACTORS[6] * 100)}% FTP` : z === 1 ? `≤${Math.round(ph * 100)}% FTP` : `${pct(pl, ph)} FTP`;
    if (p?.ftp && z < 7) power = z === 1 ? `≤${Math.round(p.ftp * ph)} W` : `${Math.round(p.ftp * pl) + 1}–${Math.round(p.ftp * ph)} W`;
  }
  if (sport === "run" || sport === "brick" || sport === "hyrox") {
    runPowerPct = z === 1 ? `≤${Math.round(RUN_POWER[1] * 100)}% run CP` : `${pct(RUN_POWER[lo] + 0.01, RUN_POWER[z])} run CP`;
    const f = RUN_PACE[z];
    pacePct = z === 4 ? "threshold pace" : `${Math.round(f * 100)}% of threshold pace time`;
    if (p?.runPaceBase) { const factor = imperial ? 1.609344 : 1, c = p.runPaceBase * f * factor; pace = `${mmss(c * 0.98)}–${mmss(c * 1.02)}/${imperial ? "mi" : "km"}`; }
  }
  if (sport === "swim") {
    const m = SWIM_ZONE_MULT[`z${Math.min(5, z)}`];
    pacePct = z === 4 ? "CSS ±2%" : z < 4 ? `CSS +${Math.round((m.fast - 1) * 100)}–${Math.round((m.slow - 1) * 100)}%` : `CSS −${Math.round((1 - m.slow) * 100)}–${Math.round((1 - m.fast) * 100)}%`;
    if (p?.swimPaceBase) { const d = imperial ? 0.9144 : 1; pace = `${mmss(p.swimPaceBase * m.fast * d)}–${mmss(p.swimPaceBase * m.slow * d)}/100 ${imperial ? "yd" : "m"}`; }
  }

  const feel = (es ? FEEL_ES : FEEL_EN)[z];
  const parts = [
    `${step.zone.toUpperCase()} · RPE ${RPE[z]}/10 (${feel})`,
    power ? `${power} (${powerPct})` : powerPct,
    pace ? `${pace} (${pacePct})` : pacePct,
    runPowerPct,
    hr ? `${hr} (${hrPct})` : hrPct,
  ].filter(Boolean);
  const e = stepEnergy(step, sport, p);
  if (e.kj != null) parts.push(`≈${e.kj} kJ`);
  return { zone: step.zone, rpe: RPE[z], feel, hr, hrPct, power, powerPct, runPowerPct, pace, pacePct, text: parts.join(" · "), kj: e.kj, kcal: e.kcal };
}

function stepEnergy(step: GuideStep, sport: string, p: GuideProfile | null | undefined): { kj: number | null; kcal: number | null; method: SessionEnergy["method"] } {
  const z = Z(step.zone), h = step.seconds / 3600;
  if ((sport === "bike") && p?.ftp) {
    const mid = z === 1 ? POWER_ZONE_UPPER_FACTORS[1] * 0.8 : (POWER_ZONE_UPPER_FACTORS[z - 1] + POWER_ZONE_UPPER_FACTORS[Math.min(6, z)]) / 2;
    const kj = Math.round((p.ftp * mid * step.seconds) / 1000);
    return { kj, kcal: kj, method: "power" }; // gross efficiency ~24% ⇒ kJ work ≈ kcal
  }
  if (p?.weightKg) {
    const met = (MET[sport] ?? MET.hyrox)[z];
    const kcal = Math.round(met * p.weightKg * h);
    return { kj: kcal, kcal, method: "met-estimate" };
  }
  return { kj: null, kcal: null, method: "unavailable" };
}

/** Session energy, carbohydrate and hydration picture. `carbsPerHour` = canonical fuel-curve intake target. */
export function sessionEnergy(steps: GuideStep[], sport: string, p: GuideProfile | null | undefined, carbsPerHour: number | null, es = false): SessionEnergy {
  const T = (en: string, sp: string) => (es ? sp : en);
  const seconds = steps.reduce((a, s) => a + s.seconds, 0), hours = seconds / 3600;
  const per = steps.map(s => ({ s, e: stepEnergy(s, sport, p) }));
  const method = per.length && per.every(x => x.e.method === "power") ? "power" : per.some(x => x.e.kj == null) ? "unavailable" : "met-estimate";
  const hydrationNote = p?.sweatRateMlH
    ? T(`Measured sweat rate ${Math.round(p.sweatRateMlH)} ml/h: plan ~${Math.round(p.sweatRateMlH * hours * 0.7)} ml (replace ~70%; aim to lose <2% body mass). Weigh before and after to update it.`, `Tasa de sudor medida ${Math.round(p.sweatRateMlH)} ml/h: planifica ~${Math.round(p.sweatRateMlH * hours * 0.7)} ml (repón ~70%; pierde <2% del peso). Pésate antes y después para actualizarla.`)
    : T("Weigh yourself before and after (dry, minimal clothing) and log fluid drunk: that gives your sweat rate and fluid plan.", "Pésate antes y después (seco, con poca ropa) y anota lo que bebes: así obtenemos tu tasa de sudor y plan de líquidos.");
  if (method === "unavailable" || !seconds) {
    return { version: "energy-v1", method: "unavailable", workKj: null, kcal: null, kjPerHour: null, kjPerKg: null, highIntensityKj: null, highIntensityPct: null, carbsBurnedG: null,
      carbsIntakeTargetG: carbsPerHour != null ? Math.round(carbsPerHour * hours) : null, carbsReplacedPct: null, fluidPlanMl: p?.sweatRateMlH ? Math.round(p.sweatRateMlH * hours * 0.7) : null, hydrationNote, recoveryCarbNote: null,
      note: T("Add body weight (or FTP for bike) to estimate kilojoules.", "Añade tu peso (o FTP en bici) para estimar kilojulios.") };
  }
  const workKj = per.reduce((a, x) => a + (x.e.kj ?? 0), 0), kcal = per.reduce((a, x) => a + (x.e.kcal ?? 0), 0);
  const highIntensityKj = per.filter(x => Z(x.s.zone) >= 4).reduce((a, x) => a + (x.e.kj ?? 0), 0);
  const carbsBurnedG = Math.round(per.reduce((a, x) => a + ((x.e.kcal ?? 0) * CHO_FRACTION[Z(x.s.zone)]) / 4, 0));
  const carbsIntakeTargetG = carbsPerHour != null ? Math.round(carbsPerHour * hours) : null;
  const recoveryCarbNote = carbsBurnedG >= 200
    ? T(`~${carbsBurnedG} g carbohydrate used. If you train hard again within 24 h, eat ~1.0–1.2 g/kg/h of carbohydrate for the first 4 h, plus ~0.3 g/kg protein.`, `~${carbsBurnedG} g de carbohidrato usados. Si vuelves a entrenar duro en <24 h, come ~1,0–1,2 g/kg/h de carbohidrato las primeras 4 h, más ~0,3 g/kg de proteína.`)
    : null;
  return {
    version: "energy-v1", method, workKj, kcal,
    kjPerHour: Math.round(workKj / hours), kjPerKg: p?.weightKg ? Math.round((workKj / p.weightKg) * 10) / 10 : null,
    highIntensityKj, highIntensityPct: workKj ? Math.round((highIntensityKj / workKj) * 100) : 0,
    carbsBurnedG, carbsIntakeTargetG, carbsReplacedPct: carbsIntakeTargetG != null && carbsBurnedG ? Math.round((carbsIntakeTargetG / carbsBurnedG) * 100) : null,
    fluidPlanMl: p?.sweatRateMlH ? Math.round(p.sweatRateMlH * hours * 0.7) : null, hydrationNote, recoveryCarbNote,
    note: method === "power"
      ? T("Mechanical work from your FTP zones (what a power meter shows). 1 kJ ≈ 1 kcal burned.", "Trabajo mecánico según tus zonas de FTP (lo que muestra un potenciómetro). 1 kJ ≈ 1 kcal gastada.")
      : T("Estimated from sport, zone and body weight (no power). Use it to compare sessions, not as a measurement.", "Estimado por deporte, zona y peso (sin potencia). Úsalo para comparar sesiones, no como medición."),
  };
}

/** Actual energy of a completed session: measured power first, then device calories, then estimate. */
export function actualSessionKj(w: { sport: string; avgPower?: number | null; actualDurationMin?: number | null; durationMin?: number | null; calories?: number | null; intensity?: string | null }, p: GuideProfile | null | undefined): { kj: number | null; source: "power" | "device-calories" | "estimate" | "unknown" } {
  const min = w.actualDurationMin ?? w.durationMin ?? null;
  if (w.avgPower && min) return { kj: Math.round((w.avgPower * min * 60) / 1000), source: "power" };
  if (w.calories) return { kj: w.calories, source: "device-calories" }; // kcal ≈ work-equivalent kJ
  if (min && p?.weightKg) return { kj: Math.round(((MET[w.sport] ?? MET.hyrox)[Z(w.intensity || "z2")]) * p.weightKg * (min / 60)), source: "estimate" };
  return { kj: null, source: "unknown" };
}

/** Compare two workouts on one scale. */
export function compareSessions(a: { kj: number | null; minutes: number; highIntensityKj?: number | null }, b: { kj: number | null; minutes: number; highIntensityKj?: number | null }) {
  if (a.kj == null || b.kj == null || !a.minutes || !b.minutes) return null;
  return {
    kjDeltaPct: Math.round(((b.kj - a.kj) / a.kj) * 100),
    densityDeltaPct: Math.round(((b.kj / b.minutes - a.kj / a.minutes) / (a.kj / a.minutes)) * 100),
    highIntensityDeltaKj: a.highIntensityKj != null && b.highIntensityKj != null ? b.highIntensityKj - a.highIntensityKj : null,
  };
}
