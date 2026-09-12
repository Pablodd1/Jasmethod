// JasMiamiMethod — Race Forecast Engine (approach B, adjudicated)
//
// Fitness-based prediction from your athlete profile (FTP / run & swim
// thresholds) + Performance Management Chart (CTL/TSB) + course conditions.
//
//   adjusted time = baseline time × heat(WBGT) × altitude × terrain × fitness
//
// Model choices follow the 2026-09-08 adjudication report: WBGT heat model
// (not linear °F+%RH), Wehrlin-linear altitude (not 1%/1000ft), federation-
// specific wetsuit legality (not a single cutoff), swim drafting capped at
// the sourced 15%, and wind + air density inside the bike physics solve.
// Every model constant lives in forecast-constants.ts with a provenance
// flag, and the forecast result surfaces that provenance.

import { type PmcResult, altitudeFactor } from "./fitness";
import { venueAdjustment, type VenueProfile, type FuelPlan } from "./adaptive";
import {
  wbgtC, wbgtCategory, runHeatPaceFactor, bikeHeatPowerFactorFromWbgt,
  dewPointAdvisory, airDensity, type WbgtResult,
} from "./weather";
import { wetsuitVerdict, type WetsuitDecision, type WetsuitCategory, type Federation } from "./wetsuit";
import { raceFuelPlan, fuelTimeline, kcalFromBikeKj, type RaceFuelPlan, type FuelSlot } from "./race-fuel";
import { provenanceRows } from "./forecast-constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AthleteSnapshot {
  ftp?: number | null;          // W
  runPaceBase?: number | null;  // sec/km threshold
  swimPaceBase?: number | null; // sec/100m threshold
  weightKg?: number | null;
  heightCm?: number | null;
  lthr?: number | null;         // bpm
  vo2max?: number | null;
  age?: number | null;          // wetsuit nuance (British Tri 60+ band)
  sweatRateMlH?: number | null; // measured — fluid plan
  sodiumMgPerL?: number | null; // measured — sodium plan
  gutTrained?: boolean;         // tolerates 90-120 g/h carbs
  draftSkill?: "none" | "mixed" | "good"; // open-water swim drafting
}

export interface ForecastVenue {
  targetTempC?: number | null;  // air temperature (°C)
  humidity?: number | null;     // %
  solarWm2?: number | null;     // shortwave radiation (WBGT globe estimate)
  cloudCover?: number | null;   // %
  windKph?: number | null;
  baseElevM?: number | null;    // venue base elevation
  bikeElevM?: number | null;    // m climb
  bikeTerrain?: string | null;  // flat | rolling | hilly | mountain | trail
  runElevM?: number | null;     // m climb
  runTerrain?: string | null;   // flat | rolling | hilly | trail
  swimVenue?: string | null;    // pool | lake | ocean | river
  waterTempC?: number | null;
  swimCurrent?: string | null;  // none | mild | strong
  federation?: Federation | string | null; // wetsuit rules
  category?: WetsuitCategory | string | null; // age_group | elite
}

export interface ForecastInput {
  athlete: AthleteSnapshot;
  fitness: Pick<PmcResult, "current" | "formZone" | "rampRate7d" | "rampWarning"> | null;
  distance: string;
  venue: ForecastVenue;
  goalTimeMin?: number | null;
}

export type ForecastSport = "triathlon" | "swim" | "bike" | "run" | "hyrox";

export interface ForecastSegment {
  sport: "swim" | "bike" | "run";
  label: string;
  distanceLabel: string;
  timeMin: number;
  pace?: string;
  speedKmh?: number;
  powerTargetW?: number;
  intensityFactor?: number;
  hrTarget?: string;
  fuel: FuelPlan;
  notes: string[];
}

export interface ForecastScenario {
  label: "best" | "worst";
  totalMin: number;
  note: string;
}

export interface ForecastResult {
  sport: ForecastSport;
  distance: string;
  distanceLabel: string;
  confidence: "high" | "medium" | "low";
  measurementGaps: string[];
  factors: string[];
  segments: ForecastSegment[];
  transitionsMin: number;
  totalMin: number;
  baselineTotalMin: number;
  goalTimeMin: number | null;
  goalDeltaMin: number | null;
  note: string;
  // --- adjudicated-engine additions ---
  wbgt?: { value: number; zone: string; note: string; dewPointC: number; advisory: string | null; method: string } | null;
  wetsuit?: WetsuitDecision | null;
  scenarios?: ForecastScenario[];
  fuelTotal?: (RaceFuelPlan & { slots: FuelSlot[]; estimatedKcalBurned: number | null }) | null;
  provenance?: Array<{ key: string; value: unknown; provenance: string; citation: string; note?: string }>;
}

// ---------------------------------------------------------------------------
// Distance tables (baseline pacing curves)
// ---------------------------------------------------------------------------

const TRI_LEGS: Record<string, { swimM: number; bikeKm: number; runKm: number; transitionMin: number }> = {
  sprint: { swimM: 750, bikeKm: 20, runKm: 5, transitionMin: 2 },
  olympic: { swimM: 1500, bikeKm: 40, runKm: 10, transitionMin: 3 },
  half: { swimM: 1900, bikeKm: 90, runKm: 21.1, transitionMin: 4 },
  full: { swimM: 3800, bikeKm: 180, runKm: 42.2, transitionMin: 5 },
};

const RUN_DISTANCES: Record<string, { km: number; label: string }> = {
  "5k": { km: 5, label: "5 km" },
  "10k": { km: 10, label: "10 km" },
  "half-marathon": { km: 21.1, label: "21.1 km" },
  marathon: { km: 42.2, label: "42.2 km" },
};

const BIKE_DISTANCES: Record<string, { km: number; speedFactor: number; label: string }> = {
  "40k": { km: 40, speedFactor: 1.0, label: "40 km" },
  "100k": { km: 100, speedFactor: 0.97, label: "100 km" },
  "180k": { km: 180, speedFactor: 0.95, label: "180 km" },
  "gran-fondo": { km: 130, speedFactor: 0.96, label: "Gran Fondo (~130 km)" },
};

