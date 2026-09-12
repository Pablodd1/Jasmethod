// JasMiamiMethod — Forecast Constants Registry
//
// Production directive (adjudication report, 2026-09-08): "Never let an
// unsourced number survive into the codebase without a TUNED_DEFAULT or
// UNVERIFIED flag attached to it."
//
// Every model constant used by the race forecast lives here with its
// provenance. REJECTED_CLAIMS at the bottom documents the numbers that were
// adjudicated as fabricated/unsourced so they can never silently return —
// the AI brief layer uses this list as hard guardrails.

export type Provenance =
  | "VERIFIED"        // physical constant, standard formula, or published consensus
  | "TUNED_DEFAULT"   // sourced model shape; exact value tunable, labeled
  | "LABELED_DEFAULT" // reasonable population default — measure your own
  | "HEURISTIC"       // coaching heuristic, not physics
  | "UNVERIFIED";     // plausible but no primary source confirmed for 2026

export interface ForecastConstant<T = unknown> {
  key: string;
  value: T;
  provenance: Provenance;
  citation: string;
  note?: string;
}

const C = <T,>(
  key: string,
  value: T,
  provenance: Provenance,
  citation: string,
  note?: string,
): ForecastConstant<T> => ({ key, value, provenance, citation, note });

// ---------------------------------------------------------------------------
// Cycling physics
// ---------------------------------------------------------------------------

export const DRIVETRAIN_EFFICIENCY = C(
  "drivetrain_efficiency", 0.976, "VERIFIED",
  "Industry standard 0.97–0.98 (friction-factory bench data)",
);
export const RHO_SEA_LEVEL_15C = C(
  "air_density_sea_level_15c", 1.225, "VERIFIED",
  "Physical constant — recomputed from barometric pressure + venue temp",
);
export const CRR_RANGE = C(
  "crr_range", [0.0022, 0.0060], "VERIFIED",
  "Published rolling-resistance range (surface dependent)",
  "Talaued per terrain in raceforecast.ts; single values are LABELED_DEFAULT",
);
export const CDA_DEFAULT_TRI = C(
  "cda_default_tri", 0.28, "TUNED_DEFAULT",
  "Tri/TT position; published inter-athlete range 0.22–0.35 m²",
  "Biggest single lever in bike predictions — tune from real aero tests",
);
export const WIND_LOOP_HEADWIND_FRACTION = C(
  "wind_loop_headwind_fraction", 0.5, "HEURISTIC",
  "Loop-course mean projection of ambient wind onto direction of travel",
  "Point-to-point courses need a bearing-aware model (roadmap)",
);
export const GROSS_EFFICIENCY = C(
  "gross_efficiency", 0.24, "LABELED_DEFAULT",
  "Metabolic energy / crank work; individual range 0.20–0.28",
  "Used for kcal expenditure on the bike",
);

// ---------------------------------------------------------------------------
// Critical Power / intensity
// ---------------------------------------------------------------------------

export const CP_VALID_RANGE_MIN = C(
  "cp_valid_range_min", [2, 15], "VERIFIED",
  "Critical Power literature consensus",
  "Do not extrapolate CP/FTP math to Ironman-length efforts",
);
export const IF_BANDS: Record<string, [number, number]> = {
  sprint: [0.85, 0.95],
  olympic: [0.80, 0.90],
  half: [0.75, 0.82],
  full: [0.70, 0.76],
};
export const IF_BANDS_CONST = C(
  "intensity_factor_bands", IF_BANDS as unknown as number[], "TUNED_DEFAULT",
  "Common coaching ranges by race distance; midpoint used by the engine",
);

// ---------------------------------------------------------------------------
// Running
// ---------------------------------------------------------------------------

export const RIEGEL_B_DEFAULT = C(
  "riegel_b_default", 1.06, "TUNED_DEFAULT",
  "Riegel 1981, 'Athletic Records and Human Endurance'; published range ~1.05–1.12",
  "Adjacent-distance accuracy ±5%; far-apart (5k→marathon) ±15–25% — estimates",
);

// ---------------------------------------------------------------------------
// Altitude (adjudication Conflict 1: Wehrlin-linear, NOT 1%/1000ft)
// ---------------------------------------------------------------------------

export const ALTITUDE_PCT_PER_1000FT = C(
  "power_loss_percent_per_1000ft_altitude", 4.4, "TUNED_DEFAULT",
  "Wehrlin & Hallén 2006 linear VO2max decrease (~14.5%/1000m ≈ 4.4%/1000ft)",
  "Exact figure UNVERIFIED in training data; the 1%/1000ft rule of thumb was REJECTED as ~4x underestimate",
);
export const ALTITUDE_THRESHOLD_M = C(
  "altitude_threshold_m", 150, "TUNED_DEFAULT",
  "Negligible below this venue elevation (linear model has no hard threshold)",
);
export const ALTITUDE_CAP = C(
  "altitude_cap_fraction", 0.35, "TUNED_DEFAULT",
  "Sanity cap on total aerobic-power loss",
);
export const ALTITUDE_PACE_TRANSMISSION = C(
  "altitude_pace_transmission", 0.85, "TUNED_DEFAULT",
  "Sub-threshold pace degrades less than VO2max falls (slower speed = lower absolute O2 cost)",
);

