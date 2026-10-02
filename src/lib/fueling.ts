// JasMiamiMethod — Fueling & Hydration Engine V2
//
// Benchmarked against Fuelin (training-synced plans, gel/block frequencies,
// 500-1500 ml/h, traffic-light carb timing), Hexis ("fuel for the work
// required" carbohydrate periodization — Impey 2018; 60-90 g/h scaled to
// intensity/duration; gut-training progression) and Precision Fuel &
// Hydration (sweat rate × sweat sodium personalization, per-hour
// carb/fluid/sodium plan).
//
// Science anchors:
// - Carbs during: <30 min none · 30-75 min mouth rinse/small · 1-2.5 h
//   30-60 g/h · >2.5 h up to 90 g/h as 2:1 glucose:fructose (Jeukendrup 2014
//   ACSM review; Pfeiffer 2010 gut tolerance)
// - Pre: 1 g/kg at 1 h or 2 g/kg at 2-3 h before (Jeukendrup 2011)
// - Post: 1.0-1.2 g/kg/h carbs + 0.3 g/kg protein in the 0-4 h window,
//   4:1 when the next session is < 24 h (Ivy 1988; Kerksick 2017)
// - Fluids: drink to plan around measured sweat rate; gastric emptying caps
//   absorption near ~1.0 L/h (costly above)
// - Sodium: replace sweat sodium = sweat rate × concentration; 200-2000 mg/L
//   between athletes (Precision Hydration; Baker 2017)

export interface FuelSegment {
  atMin: number; // minutes into the session
  carbsG: number;
  fluidMl: number;
  sodiumMg: number;
  label: string; // what to actually do at this point
}

export interface PreSessionFuel {
  carbsG: number | null;
  timingLabel: string; // "2-3 h before" | "1 h before" | "—"
  note: string;
}

export interface FuelingPlan {
  carbsPerHourG: number;
  sodiumMgPerHour: number;
  fluidMlPerHour: number;
  caffeineMg?: number;
  notes: string;
  // V2 enrichment:
  personalization: string[]; // what made THIS plan yours
  gutNote?: string; // gut-training progression when applicable
  preSession: PreSessionFuel;
  segments: FuelSegment[]; // the scrollable timeline
  fluidSource: "measured" | "reported" | "estimated";
  measurementGaps: string[];
  guidanceKind: "general_education";
}

export interface FuelingInput {
  durationMin: number;
  intensity: string; // z1..z7 or type words
  weightKg?: number | null;
  sweatRateMlH?: number | null; // measured via pre/post session weights
  sodiumMgPerL?: number | null; // measured via sweat patch
  gutTrained?: boolean; // tolerates 90-120 g/h mixtures
  heatFactor?: number; // 1 = neutral; >1 hot
  ergosIncludeCaffeine?: boolean;
  caffeineOptIn?: boolean; // explicit request, never inferred from absence of an opt-out
  sweatMeasurement?: { observedAt: string; context: string; source: "measured" };
  verdict?: string; // daily adaptation — light carb periodization
}

const isHard = (intensity: string) =>
  ["z4", "z5", "z6", "z7", "interval", "threshold", "test", "race"].includes(
    intensity,
  );

// Caffeine eligibility from the athlete's supplement preferences (review
// finding F: a 70 kg hard-session case still suggested 210 mg after opt-out
// because no caller passed the flag). Master switch off, an explicit dislike
// or an opt-out all suppress caffeine everywhere.
export function caffeineAllowedFromPrefs(p: {
  enabled?: boolean | null;
  likes?: string | null;
  dislikes?: string | null;
  optsOut?: string | null;
}): boolean {
  if (!p || p.enabled !== true) return false;
  const parse = (s?: string | null): string[] => {
    try {
      const value: unknown = s ? JSON.parse(s) : [];
      return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
    } catch {
      return [];
    }
  };
  const blocked = new Set([...parse(p.dislikes), ...parse(p.optsOut)]);
  return parse(p.likes).includes("caffeine") && !blocked.has("caffeine");
}

/** The carb g/h target for a session — the "fuel vs hours" curve. */
export function carbsPerHourFor(
  durationMin: number,
  intensity: string,
  gutTrained = false,
): number {
  const hard = isHard(intensity);
  if (durationMin < 30) return 0;
  if (durationMin < 45) return 0; // water only
  if (durationMin < 75) return hard ? 20 : 15; // small amounts / rinse
  if (durationMin < 150) return hard ? 60 : 30 + Math.min(20, Math.round(durationMin / 15)); // 30-60
  // >2.5 h: multiple transportable carbohydrates
  const ceiling = gutTrained ? 90 : 60;
  return hard ? ceiling : Math.min(60, ceiling - 15);
}

