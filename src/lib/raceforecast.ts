// JasMiamiMethod — Race Forecast Engine (approach B)
// Fitness-based prediction from your athlete profile (FTP / run & swim
// thresholds) + Performance Management Chart (CTL/TSB) + course conditions.
//
// It unifies the previously-scattered building blocks — predictRace baseline,
// venueAdjustment, heatIndex (Rothfusz), altitudeFactor (Bärtsch & Saltin 2008),
// temperatureAdjustment (Ely 2007 / Casa 2000) and recommendFuel (Thomas 2016) —
// into ONE transparent, bounded forecast:
//
//   adjusted time = baseline time × heat × altitude × terrain × climb × fitness
//
// Every factor is surfaced as a human-readable bullet so the athlete can see
// exactly why the number moved. Estimates are heuristics, clearly labeled.

import { type PmcResult } from "./fitness";
import { venueAdjustment, recommendFuel, type VenueProfile, type FuelPlan } from "./adaptive";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AthleteSnapshot {
  ftp?: number | null;        // W
  runPaceBase?: number | null;  // sec/km threshold
  swimPaceBase?: number | null; // sec/100m threshold
  weightKg?: number | null;
  heightCm?: number | null;
  lthr?: number | null;       // bpm
  vo2max?: number | null;
}

export interface ForecastVenue {
  targetTempC?: number | null;
  humidity?: number | null;   // %
  baseElevM?: number | null;  // m
  bikeElevM?: number | null;  // m climb
  bikeTerrain?: string | null; // flat | rolling | hilly | mountain | trail
  runElevM?: number | null;   // m climb
  runTerrain?: string | null; // flat | rolling | hilly | trail
  swimVenue?: string | null;  // pool | lake | ocean | river
  waterTempC?: number | null;
  swimCurrent?: string | null; // none | mild | strong
}

export interface ForecastInput {
  athlete: AthleteSnapshot;
  fitness: Pick<PmcResult, "current" | "formZone" | "rampRate7d" | "rampWarning"> | null;
  distance: string;            // sprint | olympic | half | full | 5k | 10k | half-marathon | marathon | 40k | 100k | 180k | gran-fondo | 750m | 1500m | 1900m | 3800m
  venue: ForecastVenue;
  goalTimeMin?: number | null;
}

export type ForecastSport = "triathlon" | "swim" | "bike" | "run";

export interface ForecastSegment {
  sport: "swim" | "bike" | "run";
  label: string;            // "Swim"
  distanceLabel: string;    // "1.9 km" / "750 m" / "42.2 km"
  timeMin: number;
  pace?: string;            // "1:34 /100m", "4:58 /km"
  speedKmh?: number;        // bike only
  powerTargetW?: number;    // bike only
  intensityFactor?: number; // bike: % FTP
  hrTarget?: string;        // bpm range
  fuel: FuelPlan;
  notes: string[];
}

export interface ForecastResult {
  sport: ForecastSport;
  distance: string;
  distanceLabel: string;
  confidence: "high" | "medium" | "low";
  measurementGaps: string[]; // defaults used
  factors: string[];         // course/fitness adjustments applied
  segments: ForecastSegment[];
  transitionsMin: number;
  totalMin: number;
  baselineTotalMin: number;
  goalTimeMin: number | null;
  goalDeltaMin: number | null; // positive = slower than goal
  note: string;
}

// ---------------------------------------------------------------------------
// Distance tables (baseline pacing curves)
// ---------------------------------------------------------------------------

// Triathlon legs (matches LEGS in fitness.ts)
const TRI_LEGS: Record<string, { swimM: number; bikeKm: number; runKm: number; transitionMin: number }> = {
  sprint: { swimM: 750, bikeKm: 20, runKm: 5, transitionMin: 2 },
  olympic: { swimM: 1500, bikeKm: 40, runKm: 10, transitionMin: 3 },
  half: { swimM: 1900, bikeKm: 90, runKm: 21.1, transitionMin: 4 },
  full: { swimM: 3800, bikeKm: 180, runKm: 42.2, transitionMin: 5 },
};

// Running-only distances (fatigue curves: longer = slower than threshold pace)
const RUN_DISTANCES: Record<string, { km: number; paceFactor: number; label: string }> = {
  "5k": { km: 5, paceFactor: 0.95, label: "5 km" },
  "10k": { km: 10, paceFactor: 0.98, label: "10 km" },
  "half-marathon": { km: 21.1, paceFactor: 1.05, label: "21.1 km" },
  marathon: { km: 42.2, paceFactor: 1.12, label: "42.2 km" },
};