const SWIM_DISTANCES: Record<string, { m: number; label: string }> = {
  "750m": { m: 750, label: "750 m" },
  "1500m": { m: 1500, label: "1500 m" },
  "1900m": { m: 1900, label: "1900 m" },
  "3800m": { m: 3800, label: "3800 m" },
};

const TRI_DISTANCE_LABELS: Record<string, string> = {
  sprint: "Sprint · 750m / 20km / 5km",
  olympic: "Olympic · 1.5km / 40km / 10km",
  half: "Half Ironman · 1.9km / 90km / 21.1km",
  full: "Full Ironman · 3.8km / 180km / 42.2km",
};

// ---------------------------------------------------------------------------
// Bike physics (Best Bike Split approach): solve steady-state velocity from
// the rider's power against gravity + rolling resistance + aero drag, with
// altitude/temperature-corrected air density and ambient wind (loop-course
// mean headwind projection).
//   P_wheel = (m·g·grade + m·g·Crr)·v + ½·ρ·CdA·(v+w)²·v
//   P_rider = P_wheel / drivetrain
// ---------------------------------------------------------------------------

export function bikePhysicsSpeedKmh(opts: {
  ftp: number; weightKg?: number | null; bikeKg?: number;
  elevGainM?: number | null; distanceKm: number; terrain?: string | null;
  sustainableIF?: number; sustainableW?: number; // holdable watts override
  venueElevM?: number | null; tempC?: number | null; windKph?: number | null;
}): { speedKmh: number; powerW: number; wheelKj: number; rho: number } {
  const m = (opts.weightKg ?? 70) + (opts.bikeKg ?? 9);
  const powerW = opts.sustainableW ?? Math.round(opts.ftp * (opts.sustainableIF ?? 0.78));
  const crr = (opts.terrain || "flat") === "trail" ? 0.008 : (opts.terrain || "flat") === "hilly" || (opts.terrain || "flat") === "mountain" ? 0.006 : 0.0045;
  const cdA = 0.28; // TUNED_DEFAULT (range 0.22–0.35) — forecast-constants
  const rho = airDensity(opts.venueElevM ?? 0, opts.tempC ?? 20);
  const drivetrain = 0.976; // VERIFIED 0.97–0.98 — forecast-constants
  const pAvail = powerW * drivetrain;
  const windMs = ((opts.windKph ?? 0) / 3.6) * 0.5; // loop-course mean projection (HEURISTIC)

  const grade = Math.min(0.08, Math.max(-0.02, (opts.elevGainM ?? 0) / (opts.distanceKm * 1000)));
  const g = 9.81;
  let v = 10;
  for (let i = 0; i < 8; i++) {
    const f = (m * g * grade + m * g * crr) * v + 0.5 * rho * cdA * Math.pow(v + windMs, 2) * v - pAvail;
    const df = (m * g * grade + m * g * crr) + 0.5 * rho * cdA * (Math.pow(v + windMs, 2) + 2 * (v + windMs) * v);
    v = Math.max(1, v - f / df);
  }
  const speedMs = v;
  const timeSec = (opts.distanceKm * 1000) / speedMs;
  return {
    speedKmh: Math.round(Math.min(70, Math.max(8, speedMs * 3.6)) * 10) / 10,
    powerW,
    wheelKj: Math.round((pAvail * timeSec) / 1000),
    rho: Math.round(rho * 1000) / 1000,
  };
}

// Riegel fatigue: T2 = T1 · (D2/D1)^(k-1) from a threshold-pace base at 10k.
// k is a TUNED_DEFAULT (1.06, published range ~1.05–1.12); adjacent-distance
// accuracy ±5%, far-apart ±15–25% — estimates.
export function riegelPace(baseSecPerKm: number, km: number, exponent = 1.06): number {
  return baseSecPerKm * Math.pow(km / 10, exponent - 1);
}

// Triathlon transition penalty: bike TSS pre-fatigues the legs. Derate run
// pace by the fraction of cost consumed on the bike — heuristically ~2%
// (sprint) to ~9% (Ironman) vs a fresh standalone run. (HEURISTIC)
function bikeTssRunPenalty(bikeKm: number): number {
  const approxTss = bikeKm * 0.85;
  if (approxTss <= 0) return 1;
  return 1 + Math.min(0.09, 0.02 * Math.sqrt(approxTss / 17));
}

// HYROX compromised-run state-space model: 8 stations × 1km run. Each
// station (sled push/pull heaviest) spikes lactate; the following run decays
// until the body clears it. (HEURISTIC — deliberately, this is a coaching
// model, not physics.)
function hyroxCompromisedRunPace(thresholdSecPerKm: number, fitness?: ForecastInput["fitness"]): {
  avgPaceSecPerKm: number; stationDecay: number; note: string;
} {
  const STATION_COSTS = [0.03, 0.05, 0.05, 0.04, 0.03, 0.015, 0.03, 0.04];
  const avgDecay = STATION_COSTS.reduce((a, b) => a + b, 0) / STATION_COSTS.length;
  const ctl = fitness?.current?.ctl ?? 30;
  const durability = Math.min(1.25, Math.max(0.85, 0.85 + ctl / 150));
  const decay = avgDecay / durability;
  return {
    avgPaceSecPerKm: Math.round(thresholdSecPerKm * (1 + decay)),
    stationDecay: decay,
    note: `State-space: 8 stations derate each following run km by ~${Math.round(decay * 100)}% (durability factor ${durability.toFixed(2)} from CTL ${Math.round(ctl)}). Sled push/pull and wall balls cost most.`,
  };
}

function triRunPaceFactor(distance: string): number {
  return ({ sprint: 0.97, olympic: 1.0, half: 1.05, full: 1.1 } as Record<string, number>)[distance] ?? 1;
}

function triBikeSpeedFactor(distance: string): number {
  return ({ sprint: 1.0, olympic: 0.99, half: 0.97, full: 0.95 } as Record<string, number>)[distance] ?? 1;
}

function triIF(distance: string): number {
  // Midpoints of the coaching bands (TUNED_DEFAULT, range in registry):
  // sprint 0.85–0.95, olympic 0.80–0.90, half 0.75–0.82, IM 0.70–0.76.
  return ({ sprint: 0.88, olympic: 0.83, half: 0.78, full: 0.72 } as Record<string, number>)[distance] ?? 0.8;
}