/** Reference curve for the scrollable chart: g/h by session length. */
export function fuelCurveReference(gutTrained = false): {
  hours: number;
  gPerHour: number;
  label: string;
}[] {
  return [
    { hours: 0.5, gPerHour: 0, label: "water only" },
    { hours: 1, gPerHour: 20, label: "rinse / small sips" },
    { hours: 1.5, gPerHour: 45, label: "30-60 g/h" },
    { hours: 2.5, gPerHour: 60, label: "60 g/h glucose" },
    { hours: 3.5, gPerHour: gutTrained ? 90 : 60, label: gutTrained ? "90 g/h 2:1 glu:fru" : "60 (90 after gut training)" },
    { hours: 5, gPerHour: gutTrained ? 90 : 60, label: "hold the max you tolerate" },
  ];
}

export function buildFuelingPlan(opts: FuelingInput): FuelingPlan {
  const {
    durationMin,
    intensity,
    weightKg,
    sweatRateMlH,
    sodiumMgPerL,
    gutTrained = false,
    heatFactor: heat = 1,
    ergosIncludeCaffeine,
    verdict,
  } = opts;

  if (!Number.isFinite(durationMin) || durationMin < 0 || durationMin > 1440) throw new Error("Invalid session duration");
  for (const [name, value] of Object.entries({ weightKg, sweatRateMlH, sodiumMgPerL })) {
    if (value != null && (!Number.isFinite(value) || value <= 0)) throw new Error(`Invalid ${name}`);
  }
  const hard = isHard(intensity);
  const carbsPerHourG = carbsPerHourFor(durationMin, intensity, gutTrained);

  // These are planning examples, not a requirement to replace every ml lost.
  // A saved number alone does not establish measurement date or conditions.
  const measurement = opts.sweatMeasurement;
  const measured = Boolean(sweatRateMlH && measurement?.source === "measured"
    && measurement.context.trim() && Number.isFinite(Date.parse(measurement.observedAt))
    && Date.parse(measurement.observedAt) <= Date.now());
  const rawFluid = sweatRateMlH ?? (hard ? 700 : 500) * Math.min(1.3, Math.max(0.8, heat));
  const fluidMlPerHour = Math.min(1000, Math.round(rawFluid));
  const sodiumMgPerHour = Math.round(fluidMlPerHour / 1000 * (sodiumMgPerL ?? 700));
  const measurementGaps: string[] = [];
  if (weightKg == null) measurementGaps.push("Current weight not supplied; weight-based pre/post totals unavailable.");
  if (!measured) measurementGaps.push(sweatRateMlH
    ? "Sweat rate is athlete-reported; measurement date/conditions are unverified."
    : "Sweat rate unknown; fluid quantity is a general example, not your measured need.");
  if (!sodiumMgPerL) measurementGaps.push("Sweat sodium unknown; sodium quantity is a general example, not measured loss.");
  const personalization: string[] = [];
  if (weightKg) personalization.push(`${weightKg} kg supplied body weight (confirm it is current)`);
  if (sweatRateMlH) personalization.push(`${measured ? "measured in supplied conditions" : "reported, unverified"} sweat ${sweatRateMlH} ml/h`);
  if (sodiumMgPerL) personalization.push(`reported sweat sodium ${sodiumMgPerL} mg/L; context unverified`);
  if (gutTrained) personalization.push("athlete reports practiced carbohydrate tolerance");

  // ---- Pre-session ----
  const preSession: PreSessionFuel =
    durationMin >= 75 || hard
      ? weightKg
        ? {
            carbsG: Math.round(weightKg * 2),
            timingLabel: "2-3 h before",
            note: `${Math.round(weightKg * 2)} g carbs (2 g/kg) 2-3 h out, or ${Math.round(weightKg)} g (1 g/kg) in the last hour if time is short. Low fiber, low fat, familiar.`,
          }
        : {
            carbsG: null,
            timingLabel: "2-3 h before",
            note: "Current weight is unknown, so no weight-based total is available. Choose a familiar carbohydrate-containing meal that fits your usual timing and tolerance.",
          }
      : { carbsG: 0, timingLabel: "—", note: "Short/easy session — normal meal timing is enough; no extra pre-fuel." };

  // ---- During: the timeline segments ----
  const segments: FuelSegment[] = [];
  if (durationMin >= 45) {
    const segLen = carbsPerHourG >= 60 ? 15 : 20;
    const carbPerSeg = Math.round((carbsPerHourG * segLen) / 60);
    const fluidPerSeg = Math.round((fluidMlPerHour * segLen) / 60);
    const sodiumPerSeg = Math.round((sodiumMgPerHour * segLen) / 60);
    // Start early — never dig a hydration/fuel hole in the first hour.
    for (let t = segLen; t <= durationMin - 5; t += segLen) {
      const gels = carbPerSeg >= 22 ? 1 : 0;
      segments.push({
        atMin: t,
        carbsG: carbPerSeg,
        fluidMl: fluidPerSeg,
        sodiumMg: sodiumPerSeg,
        label:
          carbPerSeg === 0
            ? `Fluid example: up to ${fluidPerSeg} ml if needed; do not force drinking`
            : gels
              ? `${carbPerSeg} g carbs TOTAL from gel and/or drink, with fluid as needed (example ${fluidPerSeg} ml)`
              : `${carbPerSeg} g carbs TOTAL from drink/food; fluid as needed (example ${fluidPerSeg} ml)`,
      });
    }
  }

  const notes: string[] = [];
  if (durationMin < 45) notes.push("Under 45 min — extra carbohydrate during the session is usually unnecessary; ordinary meals still matter.");
  else if (durationMin < 75)
    notes.push("45-75 min — carbohydrates are for the mouth and brain: rinse or small sips.");
  else if (durationMin < 150)
    notes.push(`${carbsPerHourG} g/h is a general example within the 30–60 g/h range; choose familiar food or drink and adjust for tolerance.`);
  else
    notes.push(
      `${carbsPerHourG} g/h${carbsPerHourG > 60 ? " as 2:1 glucose:fructose (mixed transport — that is what unlocks >60)" : " — add fructose only after gut training"}.`,
    );
  notes.push(`Fluid example ${fluidMlPerHour} ml/h (${measured ? "derived from supplied measurement; applies only to similar conditions" : "unverified estimate, not measured need"}). Drink according to thirst and conditions; do not force this volume. Avoid overdrinking or gaining body weight during exercise. Extra sodium does not make overdrinking safe. Count carbohydrate from drinks and gels together, once.`);
  if (durationMin >= 60)
    notes.push(`Sodium ~${sodiumMgPerHour} mg/h${sodiumMgPerL ? " (reported concentration, not validated replacement need)" : " (general example)"}.`);

  // Carb periodization ("fuel for the work required", Impey 2018): the daily
  // verdict bends the day's carb emphasis, not the session safety floor.
  if (verdict === "easy" || verdict === "rest")
    notes.push("Recovery day: eat regular balanced meals and enough energy for recovery; this is not a weight-loss plan.");
  else if (verdict === "trim")
    notes.push("Trimmed session — fuel stays proportional; no extra loading needed.");

  const gutNote = !gutTrained && durationMin >= 150
    ? "Practice familiar carbohydrate choices in training and adjust to gastrointestinal tolerance. Do not increase automatically or assume a fixed timeline to tolerate more."
    : undefined;

  let caffeineMg: number | undefined;
  if (opts.caffeineOptIn === true && !ergosIncludeCaffeine && weightKg && hard && durationMin >= 45) {
    caffeineMg = Math.min(250, Math.round(weightKg * 3));
    notes.push(`Optional caffeine example ${caffeineMg} mg, requested explicitly. Consider all sources and usual tolerance; seek qualified advice for medication/condition-dependent use.`);
  }
  notes.push("General sports-nutrition education; dietary restrictions, allergies, medication effects and clinical needs require individual review.");

  return {
    carbsPerHourG,
    sodiumMgPerHour,
    fluidMlPerHour,
    caffeineMg,
    notes: notes.join(" "),
    personalization,
    gutNote,
    preSession,
    segments,
    fluidSource: measured ? "measured" : sweatRateMlH ? "reported" : "estimated",
    measurementGaps,
    guidanceKind: "general_education",
  };
}