// Cycling-only distances
const BIKE_DISTANCES: Record<string, { km: number; speedFactor: number; label: string }> = {
  "40k": { km: 40, speedFactor: 1.0, label: "40 km" },
  "100k": { km: 100, speedFactor: 0.97, label: "100 km" },
  "180k": { km: 180, speedFactor: 0.95, label: "180 km" },
  "gran-fondo": { km: 130, speedFactor: 0.96, label: "Gran Fondo (~130 km)" },
};

// Swimming-only distances
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

// Bike baseline speed from FTP for a flat, no-wind TT. Short rides hold a
// slightly higher sustainable fraction than ultra-distance ones.
function bikeBaselineSpeedKmh(ftp: number | null | undefined, speedFactor: number): number {
  const f = ftp ?? 220;
  return Math.round((f * 0.05 + 20) * speedFactor * 10) / 10;
}

function triRunPaceFactor(distance: string): number {
  return ({ sprint: 0.97, olympic: 1.0, half: 1.05, full: 1.1 } as Record<string, number>)[distance] ?? 1;
}

function triBikeSpeedFactor(distance: string): number {
  return ({ sprint: 1.0, olympic: 0.99, half: 0.97, full: 0.95 } as Record<string, number>)[distance] ?? 1;
}

// ---------------------------------------------------------------------------
// Distance classification (shared with the API route + UI)
// ---------------------------------------------------------------------------

export function classifyDistance(distance: string | null | undefined): ForecastSport | null {
  const d = (distance || "").toLowerCase();
  if (["sprint", "olympic", "half", "full"].includes(d)) return "triathlon";
  if (RUN_DISTANCES[d]) return "run";
  if (BIKE_DISTANCES[d]) return "bike";
  if (SWIM_DISTANCES[d]) return "swim";
  return null; // hyrox / boxing / unknown → not a forecastable endurance event
}

export const FORECASTABLE_DISTANCES = [
  "sprint", "olympic", "half", "full",
  "5k", "10k", "half-marathon", "marathon",
  "40k", "100k", "180k", "gran-fondo",
  "750m", "1500m", "1900m", "3800m",
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
  // ~0.5% slower per 100m of accumulated climb (capped so a single giant climb
  // can't blow the estimate up unrealistically).
  const climbFactor = Math.min(1.15, 1 + (climb / 100) * 0.005);
  return Math.round(base * climbFactor * 1000) / 1000;
}

function bikeTerrainSpeedFactor(terrain?: string | null, elevM?: number | null): number {
  // Expressed as a speed divisor (same magnitude, applied to speed).
  return terrainPaceFactor(terrain, elevM);
}