// ---------------------------------------------------------------------------
// Heat / WBGT (adjudication Conflict 2: WBGT model, NOT linear °F+%RH)
// ---------------------------------------------------------------------------

export const WBGT_WEIGHTS = C(
  "wbgt_weights", { tw: 0.7, tg: 0.2, td: 0.1 } as Record<string, number>, "VERIFIED",
  "ISO 7243 / ACSM outdoor WBGT = 0.7·Tw + 0.2·Tg + 0.1·Td",
);
export const GLOBE_TEMP_EST_COEFFS = C(
  "globe_temp_est_coeffs", { solarPerWm2: 0.01, solarCapC: 8, windCoolPerKph: 0.15, windCapC: 3 } as Record<string, number>, "TUNED_DEFAULT",
  "Simple globe-temp estimate from solar radiation + wind (Liljegren-lite)",
  "Estimate only — real black-globe sensors are the upgrade path",
);
export const WBGT_REDFLAG_RANGE = C(
  "wbgt_redflag_range_c", [23, 28], "HEURISTIC",
  "ACSM-style activity-modification bands",
  "VERIFY currency against current ACSM guidance before deployment",
);
export const WBGT_BLACKFLAG_GT = C(
  "wbgt_blackflag_gt_c", 28, "HEURISTIC",
  "ACSM-style black-flag threshold",
  "VERIFY currency",
);
// Pace/power penalty curves: adjudication holds that NO universal linear
// slope exists — so we ship tunable anchor curves (linear interpolation
// between anchors), flagged as heuristics, direction consistent with
// El Helou et al. 2012 (marathon performance vs WBGT components).
export const HEAT_RUN_CURVE = C(
  "heat_run_curve_anchors", [15, 0, 20, 0.01, 24, 0.035, 28, 0.07, 32, 0.12], "HEURISTIC",
  "Anchors [WBGT °C, fraction slower]; cap 18%",
  "Direction consistent with El Helou 2012; magnitudes are tuning defaults",
);
export const HEAT_BIKE_CURVE = C(
  "heat_bike_curve_anchors", [15, 0, 20, -0.01, 24, -0.03, 28, -0.06, 32, -0.10], "TUNED_DEFAULT",
  "Anchors [WBGT °C, fraction of sustainable power lost]; cap 15%",
  "Cooler than the run curve: the bike allows drinking/cooling, and watts drop before pace does",
);

// ---------------------------------------------------------------------------
// Swim (adjudication Conflict 6: drafting 0–15%, NOT 20–38%)
// ---------------------------------------------------------------------------

export const SWIM_DRAFT_ENERGY_SAVINGS_MAX = C(
  "swim_draft_energy_savings_max", 0.15, "TUNED_DEFAULT",
  "Chatard & Wilson 2003, 'Drafting Distance in Swimming' — 10–15% at close distance",
  "20–38% claim REJECTED (cycling drafting numbers misattributed to swimming)",
);
export const SWIM_DRAFT_TIME_TRANSMISSION = C(
  "swim_draft_time_transmission", 0.4, "TUNED_DEFAULT",
  "Conservative mapping energy-savings → swim-time benefit",
);
export const WETSUIT_SPEED_BENEFIT = C(
  "wetsuit_speed_benefit", 0.03, "TUNED_DEFAULT",
  "Buoyancy/position benefit ~2–5% faster swim; tunable",
);
export const OPEN_WATER_PENALTY = C(
  "open_water_penalty", 0.05, "TUNED_DEFAULT",
  "Sighting, chop, navigation vs pool CSS",
);

// ---------------------------------------------------------------------------
// Nutrition (adjudication Conflict 10: labeled defaults, not facts)
// ---------------------------------------------------------------------------

export const CARBS_G_PER_HOUR_BANDS: Record<string, [number, number]> = {
  short: [0, 0],        // < 60 min — water only
  medium: [30, 60],     // 60–150 min
  long: [60, 90],       // > 150 min (gut-trained: 90–120)
};
export const CARBS_BANDS_CONST = C(
  "carbs_g_per_hour_bands", [60, 90, 120], "LABELED_DEFAULT",
  "Thomas 2016 (AND/DC/ACSM position stand); >2.5h: 60–90 g/h, gut-trained 90–120",
);
export const CARBS_KCAL_PER_G = C(
  "carbs_kcal_per_g", 4, "VERIFIED", "Atwater factor for carbohydrate",
);
export const FLUID_ML_PER_HOUR_DEFAULT = C(
  "fluid_ml_per_hour_default", 750, "LABELED_DEFAULT",
  "Population default 500–1000 ml/h — individual sweat rate 0.5–3.0 L/h",
  "Measure your own: pre/post-session weight change",
);
export const SODIUM_MG_PER_L_DEFAULT = C(
  "sodium_mg_per_l_default", 800, "LABELED_DEFAULT",
  "Population default 500–1000 mg/L of fluid — sweat sodium varies widely",
  "Measure your own: sweat patch test",
);
export const CAFFEINE_MG_PER_KG = C(
  "caffeine_mg_per_kg", 3, "LABELED_DEFAULT",
  "Goldstein 2010 position stand: 3–6 mg/kg effective",
  "Race-day usable dose; train it in before relying on it",
);