// ---- Post-workout (weight-personalized recovery fuel) ----
export function postFuelPersonalized(opts: {
  durationMin: number;
  intensity: string;
  sport?: string;
  weightKg?: number | null;
}): {
  carbsG: number | null;
  proteinG: number | null;
  ratio: string;
  note: string;
} {
  const { durationMin, intensity, sport, weightKg } = opts;
  const hard = isHard(intensity);
  const long = durationMin >= 90;
  const strength = sport === "strength";
  if (weightKg == null) return {
    carbsG: null, proteinG: null, ratio: "—",
    note: "Current weight is unknown, so weight-based totals are unavailable. Have a familiar meal or snack containing carbohydrate and protein, and drink according to thirst. Next-session timing, dietary needs and measured losses can change recovery needs; do not force fluids.",
  };
  if (!Number.isFinite(weightKg) || weightKg <= 0) throw new Error("Invalid weightKg");
  const w = weightKg;

  // 1.0-1.2 g/kg carbs + 0.3 g/kg protein in the first hour; 4:1 when
  // another session is coming within 24 h, protein-forward after strength.
  const carbsG = Math.round(
    long ? w * 1.2 : hard ? w * 1.0 : Math.max(30, w * 0.5),
  );
  const proteinG = Math.round(strength ? Math.max(25, w * 0.4) : w * 0.3);
  const ratio = strength ? "1:1" : long || hard ? "4:1" : "2:1";
  const note = long || hard
    ? `Recovery window (next 4 h): ${carbsG}-${Math.round(w * 1.2)} g carbs TOTAL across the window, ${proteinG} g protein now. This is a general recovery example; next-session timing and dietary context matter. Drink according to thirst; replace losses gradually only when measured in context. Extra sodium does not protect against overdrinking.`
    : `Recovery snack now; normal meal within 2 h. Prioritize protein (${proteinG} g) — the carb demand was modest.`;
  return { carbsG, proteinG, ratio, note };
}