// ---------------------------------------------------------------------------
// Distance classification (shared with the API route + UI)
// ---------------------------------------------------------------------------

export function classifyDistance(distance: string | null | undefined): ForecastSport | null {
  const d = (distance || "").toLowerCase();
  if (d === "hyrox") return "hyrox";
  if (["sprint", "olympic", "half", "full"].includes(d)) return "triathlon";
  if (RUN_DISTANCES[d]) return "run";
  if (BIKE_DISTANCES[d]) return "bike";
  if (SWIM_DISTANCES[d]) return "swim";
  return null; // boxing / unknown → not a forecastable endurance event
}

export const FORECASTABLE_DISTANCES = [
  "sprint", "olympic", "half", "full",
  "5k", "10k", "half-marathon", "marathon",
  "40k", "100k", "180k", "gran-fondo",
  "750m", "1500m", "1900m", "3800m",
  "hyrox",
];

// ---------------------------------------------------------------------------
// Formatting helpers (shared with the page)
// ---------------------------------------------------------------------------

export function fmtSecPerKm(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} /km`;
}

export function fmtSecPer100m(sec: number): string {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} /100m`;
}

export function fmtTime(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m} min`;
}

// ---------------------------------------------------------------------------
// Terrain + climb factors (pace multiplier, >1 = slower)
// ---------------------------------------------------------------------------

function terrainPaceFactor(terrain?: string | null, elevM?: number | null): number {
  const t = (terrain || "flat").toLowerCase();
  const climb = elevM ?? 0;
  let base = 1;
  if (t === "rolling") base = 1.02;
  else if (t === "hilly") base = 1.05;
  else if (t === "mountain") base = 1.1;
  else if (t === "trail") base = 1.06;
  const climbFactor = Math.min(1.15, 1 + (climb / 100) * 0.005);
  return Math.round(base * climbFactor * 1000) / 1000;
}

// ---------------------------------------------------------------------------
// Fitness adjustment from PMC (TSB + CTL; target form zone −10..+10)
// ---------------------------------------------------------------------------

function fitnessPaceFactor(
  fitness: ForecastInput["fitness"],
  distance: string,
): { paceFactor: number; note: string | null } {
  if (!fitness) return { paceFactor: 1, note: "No training history yet — forecast uses baseline thresholds only." };
  const tsb = fitness.current?.tsb ?? 0;
  const ctl = fitness.current?.ctl ?? 0;
  const notes: string[] = [];
  let pace = 1;
  if (tsb >= 10) {
    pace = 0.99;
    notes.push(`Form is high (TSB ${Math.round(tsb)}) — fresh legs, no fatigue buffer needed.`);
  } else if (tsb >= -10) {
    notes.push(`Form neutral (TSB ${Math.round(tsb)}) — inside the ideal −10..+10 race window.`);
  } else if (tsb >= -30) {
    pace = 1.02;
    notes.push(`Fatigued (TSB ${Math.round(tsb)}) — pacing eased ~2% to hold form through the race.`);
  } else {
    pace = 1.04;
    notes.push(`Deeply fatigued (TSB ${Math.round(tsb)}) — forecast assumes a careful ~4% buffer; prioritize recovery pre-race.`);
  }
  if (ctl < 40 && (distance === "full" || distance === "half" || distance === "marathon" || distance === "half-marathon")) {
    pace = Math.round(pace * 1.02 * 1000) / 1000;
    notes.push(`CTL ${Math.round(ctl)} is low for this distance — added a durability buffer.`);
  }
  if (fitness.rampRate7d > 8) notes.push(`Ramp rate ${fitness.rampRate7d} CTL/wk is high — this forecast assumes you arrive healthy, not more injured.`);
  return { paceFactor: pace, note: notes.join(" ") || null };
}

// ---------------------------------------------------------------------------
// Environment: WBGT + altitude, shared across disciplines
// ---------------------------------------------------------------------------

const PROVENANCE_KEYS = [
  "wbgt_weights", "globe_temp_est_coeffs", "heat_run_curve_anchors", "heat_bike_curve_anchors",
  "power_loss_percent_per_1000ft_altitude", "altitude_pace_transmission",
  "riegel_b_default", "intensity_factor_bands", "cda_default_tri", "drivetrain_efficiency",
  "wind_loop_headwind_fraction", "swim_draft_energy_savings_max", "swim_draft_time_transmission",
  "wetsuit_speed_benefit", "open_water_penalty", "carbs_g_per_hour_bands",
  "fluid_ml_per_hour_default", "sodium_mg_per_l_default", "tsb_race_target",
];

interface EnvModel {
  wbgt: number;
  windKph: number;
  runPaceFactor: number;   // heat × altitude on pace
  bikePowerFactor: number; // heat × altitude on sustainable watts
  swimPaceFactor: number;  // altitude mainly (swim starts early/cooler)
}

function buildEnv(v: ForecastVenue, overrides?: { wbgt?: number; windKph?: number }): EnvModel {
  const tempC = v.targetTempC ?? 20;
  const rh = v.humidity ?? 60;
  const w = wbgtC({
    tempC,
    humidity: rh,
    solarWm2: v.solarWm2 ?? undefined,
    windKph: v.windKph ?? undefined,
  });
  const wbgt = Math.max(0, overrides?.wbgt ?? w.wbgtC);
  const windKph = overrides?.windKph ?? (v.windKph ?? 0);
  const alt = altitudeFactor(v.baseElevM ?? 0);
  return {
    wbgt,
    windKph,
    runPaceFactor: runHeatPaceFactor(wbgt) * alt.paceFactor,
    bikePowerFactor: bikeHeatPowerFactorFromWbgt(wbgt) * alt.vo2factor,
    swimPaceFactor: alt.paceFactor,
  };
}

// Map the detailed race fuel plan onto the segment FuelPlan shape the UI
// already renders (adds kcal + timing without changing the contract).
function toFuelPlan(fuel: RaceFuelPlan): FuelPlan {
  return {
    carbsPerHourG: fuel.carbsGPerHour,
    sodiumMgPerHour: fuel.sodiumMgPerHour,
    fluidMlPerHour: fuel.fluidMlPerHour,
    kcalPerHour: fuel.kcalPerHour || undefined,
    caffeineMg: fuel.caffeineMg ?? undefined,
    notes: [fuel.carbsBand, fuel.notes.join(" "), fuel.caffeineTiming ?? ""].filter(Boolean).join(" "),
  };
}

// ---------------------------------------------------------------------------
// Main forecast
// ---------------------------------------------------------------------------

export function forecastRace(input: ForecastInput): ForecastResult | null {
  const { athlete, fitness, distance, venue } = input;
  const sport = classifyDistance(distance);
  if (!sport) return null;

  const measurementGaps: string[] = [];
  const factors: string[] = [];
  const v: VenueProfile & { federation?: string; category?: string } = {
    targetTempC: venue.targetTempC ?? undefined,
    humidity: venue.humidity ?? undefined,
    baseElevM: venue.baseElevM ?? undefined,
    bikeElevM: venue.bikeElevM ?? undefined,
    bikeTerrain: venue.bikeTerrain ?? undefined,
    runElevM: venue.runElevM ?? undefined,
    runTerrain: venue.runTerrain ?? undefined,
    swimVenue: venue.swimVenue ?? undefined,
    waterTempC: venue.waterTempC ?? undefined,
    swimCurrent: venue.swimCurrent ?? undefined,
    federation: venue.federation ?? undefined,
    category: venue.category ?? undefined,
  };
  const venuePlan = venueAdjustment(v);

  // --- environment model (WBGT + altitude) ---
  const env = buildEnv(venue);
  const wbgtInfo = wbgtC({
    tempC: venue.targetTempC ?? 20,
    humidity: venue.humidity ?? 60,
    solarWm2: venue.solarWm2 ?? undefined,
    windKph: venue.windKph ?? undefined,
  });
  const cat = wbgtCategory(wbgtInfo.wbgtC);
  const dewAdvisory = dewPointAdvisory(wbgtInfo.dewPointC);
  if (venue.targetTempC != null || venue.humidity != null) {
    factors.push(`Heat (WBGT): ${wbgtInfo.wbgtC}°C (${cat.zone === "ok" ? "manageable" : cat.zone.replace("_", "-")}) — run pace ×${env.runPaceFactor.toFixed(2)} vs neutral, bike watts held to ${Math.round(env.bikePowerFactor * 100)}% of FTP-based target. ${cat.note}`);
    if (dewAdvisory) factors.push(dewAdvisory);
  }
  const altInfo = venue.baseElevM != null ? altitudeFactor(venue.baseElevM) : null;
  if (altInfo && venue.baseElevM != null && venue.baseElevM > 150) {
    factors.push(`Altitude ${venue.baseElevM}m → sustainable aerobic power ~${Math.round((1 - altInfo.vo2factor) * 100)}% lower (Wehrlin-linear, tunable). ${altInfo.advice}`);
  }
  if (venue.windKph != null && venue.windKph > 10) {
    factors.push(`Wind ${venue.windKph} kph (loop-course mean projection) is inside the bike physics solve — expect more time loss than the tailwind gives back.`);
  }

  const fit = fitnessPaceFactor(fitness, distance);
  if (fit.note) factors.push(fit.note);

  const goalTimeMin = input.goalTimeMin ?? null;

  // --- wetsuit verdict (federation-specific, always surfaced) ---
  let wetsuit: WetsuitDecision | null = null;
  let wetsuitPaceFactor = 1;
  if (venue.waterTempC != null && (sport === "triathlon" || sport === "swim")) {
    wetsuit = wetsuitVerdict(venue.waterTempC, {
      federation: venue.federation,
      category: venue.category,
      age: athlete.age ?? undefined,
      swimM: sport === "triathlon" ? TRI_LEGS[distance]?.swimM : (SWIM_DISTANCES[distance]?.m ?? undefined),
    });
    factors.push(`Wetsuit (${wetsuit.federation}): ${wetsuit.note} Source: ${wetsuit.citation}. VERIFY against the current rulebook — rules change.`);
    if (wetsuit.legal !== false && venue.swimVenue && venue.swimVenue.toLowerCase() !== "pool") {
      wetsuitPaceFactor = 1 - 0.03; // TUNED_DEFAULT buoyancy benefit (2–5%)
    }
  }

  // --- swim drafting (0–15% energy per Chatard & Wilson; conservative map) ---
  const draftSkill = athlete.draftSkill ?? "none";
  const draftEnergySave = draftSkill === "good" ? 0.13 : draftSkill === "mixed" ? 0.08 : 0;
  const draftPaceFactor = 1 - draftEnergySave * 0.4; // TUNED_DEFAULT transmission
  if (draftEnergySave > 0 && sport !== "bike" && sport !== "run" && sport !== "hyrox") {
    factors.push(`Swim drafting (${draftSkill} feet-skill): ~${Math.round(draftEnergySave * 100)}% energy saved at close distance → conservatively ~${Math.round((1 - draftPaceFactor) * 100)}% faster swim. Sourced cap is 15% — anything more is cycling data, not swimming.`);
  }

  const segments: ForecastSegment[] = [];
  let baselineTotalMin = 0;
  let transitionsMin = 0;

  // --- fuel (whole race; per-segment views below) ---
  // Fluid scaling with WBGT is a mild heuristic: +1.2% fluid per WBGT °C
  // above 18, capped at +25%.
  const fluidHeat = Math.min(1.25, 1 + Math.max(0, env.wbgt - 18) * 0.012);

  // =======================================================================
  // Triathlon
  // =======================================================================
  if (sport === "triathlon") {
    const leg = TRI_LEGS[distance];
    const distanceLabel = TRI_DISTANCE_LABELS[distance] || distance;
    const runPaceBase = athlete.runPaceBase ?? 300;
    if (!athlete.runPaceBase) measurementGaps.push("No run threshold — using 5:00/km default.");
    const swimPaceBase = athlete.swimPaceBase ?? 100;
    if (!athlete.swimPaceBase) measurementGaps.push("No swim threshold — using 1:40/100m default.");
    const ftp = athlete.ftp ?? 220;
    if (!athlete.ftp) measurementGaps.push("No FTP — using 220W default.");

    const openWater = (venue.swimVenue || "pool").toLowerCase() !== "pool";
    const currentFactor = venue.swimCurrent === "strong" ? 1.04 : venue.swimCurrent === "mild" ? 1.02 : 1;
    const coldFactor = venue.waterTempC != null && venue.waterTempC < 18 ? 1.03 : 1;
    const owPenalty = openWater ? 1 + 0.05 : 1; // TUNED_DEFAULT sighting/chop
    const swimPace = swimPaceBase * owPenalty * currentFactor * coldFactor * wetsuitPaceFactor * draftPaceFactor * env.swimPaceFactor;
    const swimMin = (leg.swimM / 100) * swimPace / 60;

    const bikeIF = triIF(distance) * triBikeSpeedFactor(distance);
    const sustainableW = Math.round(ftp * bikeIF * env.bikePowerFactor);
    const physics = bikePhysicsSpeedKmh({
      ftp, weightKg: athlete.weightKg, bikeKg: 9,
      elevGainM: venue.bikeElevM, distanceKm: leg.bikeKm, terrain: venue.bikeTerrain,
      sustainableW,
      venueElevM: venue.baseElevM, tempC: venue.targetTempC, windKph: env.windKph,
    });
    const bikeMin = leg.bikeKm / physics.speedKmh * 60;

    const runBasePace = runPaceBase * triRunPaceFactor(distance);
    const tssPenalty = bikeTssRunPenalty(leg.bikeKm);
    const runPace = runBasePace * tssPenalty * env.runPaceFactor * terrainPaceFactor(venue.runTerrain, venue.runElevM) * fit.paceFactor;
    const runMin = (leg.runKm * runPace) / 60;

    const totalMin = swimMin + bikeMin + runMin + leg.transitionMin;
    transitionsMin = leg.transitionMin;

    // Baseline = the same course at neutral weather (no heat, no wind) —
    // altitude/terrain stay in so the delta isolates weather + fitness.
    const neutralEnv = buildEnv({}, { wbgt: 15, windKph: 0 });
    const neutralPhysics = bikePhysicsSpeedKmh({
      ftp, weightKg: athlete.weightKg, bikeKg: 9,
      elevGainM: venue.bikeElevM, distanceKm: leg.bikeKm, terrain: venue.bikeTerrain,
      sustainableW: Math.round(ftp * bikeIF * neutralEnv.bikePowerFactor),
      venueElevM: venue.baseElevM, tempC: 20, windKph: 0,
    });
    baselineTotalMin = Math.round(
      (leg.swimM / 100) * swimPaceBase / 60 +
      leg.bikeKm / neutralPhysics.speedKmh * 60 +
      (leg.runKm * runBasePace * tssPenalty * neutralEnv.runPaceFactor * terrainPaceFactor(venue.runTerrain, venue.runElevM) * fit.paceFactor) / 60 +
      leg.transitionMin,
    );

    // --- scenarios: weather band (best/expected/worst) ---
    const scenarioTotals = (o: { wbgt?: number; windKph?: number }) => {
      const e = buildEnv(venue, o);
      const ph = bikePhysicsSpeedKmh({
        ftp, weightKg: athlete.weightKg, bikeKg: 9,
        elevGainM: venue.bikeElevM, distanceKm: leg.bikeKm, terrain: venue.bikeTerrain,
        sustainableW: Math.round(ftp * bikeIF * e.bikePowerFactor),
        venueElevM: venue.baseElevM, tempC: venue.targetTempC, windKph: e.windKph,
      });
      return (
        swimMin +
        leg.bikeKm / ph.speedKmh * 60 +
        (leg.runKm * runBasePace * tssPenalty * e.runPaceFactor * terrainPaceFactor(venue.runTerrain, venue.runElevM) * fit.paceFactor) / 60 +
        leg.transitionMin
      );
    };
    const scenarios: ForecastScenario[] = [
      { label: "best", totalMin: Math.round(scenarioTotals({ wbgt: Math.max(0, env.wbgt - 3), windKph: Math.round(env.windKph * 0.7) })), note: "cooler + lighter wind" },
      { label: "worst", totalMin: Math.round(scenarioTotals({ wbgt: env.wbgt + 3, windKph: Math.min(45, Math.round(env.windKph * 1.3)) })), note: "hotter + windier" },
    ];

    // --- fuel: whole-race plan + timeline; kcal burn from bike work ---
    const fuel = raceFuelPlan({
      durationMin: totalMin,
      gutTrained: athlete.gutTrained,
      sweatRateMlH: athlete.sweatRateMlH,
      sodiumMgPerL: athlete.sodiumMgPerL,
      heatFactor: fluidHeat,
      weightKg: athlete.weightKg,
    });
    const slots = fuelTimeline(fuel, { discipline: "triathlon", totalMin: Math.round(totalMin), transitionMin: Math.round(swimMin + bikeMin) });
    const estimatedKcalBurned = kcalFromBikeKj(physics.wheelKj) + Math.round((leg.runKm * (athlete.weightKg ?? 70) * 1.036));
    fuel.gaps.push(`Calories: ${Math.round(fuel.totalKcalIntake)} kcal from carbs is your INTAKE plan; full expenditure ≈ ${estimatedKcalBurned} kcal (bike work / gross efficiency + run km × weight). You cannot absorb it all — that's normal for long-course; fueling limits the hole, it doesn't close it.`);

    segments.push({
      sport: "swim",
      label: "Swim",
      distanceLabel: `${leg.swimM >= 1000 ? leg.swimM / 1000 + " km" : leg.swimM + " m"}`,
      timeMin: Math.round(swimMin),
      pace: fmtSecPer100m(swimPace),
      fuel: toFuelPlan(fuel),
      notes: [venuePlan.swim.detail, wetsuit ? `Wetsuit: ${wetsuit.note} (${wetsuit.citation} — verify current rules).` : null,
        draftEnergySave > 0 ? `Drafting plan: ${draftSkill} skill → target feet/buoy line, sight every 4–6 strokes.` : "Drafting: find feet early — even mixed skill saves ~8% energy vs swimming alone."].filter(Boolean) as string[],
    });
    segments.push({
      sport: "bike",
      label: "Bike",
      distanceLabel: `${leg.bikeKm} km`,
      timeMin: Math.round(bikeMin),
      speedKmh: physics.speedKmh,
      powerTargetW: sustainableW,
      intensityFactor: Math.round(bikeIF * 100) / 100,
      hrTarget: athlete.lthr ? `${Math.round(athlete.lthr * 0.82)}-${Math.round(athlete.lthr * 0.9)} bpm` : undefined,
      fuel: toFuelPlan(fuel),
      notes: [
        venuePlan.bike.detail,
        venuePlan.bike.training,
        `Physics solve: ${sustainableW}W (${Math.round(bikeIF * env.bikePowerFactor * 100)}% FTP after heat/altitude derate) vs gravity+Crr+aero — CdA 0.28 (tune yours!), Crr by terrain, ρ ${physics.rho} kg/m³ at ${venue.baseElevM ?? 0}m, wind ${env.windKph} kph loop-mean.`,
        `Energy: ${physics.wheelKj} kJ of wheel work ≈ ${kcalFromBikeKj(physics.wheelKj)} kcal burned.`,
      ].filter(Boolean),
    });
    segments.push({
      sport: "run",
      label: "Run",
      distanceLabel: `${leg.runKm} km`,
      timeMin: Math.round(runMin),
      pace: fmtSecPerKm(runPace),
      hrTarget: athlete.lthr ? `${Math.round(athlete.lthr * 0.85)}-${Math.round(athlete.lthr * 0.95)} bpm` : undefined,
      fuel: toFuelPlan(fuel),
      notes: [venuePlan.run.detail, `Transition penalty: bike load derates run pace ×${tssPenalty.toFixed(2)} vs fresh. Riegel durability curve k=1.06 (tune to your race history).`].filter(Boolean),
    });

    const totalRounded = Math.round(totalMin);
    measurementGaps.push(...fuel.gaps);
    if (!athlete.gutTrained && totalMin > 150) measurementGaps.push("Gut training: race-day absorption caps around 60–90 g/h carbs unless trained — practice the race fuel plan in training.");

    return buildResult({
      sport, distance, distanceLabel, confidence: confidenceOf(sport, athlete, fitness),
      measurementGaps, factors, segments, transitionsMin,
      totalMin: totalRounded, baselineTotalMin, goalTimeMin,
      wbgt: venue.targetTempC != null || venue.humidity != null ? {
        value: wbgtInfo.wbgtC, zone: cat.zone, note: cat.note,
        dewPointC: wbgtInfo.dewPointC, advisory: dewAdvisory, method: wbgtInfo.method,
      } : null,
      wetsuit, scenarios, fuelTotal: { ...fuel, slots, estimatedKcalBurned },
      note: null,
    });
  }

  // =======================================================================
  // Run only
  // =======================================================================
  if (sport === "run") {
    const r = RUN_DISTANCES[distance];
    const runPaceBase = athlete.runPaceBase ?? 300;
    if (!athlete.runPaceBase) measurementGaps.push("No run threshold — using 5:00/km default.");
    const runBasePace = riegelPace(runPaceBase, r.km, 1.06);
    const runPace = runBasePace * env.runPaceFactor * terrainPaceFactor(venue.runTerrain, venue.runElevM) * fit.paceFactor;
    const runMin = (r.km * runPace) / 60;
    baselineTotalMin = Math.round((r.km * runBasePace) / 60);
    const fuel = raceFuelPlan({
      durationMin: runMin, gutTrained: athlete.gutTrained,
      sweatRateMlH: athlete.sweatRateMlH, sodiumMgPerL: athlete.sodiumMgPerL,
      heatFactor: fluidHeat, weightKg: athlete.weightKg,
    });
    const slots = fuelTimeline(fuel, { discipline: "run", totalMin: Math.round(runMin) });
    measurementGaps.push(...fuel.gaps);
    const best = Math.round((r.km * runBasePace * buildEnv(venue, { wbgt: Math.max(0, env.wbgt - 3) }).runPaceFactor * terrainPaceFactor(venue.runTerrain, venue.runElevM) * fit.paceFactor) / 60);
    const worst = Math.round((r.km * runBasePace * buildEnv(venue, { wbgt: env.wbgt + 3 }).runPaceFactor * terrainPaceFactor(venue.runTerrain, venue.runElevM) * fit.paceFactor) / 60);
    segments.push({
      sport: "run",
      label: "Run",
      distanceLabel: r.label,
      timeMin: Math.round(runMin),
      pace: fmtSecPerKm(runPace),
      hrTarget: athlete.lthr ? `${Math.round(athlete.lthr * 0.85)}-${Math.round(athlete.lthr * 0.95)} bpm` : undefined,
      fuel: toFuelPlan(fuel),
      notes: [venuePlan.run.detail, "Riegel k=1.06 from your threshold — ±5% adjacent distances, ±15–25% extrapolated far (5k→marathon). Tune k to your own race history."].filter(Boolean),
    });
    return buildResult({
      sport, distance, distanceLabel: r.label, confidence: confidenceOf(sport, athlete, fitness),
      measurementGaps, factors, segments, transitionsMin: 0,
      totalMin: Math.round(runMin), baselineTotalMin, goalTimeMin,
      wbgt: venue.targetTempC != null || venue.humidity != null ? {
        value: wbgtInfo.wbgtC, zone: cat.zone, note: cat.note,
        dewPointC: wbgtInfo.dewPointC, advisory: dewAdvisory, method: wbgtInfo.method,
      } : null,
      wetsuit: null,
      scenarios: [{ label: "best", totalMin: best, note: "cooler" }, { label: "worst", totalMin: worst, note: "hotter" }],
      fuelTotal: { ...fuel, slots, estimatedKcalBurned: Math.round(r.km * (athlete.weightKg ?? 70) * 1.036) },
      note: null,
    });
  }

  // =======================================================================
  // Bike only
  // =======================================================================
  if (sport === "bike") {
    const b = BIKE_DISTANCES[distance];
    const ftp = athlete.ftp ?? 220;
    if (!athlete.ftp) measurementGaps.push("No FTP — using 220W default.");
    const bikeIF = (b.km >= 150 ? 0.72 : b.km >= 70 ? 0.78 : b.km >= 30 ? 0.83 : 0.88) * b.speedFactor;
    const sustainableW = Math.round(ftp * bikeIF * env.bikePowerFactor);
    const physics = bikePhysicsSpeedKmh({
      ftp, weightKg: athlete.weightKg, bikeKg: 9,
      elevGainM: venue.bikeElevM, distanceKm: b.km, terrain: venue.bikeTerrain,
      sustainableW,
      venueElevM: venue.baseElevM, tempC: venue.targetTempC, windKph: env.windKph,
    });
    const bikeMin = b.km / physics.speedKmh * 60;
    const neutralEnv = buildEnv({}, { wbgt: 15, windKph: 0 });
    const neutralPhysics = bikePhysicsSpeedKmh({
      ftp, weightKg: athlete.weightKg, bikeKg: 9,
      elevGainM: venue.bikeElevM, distanceKm: b.km, terrain: venue.bikeTerrain,
      sustainableW: Math.round(ftp * bikeIF * neutralEnv.bikePowerFactor),
      venueElevM: venue.baseElevM, tempC: 20, windKph: 0,
    });
    baselineTotalMin = Math.round(b.km / neutralPhysics.speedKmh * 60);
    const fuel = raceFuelPlan({
      durationMin: bikeMin, gutTrained: athlete.gutTrained,
      sweatRateMlH: athlete.sweatRateMlH, sodiumMgPerL: athlete.sodiumMgPerL,
      heatFactor: fluidHeat, weightKg: athlete.weightKg,
    });
    const slots = fuelTimeline(fuel, { discipline: "bike", totalMin: Math.round(bikeMin) });
    measurementGaps.push(...fuel.gaps);
    const scenarioTotal = (o: { wbgt?: number; windKph?: number }) => {
      const e = buildEnv(venue, o);
      const ph = bikePhysicsSpeedKmh({
        ftp, weightKg: athlete.weightKg, bikeKg: 9,
        elevGainM: venue.bikeElevM, distanceKm: b.km, terrain: venue.bikeTerrain,
        sustainableW: Math.round(ftp * bikeIF * e.bikePowerFactor),
        venueElevM: venue.baseElevM, tempC: venue.targetTempC, windKph: e.windKph,
      });
      return Math.round(b.km / ph.speedKmh * 60);
    };
    segments.push({
      sport: "bike",
      label: "Bike",
      distanceLabel: b.label,
      timeMin: Math.round(bikeMin),
      speedKmh: physics.speedKmh,
      powerTargetW: sustainableW,
      intensityFactor: Math.round(bikeIF * 100) / 100,
      hrTarget: athlete.lthr ? `${Math.round(athlete.lthr * 0.82)}-${Math.round(athlete.lthr * 0.9)} bpm` : undefined,
      fuel: toFuelPlan(fuel),
      notes: [
        venuePlan.bike.detail, venuePlan.bike.training,
        `Physics: ${sustainableW}W (${Math.round(bikeIF * env.bikePowerFactor * 100)}% FTP after heat/altitude derate) — ρ ${physics.rho} kg/m³, wind ${env.windKph} kph loop-mean, CdA 0.28 (tune from field tests).`,
        `Energy: ${physics.wheelKj} kJ wheel work ≈ ${kcalFromBikeKj(physics.wheelKj)} kcal burned.`,
      ].filter(Boolean),
    });
    return buildResult({
      sport, distance, distanceLabel: b.label, confidence: confidenceOf(sport, athlete, fitness),
      measurementGaps, factors, segments, transitionsMin: 0,
      totalMin: Math.round(bikeMin), baselineTotalMin, goalTimeMin,
      wbgt: venue.targetTempC != null || venue.humidity != null ? {
        value: wbgtInfo.wbgtC, zone: cat.zone, note: cat.note,
        dewPointC: wbgtInfo.dewPointC, advisory: dewAdvisory, method: wbgtInfo.method,
      } : null,
      wetsuit: null,
      scenarios: [
        { label: "best", totalMin: scenarioTotal({ wbgt: Math.max(0, env.wbgt - 3), windKph: Math.round(env.windKph * 0.7) }), note: "cooler + lighter wind" },
        { label: "worst", totalMin: scenarioTotal({ wbgt: env.wbgt + 3, windKph: Math.min(45, Math.round(env.windKph * 1.3)) }), note: "hotter + windier" },
      ],
      fuelTotal: { ...fuel, slots, estimatedKcalBurned: kcalFromBikeKj(physics.wheelKj) },
      note: null,
    });
  }

  // =======================================================================
  // HYROX (state-space compromised-run model)
  // =======================================================================
  if (sport === "hyrox") {
    const runPaceBase = athlete.runPaceBase ?? 300;
    if (!athlete.runPaceBase) measurementGaps.push("No run threshold — using 5:00/km default.");
    const hyrox = hyroxCompromisedRunPace(runPaceBase, fitness);
    const runMinTotal = (8 * hyrox.avgPaceSecPerKm) / 60;
    const ctl = fitness?.current?.ctl ?? 30;
    const stationScale = Math.min(1.25, Math.max(0.8, 1.05 - ctl / 200));
    const STATION_SECONDS = [75, 110, 110, 85, 75, 50, 85, 95];
    const stationMinTotal = (STATION_SECONDS.reduce((a, b) => a + b, 0) * stationScale) / 60;
    const totalMin = runMinTotal + stationMinTotal;
    const fuel = raceFuelPlan({
      durationMin: totalMin, gutTrained: athlete.gutTrained,
      sweatRateMlH: athlete.sweatRateMlH, sodiumMgPerL: athlete.sodiumMgPerL,
      heatFactor: fluidHeat, weightKg: athlete.weightKg,
    });
    segments.push({
      sport: "run",
      label: "Compromised runs",
      distanceLabel: "8 × 1 km",
      timeMin: Math.round(runMinTotal),
      pace: fmtSecPerKm(hyrox.avgPaceSecPerKm),
      fuel: toFuelPlan(fuel),
      notes: [hyrox.note, "Each run km is paced at threshold + station decay — fresh legs only for km 1."],
    });
    segments.push({
      sport: "run",
      label: "8 functional stations",
      distanceLabel: "ski · sled ×2 · burpees · row · farmers · lunges · wall balls",
      timeMin: Math.round(stationMinTotal),
      fuel: toFuelPlan(fuel),
      notes: [`Station load scaled ×${stationScale.toFixed(2)} by durability (CTL ${Math.round(ctl)}).`],
    });
    factors.push(`HYROX state-space: mean run-pace decay ${Math.round(hyrox.stationDecay * 100)}% per station.`);
    return buildResult({
      sport, distance, distanceLabel: "HYROX · 8 × 1km + 8 stations",
      confidence: confidenceOf(sport, athlete, fitness),
      measurementGaps, factors, segments, transitionsMin: 0,
      totalMin: Math.round(totalMin), baselineTotalMin: Math.round(totalMin), goalTimeMin,
      wbgt: null, wetsuit: null, scenarios: [], fuelTotal: null, note: null,
    });
  }

  // =======================================================================
  // Swim only
  // =======================================================================
  const s = SWIM_DISTANCES[distance];
  const swimPaceBase = athlete.swimPaceBase ?? 100;
  if (!athlete.swimPaceBase) measurementGaps.push("No swim threshold — using 1:40/100m default.");
  const openWater = (venue.swimVenue || "pool").toLowerCase() !== "pool";
  const currentFactor = venue.swimCurrent === "strong" ? 1.04 : venue.swimCurrent === "mild" ? 1.02 : 1;
  const coldFactor = venue.waterTempC != null && venue.waterTempC < 18 ? 1.03 : 1;
  const swimPace = swimPaceBase * (openWater ? 1 + 0.05 : 1) * currentFactor * coldFactor * wetsuitPaceFactor * draftPaceFactor * env.swimPaceFactor;
  const swimMin = (s.m / 100) * swimPace / 60;
  baselineTotalMin = Math.round((s.m / 100) * swimPaceBase / 60);
  const fuel = raceFuelPlan({ durationMin: swimMin, heatFactor: 1, weightKg: athlete.weightKg });
  segments.push({
    sport: "swim",
    label: "Swim",
    distanceLabel: s.label,
    timeMin: Math.round(swimMin),
    pace: fmtSecPer100m(swimPace),
    fuel: toFuelPlan(fuel),
    notes: [venuePlan.swim.detail, wetsuit ? `Wetsuit: ${wetsuit.note} (${wetsuit.citation} — verify current rules).` : null].filter(Boolean) as string[],
  });
  return buildResult({
    sport, distance, distanceLabel: s.label, confidence: confidenceOf(sport, athlete, fitness),
    measurementGaps, factors, segments, transitionsMin: 0,
    totalMin: Math.round(swimMin), baselineTotalMin, goalTimeMin,
    wbgt: null, wetsuit, scenarios: [], fuelTotal: { ...fuel, slots: fuelTimeline(fuel, { discipline: "run", totalMin: Math.round(swimMin) }), estimatedKcalBurned: null },
    note: null,
  });
}

// ---------------------------------------------------------------------------
// Shared result assembly
// ---------------------------------------------------------------------------

function confidenceOf(sport: ForecastSport, athlete: AthleteSnapshot, fitness: ForecastInput["fitness"]): ForecastResult["confidence"] {
  const hasFtp = athlete.ftp != null;
  const hasRunPace = athlete.runPaceBase != null;
  const hasSwimPace = athlete.swimPaceBase != null;
  const relevantMeasured =
    sport === "triathlon" ? [hasFtp, hasRunPace, hasSwimPace].filter(Boolean).length
    : sport === "bike" ? (hasFtp ? 1 : 0)
    : sport === "run" || sport === "hyrox" ? (hasRunPace ? 1 : 0)
    : (hasSwimPace ? 1 : 0);
  const relevantTotal = sport === "triathlon" ? 3 : 1;
  if (fitness && relevantMeasured >= relevantTotal) return "high";
  if (fitness || relevantMeasured >= 1) return "medium";
  return "low";
}

function buildResult(o: {
  sport: ForecastSport; distance: string; distanceLabel: string;
  confidence: ForecastResult["confidence"];
  measurementGaps: string[]; factors: string[]; segments: ForecastSegment[];
  transitionsMin: number; totalMin: number; baselineTotalMin: number;
  goalTimeMin: number | null;
  wbgt: ForecastResult["wbgt"]; wetsuit: WetsuitDecision | null;
  scenarios: ForecastScenario[]; fuelTotal: ForecastResult["fuelTotal"];
  note: string | null;
}): ForecastResult {
  const goalDeltaMin = o.goalTimeMin != null ? o.totalMin - o.goalTimeMin : null;
  const worst = Math.max(...o.scenarios.map((s) => s.totalMin), o.totalMin);
  const best = Math.min(...o.scenarios.map((s) => s.totalMin), o.totalMin);
  const note =
    goalDeltaMin != null && goalDeltaMin > 0
      ? `Forecast is ~${fmtTime(goalDeltaMin)} slower than your goal — the gap to close is ${fmtTime(Math.max(1, goalDeltaMin))} (worst-case band: ${fmtTime(worst - (o.goalTimeMin ?? 0))} over goal).`
      : goalDeltaMin != null
        ? `Forecast is on/under goal by ~${fmtTime(Math.abs(goalDeltaMin))} (band ${fmtTime(best)}–${fmtTime(worst)}).`
        : o.confidence === "low"
          ? "Confidence is low — complete your setup (FTP, run/swim thresholds) and log a few weeks of training to tighten this."
          : "Re-run after each benchmark test (FTP / 5k / CSS) and again 48h out with the live weather forecast to keep this tight.";
  return {
    sport: o.sport,
    distance: o.distance,
    distanceLabel: o.distanceLabel,
    confidence: o.confidence,
    measurementGaps: o.measurementGaps,
    factors: o.factors,
    segments: o.segments,
    transitionsMin: o.transitionsMin,
    totalMin: o.totalMin,
    baselineTotalMin: o.baselineTotalMin,
    goalTimeMin: o.goalTimeMin,
    goalDeltaMin,
    note,
    wbgt: o.wbgt,
    wetsuit: o.wetsuit,
    scenarios: o.scenarios,
    fuelTotal: o.fuelTotal,
    provenance: provenanceRows(PROVENANCE_KEYS),
  };
}