// ---------------------------------------------------------------------------
// Fitness adjustment from PMC (TSB + CTL)
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
    pace = 0.99; // fresh → can hold race pace + a touch more
    notes.push(`Form is high (TSB ${Math.round(tsb)}) — fresh legs, no fatigue buffer needed.`);
  } else if (tsb >= -10) {
    notes.push(`Form neutral (TSB ${Math.round(tsb)}) — standard pacing.`);
  } else if (tsb >= -30) {
    pace = 1.02; // fatigued → add a 2% pace buffer
    notes.push(`Fatigued (TSB ${Math.round(tsb)}) — pacing eased ~2% to hold form through the race.`);
  } else {
    pace = 1.04;
    notes.push(`Deeply fatigued (TSB ${Math.round(tsb)}) — forecast assumes a careful ~4% buffer; prioritize recovery pre-race.`);
  }
  // Low CTL relative to a long event = durability risk on the run.
  if (ctl < 40 && (distance === "full" || distance === "half" || distance === "marathon" || distance === "half-marathon")) {
    pace = Math.round(pace * 1.02 * 1000) / 1000;
    notes.push(`CTL ${Math.round(ctl)} is low for this distance — added a durability buffer.`);
  }
  if (fitness.rampRate7d > 8) notes.push(`Ramp rate ${fitness.rampRate7d} CTL/wk is high — this forecast assumes you arrive healthy, not more injured.`);
  return { paceFactor: pace, note: notes.join(" ") || null };
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
  const v: VenueProfile = {
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
  };
  const venuePlan = venueAdjustment(v);

  // Environmental factors (shared across disciplines)
  let heatPaceFactor = 1;
  if (venuePlan.heat) {
    heatPaceFactor = venuePlan.heat.paceFactor;
    factors.push(`Heat: feels ~${venuePlan.heat.tempC}°C (${venuePlan.heat.category}) — run/bike pace ×${heatPaceFactor.toFixed(2)}.`);
  }
  let altPaceFactor = 1;
  if (venuePlan.altitude && venuePlan.altitude.paceFactor > 1) {
    altPaceFactor = venuePlan.altitude.paceFactor;
    factors.push(`Altitude ${v.baseElevM}m → aerobic power ~${Math.round((1 - venuePlan.altitude.vo2factor) * 100)}% lower; pace ×${altPaceFactor.toFixed(2)}.`);
  }

  const envPace = Math.round(heatPaceFactor * altPaceFactor * 1000) / 1000;
  const envSpeedDivisor = envPace;

  const fit = fitnessPaceFactor(fitness, distance);
  if (fit.note) factors.push(fit.note);

  const goalTimeMin = input.goalTimeMin ?? null;
  const segments: ForecastSegment[] = [];
  let baselineTotalMin = 0;
  let totalMin = 0;
  let transitionsMin = 0;

  // --- Triathlon ---
  if (sport === "triathlon") {
    const leg = TRI_LEGS[distance];
    const distanceLabel = TRI_DISTANCE_LABELS[distance] || distance;

    // Swim
    const swimOpenWater = (v.swimVenue || "pool").toLowerCase() !== "pool";
    let swimPaceBase = athlete.swimPaceBase ?? 100;
    if (!athlete.swimPaceBase) measurementGaps.push("No swim threshold — using 1:40/100m default.");
    let swimPace = swimPaceBase * (swimOpenWater ? 1.05 : 1.0);
    if (v.swimCurrent === "strong") swimPace *= 1.04;
    else if (v.swimCurrent === "mild") swimPace *= 1.02;
    if (v.waterTempC !== undefined && v.waterTempC < 18) swimPace *= 1.03; // cold slows open-water turnover
    const swimMin = (leg.swimM / 100) * swimPace / 60;
    const swimFuel = recommendFuel({ durationMin: swimMin, intensity: "threshold", heatFactor: venuePlan.heat?.hydrationFactor ?? 1 });
    baselineTotalMin += (leg.swimM / 100) * swimPaceBase / 60; // baseline (flat pool, no current)
    segments.push({
      sport: "swim",
      label: "Swim",
      distanceLabel: `${leg.swimM >= 1000 ? leg.swimM / 1000 + " km" : leg.swimM + " m"}`,
      timeMin: Math.round(swimMin),
      pace: fmtSecPer100m(swimPace),
      fuel: swimFuel,
      notes: [venuePlan.swim.detail, venuePlan.wetsuit.note].filter(Boolean),
    });

    // Bike
    const ftp = athlete.ftp ?? 220;
    if (!athlete.ftp) measurementGaps.push("No FTP — using 220W default.");
    const bikeSpeedBase = bikeBaselineSpeedKmh(ftp, triBikeSpeedFactor(distance));
    const bikeDiv = envSpeedDivisor * bikeTerrainSpeedFactor(v.bikeTerrain, v.bikeElevM);
    const bikeSpeed = Math.round((bikeSpeedBase / bikeDiv) * 10) / 10;
    const bikeIF = leg.bikeKm >= 150 ? 0.72 : leg.bikeKm >= 70 ? 0.78 : leg.bikeKm >= 30 ? 0.83 : 0.88;
    const bikeMin = leg.bikeKm / bikeSpeed * 60;
    const bikeFuel = recommendFuel({ durationMin: bikeMin, intensity: "threshold", heatFactor: venuePlan.heat?.hydrationFactor ?? 1 });
    baselineTotalMin += leg.bikeKm / bikeSpeedBase * 60;
    const bikeHr = athlete.lthr ? `${Math.round(athlete.lthr * 0.82)}-${Math.round(athlete.lthr * 0.9)} bpm` : undefined;
    segments.push({
      sport: "bike",
      label: "Bike",
      distanceLabel: `${leg.bikeKm} km`,
      timeMin: Math.round(bikeMin),
      speedKmh: bikeSpeed,
      powerTargetW: Math.round(ftp * bikeIF),
      intensityFactor: bikeIF,
      hrTarget: bikeHr,
      fuel: bikeFuel,
      notes: [venuePlan.bike.detail, venuePlan.bike.training].filter(Boolean),
    });

    // Run
    const runPaceBase = athlete.runPaceBase ?? 300;
    if (!athlete.runPaceBase) measurementGaps.push("No run threshold — using 5:00/km default.");
    const runBasePace = runPaceBase * triRunPaceFactor(distance);
    const runPace = runBasePace * envPace * terrainPaceFactor(v.runTerrain, v.runElevM) * fit.paceFactor;
    const runMin = (leg.runKm * runPace) / 60;
    const runFuel = recommendFuel({ durationMin: runMin, intensity: "threshold", heatFactor: venuePlan.heat?.hydrationFactor ?? 1 });
    baselineTotalMin += (leg.runKm * runBasePace) / 60;
    const runHr = athlete.lthr ? `${Math.round(athlete.lthr * 0.85)}-${Math.round(athlete.lthr * 0.95)} bpm` : undefined;
    segments.push({
      sport: "run",
      label: "Run",
      distanceLabel: `${leg.runKm} km`,
      timeMin: Math.round(runMin),
      pace: fmtSecPerKm(runPace),
      hrTarget: runHr,
      fuel: runFuel,
      notes: [venuePlan.run.detail].filter(Boolean),
    });

    transitionsMin = leg.transitionMin;
    baselineTotalMin += leg.transitionMin;
    totalMin = Math.round(swimMin + bikeMin + runMin + transitionsMin);
    if (v.bikeTerrain && v.bikeTerrain !== "flat") factors.push(`Bike: ${v.bikeTerrain}${v.bikeElevM ? ` with ${v.bikeElevM}m climb` : ""} — course slows average speed.`);
    if (v.runTerrain && v.runTerrain !== "flat") factors.push(`Run: ${v.runTerrain}${v.runElevM ? ` with ${v.runElevM}m climb` : ""} — course slows pace.`);
  }

  // --- Run only ---
  else if (sport === "run") {
    const r = RUN_DISTANCES[distance];
    const runPaceBase = athlete.runPaceBase ?? 300;
    if (!athlete.runPaceBase) measurementGaps.push("No run threshold — using 5:00/km default.");
    const runBasePace = runPaceBase * r.paceFactor;
    const runPace = runBasePace * envPace * terrainPaceFactor(v.runTerrain, v.runElevM) * fit.paceFactor;
    const runMin = (r.km * runPace) / 60;
    baselineTotalMin = Math.round((r.km * runBasePace) / 60);
    const runFuel = recommendFuel({ durationMin: runMin, intensity: "threshold", heatFactor: venuePlan.heat?.hydrationFactor ?? 1 });
    const runHr = athlete.lthr ? `${Math.round(athlete.lthr * 0.85)}-${Math.round(athlete.lthr * 0.95)} bpm` : undefined;
    segments.push({
      sport: "run",
      label: "Run",
      distanceLabel: r.label,
      timeMin: Math.round(runMin),
      pace: fmtSecPerKm(runPace),
      hrTarget: runHr,
      fuel: runFuel,
      notes: [venuePlan.run.detail].filter(Boolean),
    });
    totalMin = Math.round(runMin);
    if (v.runTerrain && v.runTerrain !== "flat") factors.push(`Run: ${v.runTerrain}${v.runElevM ? ` with ${v.runElevM}m climb` : ""} — course slows pace.`);
  }

  // --- Bike only ---
  else if (sport === "bike") {
    const b = BIKE_DISTANCES[distance];
    const ftp = athlete.ftp ?? 220;
    if (!athlete.ftp) measurementGaps.push("No FTP — using 220W default.");
    const bikeSpeedBase = bikeBaselineSpeedKmh(ftp, b.speedFactor);
    const bikeDiv = envSpeedDivisor * bikeTerrainSpeedFactor(v.bikeTerrain, v.bikeElevM);
    const bikeSpeed = Math.round((bikeSpeedBase / bikeDiv) * 10) / 10;
    const bikeIF = b.km >= 150 ? 0.72 : b.km >= 70 ? 0.78 : b.km >= 30 ? 0.83 : 0.88;
    const bikeMin = b.km / bikeSpeed * 60;
    baselineTotalMin = Math.round(b.km / bikeSpeedBase * 60);
    const bikeFuel = recommendFuel({ durationMin: bikeMin, intensity: "threshold", heatFactor: venuePlan.heat?.hydrationFactor ?? 1 });
    const bikeHr = athlete.lthr ? `${Math.round(athlete.lthr * 0.82)}-${Math.round(athlete.lthr * 0.9)} bpm` : undefined;
    segments.push({
      sport: "bike",
      label: "Bike",
      distanceLabel: b.label,
      timeMin: Math.round(bikeMin),
      speedKmh: bikeSpeed,
      powerTargetW: Math.round(ftp * bikeIF),
      intensityFactor: bikeIF,
      hrTarget: bikeHr,
      fuel: bikeFuel,
      notes: [venuePlan.bike.detail, venuePlan.bike.training].filter(Boolean),
    });
    totalMin = Math.round(bikeMin);
    if (v.bikeTerrain && v.bikeTerrain !== "flat") factors.push(`Bike: ${v.bikeTerrain}${v.bikeElevM ? ` with ${v.bikeElevM}m climb` : ""} — course slows average speed.`);
  }

  // --- Swim only ---
  else {
    const s = SWIM_DISTANCES[distance];
    const swimOpenWater = (v.swimVenue || "pool").toLowerCase() !== "pool";
    const swimPaceBase = athlete.swimPaceBase ?? 100;
    if (!athlete.swimPaceBase) measurementGaps.push("No swim threshold — using 1:40/100m default.");
    let swimPace = swimPaceBase * (swimOpenWater ? 1.05 : 1.0);
    if (v.swimCurrent === "strong") swimPace *= 1.04;
    else if (v.swimCurrent === "mild") swimPace *= 1.02;
    if (v.waterTempC !== undefined && v.waterTempC < 18) swimPace *= 1.03;
    const swimMin = (s.m / 100) * swimPace / 60;
    baselineTotalMin = Math.round((s.m / 100) * swimPaceBase / 60);
    const swimFuel = recommendFuel({ durationMin: swimMin, intensity: "threshold", heatFactor: 1 });
    segments.push({
      sport: "swim",
      label: "Swim",
      distanceLabel: s.label,
      timeMin: Math.round(swimMin),
      pace: fmtSecPer100m(swimPace),
      fuel: swimFuel,
      notes: [venuePlan.swim.detail, venuePlan.wetsuit.note].filter(Boolean),
    });
    totalMin = Math.round(swimMin);
  }

  baselineTotalMin = Math.round(baselineTotalMin);

  // Confidence: how many of the athlete's own numbers do we actually have?
  const hasFtp = athlete.ftp != null;
  const hasRunPace = athlete.runPaceBase != null;
  const hasSwimPace = athlete.swimPaceBase != null;
  const relevantMeasured =
    sport === "triathlon"
      ? [hasFtp, hasRunPace, hasSwimPace].filter(Boolean).length
      : sport === "bike"
        ? (hasFtp ? 1 : 0)
        : sport === "run"
          ? (hasRunPace ? 1 : 0)
          : (hasSwimPace ? 1 : 0);
  const relevantTotal = sport === "triathlon" ? 3 : 1;
  let confidence: ForecastResult["confidence"] = "low";
  if (fitness && relevantMeasured >= relevantTotal) confidence = "high";
  else if (fitness || relevantMeasured >= 1) confidence = "medium";

  const goalDeltaMin = goalTimeMin != null ? totalMin - goalTimeMin : null;
  const note =
    goalDeltaMin != null && goalDeltaMin > 0
      ? `Forecast is ~${fmtTime(goalDeltaMin)} slower than your goal time — the gap is ${fmtTime(Math.max(1, goalDeltaMin))}.`
      : goalDeltaMin != null
        ? `Forecast is on/under goal by ~${fmtTime(Math.abs(goalDeltaMin))}.`
        : confidence === "low"
          ? "Confidence is low — complete your setup (FTP, run/swim thresholds) and log a few weeks of training to tighten this."
          : "Re-run after each benchmark test (FTP / 5k / CSS) to keep the forecast tight.";

  return {
    sport,
    distance,
    distanceLabel:
      sport === "triathlon" ? (TRI_DISTANCE_LABELS[distance] || distance)
      : sport === "run" ? RUN_DISTANCES[distance].label
      : sport === "bike" ? BIKE_DISTANCES[distance].label
      : SWIM_DISTANCES[distance].label,
    confidence,
    measurementGaps,
    factors,
    segments,
    transitionsMin,
    totalMin,
    baselineTotalMin,
    goalTimeMin,
    goalDeltaMin,
    note,
  };
}