// ---------------------------------------------------------------------------
// Training load
// ---------------------------------------------------------------------------

export const CTL_TIME_CONSTANT_DAYS = C(
  "ctl_time_constant_days", 42, "VERIFIED", "Training-methodology standard (Coggan PMC)",
);
export const ATL_TIME_CONSTANT_DAYS = C(
  "atl_time_constant_days", 7, "VERIFIED", "Training-methodology standard (Coggan PMC)",
);
export const TSB_RACE_TARGET = C(
  "tsb_race_target", [-10, 10], "HEURISTIC", "Coach heuristic for race-day form — not physics",
);
export const DECOUPLING_WARNING_PCT = C(
  "aerobic_decoupling_warning_pct", 5, "HEURISTIC",
  "Advisory only — no published threshold 'proves' aerobic decoupling",
);

// ---------------------------------------------------------------------------
// Registry access
// ---------------------------------------------------------------------------

export function allConstants(): ForecastConstant[] {
  return [
    DRIVETRAIN_EFFICIENCY, RHO_SEA_LEVEL_15C, CRR_RANGE, CDA_DEFAULT_TRI,
    WIND_LOOP_HEADWIND_FRACTION, GROSS_EFFICIENCY, CP_VALID_RANGE_MIN,
    IF_BANDS_CONST, RIEGEL_B_DEFAULT,
    ALTITUDE_PCT_PER_1000FT, ALTITUDE_THRESHOLD_M, ALTITUDE_CAP, ALTITUDE_PACE_TRANSMISSION,
    WBGT_WEIGHTS, GLOBE_TEMP_EST_COEFFS, WBGT_REDFLAG_RANGE, WBGT_BLACKFLAG_GT,
    HEAT_RUN_CURVE, HEAT_BIKE_CURVE,
    SWIM_DRAFT_ENERGY_SAVINGS_MAX, SWIM_DRAFT_TIME_TRANSMISSION,
    WETSUIT_SPEED_BENEFIT, OPEN_WATER_PENALTY,
    CARBS_BANDS_CONST, CARBS_KCAL_PER_G, FLUID_ML_PER_HOUR_DEFAULT,
    SODIUM_MG_PER_L_DEFAULT, CAFFEINE_MG_PER_KG,
    CTL_TIME_CONSTANT_DAYS, ATL_TIME_CONSTANT_DAYS, TSB_RACE_TARGET, DECOUPLING_WARNING_PCT,
  ];
}

export function provenanceRows(keys: string[]): Array<Pick<ForecastConstant, "key" | "provenance" | "citation" | "note"> & { value: unknown }> {
  const registry = new Map(allConstants().map((c) => [c.key, c]));
  return keys
    .map((k) => registry.get(k))
    .filter((c): c is ForecastConstant => Boolean(c))
    .map(({ key, value, provenance, citation, note }) => ({ key, value, provenance, citation, note }));
}

// ---------------------------------------------------------------------------
// REJECTED CLAIMS (adjudication Conflicts 1–4, 6, 9, 11)
// The AI narrative layer must never emit these numbers, and future model
// proposals matching them are auto-flagged for adjudication.
// ---------------------------------------------------------------------------

export interface RejectedClaim {
  claim: string;
  why: string;
}

export const REJECTED_CLAIMS: RejectedClaim[] = [
  {
    claim: "Altitude costs ~1% power per 1,000 ft",
    why: "Underestimates ~4x vs the Wehrlin-linear model (≈4.4%/1000ft). Conflates perceived exertion with VO2max decline.",
  },
  {
    claim: "Heat slows pace 0.4%/°F above 60°F + 0.2%/humidity-% above 60%",
    why: "Unsourced linear formula; humidity interacts with temperature nonlinearly through evaporative cooling. WBGT model ships instead.",
  },
  {
    claim: "Dew point below 10°C negligible; above 21°C causes 8–12% pace hit",
    why: "Unsourced two-threshold model. Dew point is shipped as a qualitative advisory flag only.",
  },
  {
    claim: "Flat calculators err 15–25% vs physics tools 2–3%",
    why: "Fabricated precision — no benchmarking study backs a comparative tool-accuracy claim.",
  },
  {
    claim: "Swim drafting saves 20–38% energy",
    why: "Cycling peloton numbers misattributed to swimming. Literature supports 10–15% at close distance (Chatard & Wilson 2003).",
  },
  {
    claim: "Cycling power drops 15% from humidity alone",
    why: "No isolated humidity study supports this; humidity effects are handled through the composite WBGT model.",
  },
  {
    claim: "Aerobic decoupling >X% at Y duration proves aerobic deficiency",
    why: "No published proof threshold exists; decoupling ships as an advisory metric with a tunable warning level.",
  },
];
