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
  carbsG: number;
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
  fluidSource: "measured" | "estimated";
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
  verdict?: string; // daily adaptation — light carb periodization
}

const isHard = (intensity: string) =>
  ["z4", "z5", "z6", "z7", "interval", "threshold", "test", "race"].includes(
    intensity,
  );

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

  const hard = isHard(intensity);
  const carbsPerHourG = carbsPerHourFor(durationMin, intensity, gutTrained);

  // Fluids: measured sweat rate when the athlete has done the pre/post
  // weight test; otherwise an intensity/heat-scaled estimate (500-1000).
  // Absorption caps the plan near 1.0 L/h — above that, fluids pool.
  const estimatedSweat = (hard ? 900 : 650) * heat;
  const rawFluid = sweatRateMlH ?? estimatedSweat;
  const fluidMlPerHour = Math.min(1000, Math.round(rawFluid * (heat !== 1 && sweatRateMlH ? heat : 1)));

  // Sodium: replace what sweat takes — rate × concentration. Default
  // 700 mg/L (mid-range; athletes span 200-2000).
  const sweatLPerHour = fluidMlPerHour / 1000;
  const sodiumMgPerHour = Math.round(sweatLPerHour * (sodiumMgPerL ?? 700));

  const personalization: string[] = [];
  if (weightKg) personalization.push(`${weightKg} kg body weight`);
  if (sweatRateMlH) personalization.push(`measured sweat ${sweatRateMlH} ml/h`);
  if (sodiumMgPerL) personalization.push(`measured sweat sodium ${sodiumMgPerL} mg/L`);
  if (gutTrained) personalization.push("gut trained for mixed carbs");

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
            carbsG: 100,
            timingLabel: "2-3 h before",
            note: "~100 g carbs 2-3 h out (add your body weight in Settings for a g/kg dose).",
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
            ? `Drink ${fluidPerSeg} ml`
            : gels
              ? `1 gel (~25 g) + ${fluidPerSeg} ml`
              : `${carbPerSeg} g carbs (drink/chew) + ${fluidPerSeg} ml`,
      });
    }
  }

  const notes: string[] = [];
  if (durationMin < 45) notes.push("Under 45 min — water only; fuel does nothing here.");
  else if (durationMin < 75)
    notes.push("45-75 min — carbohydrates are for the mouth and brain: rinse or small sips.");
  else if (durationMin < 150)
    notes.push(`${carbsPerHourG} g/h carbs (single source: glucose/maltodextrin).`);
  else
    notes.push(
      `${carbsPerHourG} g/h${carbsPerHourG > 60 ? " as 2:1 glucose:fructose (mixed transport — that is what unlocks >60)" : " — add fructose only after gut training"}.`,
    );
  notes.push(`Fluids ${fluidMlPerHour} ml/h${sweatRateMlH ? " (your measured sweat rate)" : " (estimate — do the pre/post-weight test in Labs for your number)"}.`);
  if (durationMin >= 60)
    notes.push(`Sodium ~${sodiumMgPerHour} mg/h${sodiumMgPerL ? " (your sweat sodium)" : ""}.`);

  // Carb periodization ("fuel for the work required", Impey 2018): the daily
  // verdict bends the day's carb emphasis, not the session safety floor.
  if (verdict === "easy" || verdict === "rest")
    notes.push("Recovery day: keep the session fuel as planned but the rest of the day leans protein + vegetables, not carb loading.");
  else if (verdict === "trim")
    notes.push("Trimmed session — fuel stays proportional; no extra loading needed.");

  const gutNote = !gutTrained && durationMin >= 150
    ? `Gut training: practice ${Math.round(carbsPerHourG * 0.6)} g/h now and add ~10 g/h each long session — in 3-4 weeks 90 g/h mixtures become realistic (Pfeiffer 2010).`
    : undefined;

  let caffeineMg: number | undefined;
  if (hard && durationMin >= 45 && !ergosIncludeCaffeine) {
    caffeineMg = weightKg ? Math.min(250, Math.round(weightKg * 3)) : 150;
    notes.push(`Caffeine ${caffeineMg} mg 45-60 min pre-session${weightKg ? " (3 mg/kg)" : ""}.`);
  } else if (hard && durationMin >= 45) {
    notes.push("Caffeine covered in your ergogenic picks — same pre-session timing.");
  }

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
    fluidSource: sweatRateMlH ? "measured" : "estimated",
  };
}

// ---- Post-workout (weight-personalized recovery fuel) ----
export function postFuelPersonalized(opts: {
  durationMin: number;
  intensity: string;
  sport?: string;
  weightKg?: number | null;
}): {
  carbsG: number;
  proteinG: number;
  ratio: string;
  note: string;
} {
  const { durationMin, intensity, sport, weightKg } = opts;
  const hard = isHard(intensity);
  const long = durationMin >= 90;
  const strength = sport === "strength";
  const w = weightKg ?? 70;

  // 1.0-1.2 g/kg carbs + 0.3 g/kg protein in the first hour; 4:1 when
  // another session is coming within 24 h, protein-forward after strength.
  const carbsG = Math.round(
    long ? w * 1.2 : hard ? w * 1.0 : Math.max(30, w * 0.5),
  );
  const proteinG = Math.round(strength ? Math.max(25, w * 0.4) : w * 0.3);
  const ratio = strength ? "1:1" : long || hard ? "4:1" : "2:1";
  const note = long || hard
    ? `Recovery window (next 4 h): ${carbsG}-${Math.round(w * 1.2)} g carbs TOTAL across the window, ${proteinG} g protein now. Drink ~1.5× the body weight you lost during the session (with sodium if you sweat salty).`
    : `Recovery snack now; normal meal within 2 h. Prioritize protein (${proteinG} g) — the carb demand was modest.`;
  return { carbsG, proteinG, ratio, note };
}
