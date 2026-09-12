// JasMiamiMethod — Race fueling plan (carbs / fluid / sodium / calories)
//
// Adjudication 2026-09-08, Conflict 10: these are LABELED population
// defaults, not personal facts. Sweat rate varies 0.5–3.0 L/h and sweat
// sodium even more — every shipped number is overridable and the output says
// "measure your own" wherever a default was used.
//
// Sources: Thomas 2016 (AND/ACSM position stand) via the constants registry;
// calories = carbs × 4 kcal/g (Atwater) + bike work converted through gross
// efficiency for total energy expenditure.

import {
  CARBS_KCAL_PER_G,
  FLUID_ML_PER_HOUR_DEFAULT,
  SODIUM_MG_PER_L_DEFAULT,
  CAFFEINE_MG_PER_KG,
} from "./forecast-constants";

export interface RaceFuelInput {
  durationMin: number;
  gutTrained?: boolean;          // trained to 90–120 g/h carb mixtures
  sweatRateMlH?: number | null;  // measured (pre/post weight loss + time)
  sodiumMgPerL?: number | null;  // measured sweat sodium concentration
  heatFactor?: number;           // 1.0 = neutral; >1 scales fluid
  weightKg?: number | null;      // for caffeine dosing
  caffeineNowMg?: number | null; // already taken pre-race
}

export interface RaceFuelPlan {
  carbsGPerHour: number;
  carbsBand: string;         // what the range was and where the pick sits
  fluidMlPerHour: number;
  sodiumMgPerHour: number;
  kcalPerHour: number;
  caffeineMg: number | null;
  caffeineTiming: string | null;
  totalCarbsG: number;
  totalKcalIntake: number;   // what the athlete consumes (carb sources)
  totalFluidMl: number;
  totalSodiumMg: number;
  gaps: string[];            // which inputs were defaults
  notes: string[];
}

export function raceFuelPlan(input: RaceFuelInput): RaceFuelPlan {
  const hours = Math.max(0, input.durationMin / 60);
  const heat = Math.min(1.3, Math.max(0.8, input.heatFactor ?? 1));
  const gaps: string[] = [];
  const notes: string[] = [];

  // --- Carbs: duration bands (Thomas 2016), gut-training extends the top ---
  let carbsGPerHour: number;
  let carbsBand: string;
  if (hours < 1) {
    carbsGPerHour = 0;
    carbsBand = "<1h: water only, no fuel required";
    if (hours >= 0.75)
      notes.push("For a hard ~1h effort a mouth rinse or half a gel at 40min is optional — test it in training first.");
  } else if (hours < 2.5) {
    carbsGPerHour = 60;
    carbsBand = "1–2.5h: 30–60 g/h band — engine picked 60 g/h for race intensity";
  } else {
    carbsGPerHour = input.gutTrained ? 90 : 75;
    carbsBand = input.gutTrained
      ? ">2.5h: 60–90 g/h standard, 90–120 g/h for gut-trained — picked 90 g/h (glucose:fructose mix required)"
      : ">2.5h: 60–90 g/h standard — picked 75 g/h; work toward 90 g/h with gut training (glucose:fructose mix required)";
  }

  // --- Fluid: measured sweat rate, else labeled default, scaled by heat ---
  let fluidMlPerHour: number;
  if (input.sweatRateMlH != null && input.sweatRateMlH > 0) {
    fluidMlPerHour = Math.round(Math.min(1500, Math.max(300, input.sweatRateMlH)) * heat);
    notes.push(`Fluid scaled from your measured sweat rate (${input.sweatRateMlH} ml/h) × heat factor ${heat.toFixed(2)}.`);
  } else {
    fluidMlPerHour = Math.round(FLUID_ML_PER_HOUR_DEFAULT.value * heat);
    gaps.push("No measured sweat rate — using the 500–1000 ml/h population default (750 ml/h × heat). Measure yours: weigh in/out before and after a hard hour.");
  }

  // --- Sodium: concentration × planned fluid volume ---
  const sodiumPerL = input.sodiumMgPerL != null && input.sodiumMgPerL > 0
    ? input.sodiumMgPerL
    : SODIUM_MG_PER_L_DEFAULT.value;
  if (input.sodiumMgPerL == null)
    gaps.push("No measured sweat sodium — using the 500–1000 mg/L default (800 mg/L). Sweat patch tests nail this.");
  const sodiumMgPerHour = Math.round((sodiumPerL / 1000) * fluidMlPerHour);

  // --- Calories: intake from carbs ---
  const kcalPerHour = carbsGPerHour * CARBS_KCAL_PER_G.value;

  // --- Caffeine: 3 mg/kg (3–6 range), 45–60 min pre-race ---
  let caffeineMg: number | null = null;
  let caffeineTiming: string | null = null;
  if (hours >= 1.25 && input.weightKg) {
    caffeineMg = Math.round((CAFFEINE_MG_PER_KG.value * input.weightKg) / 5) * 5;
    caffeineTiming = input.caffeineNowMg
      ? `Pre-race caffeine already planned (${input.caffeineNowMg} mg). Optional top-up: half the dose (~${Math.round(caffeineMg / 2)} mg) at ~half distance — only if you trained it.`
      : `${caffeineMg} mg (~${CAFFEINE_MG_PER_KG.value} mg/kg) 45–60 min before the start; effective range 3–6 mg/kg. Train with it first.`;
    if (hours >= 2.5)
      notes.push("Mid-race caffeine top-up of ~half dose near the end of the bike is common for long-course — rehearse it in training.");
  }

  return {
    carbsGPerHour,
    carbsBand,
    fluidMlPerHour,
    sodiumMgPerHour,
    kcalPerHour,
    caffeineMg,
    caffeineTiming,
    totalCarbsG: Math.round(carbsGPerHour * hours),
    totalKcalIntake: Math.round(kcalPerHour * hours),
    totalFluidMl: Math.round(fluidMlPerHour * hours),
    totalSodiumMg: Math.round(sodiumMgPerHour * hours),
    gaps,
    notes,
  };
}

// Total metabolic expenditure from bike wheel work (kJ): work / 4.184 /
// gross efficiency. The classic "kJ ≈ kcal" shortcut assumes GE = 0.239; we
// use the tunable 0.24 registry default instead.
export function kcalFromBikeKj(bikeKj: number): number {
  return Math.round(bikeKj / 4.184 / 0.24);
}

export interface FuelSlot {
  fromMin: number;
  toMin: number;
  what: string;
}

// Turn the hourly plan into a concrete race-morning timeline. discipline
// shapes the product advice (drink mix on the bike, gels on the run).
export function fuelTimeline(
  plan: RaceFuelPlan,
  opts: { discipline: "triathlon" | "bike" | "run"; totalMin: number; transitionMin?: number },
): FuelSlot[] {
  const slots: FuelSlot[] = [];
  const gelsPerHour = Math.max(1, Math.round(plan.carbsGPerHour / 25)); // ~25 g per gel
  const drinkMlPerSlot = Math.round(plan.fluidMlPerHour / 2); // drink every ~30 min

  if (plan.carbsGPerHour === 0) {
    slots.push({ fromMin: 0, toMin: opts.totalMin, what: "Under an hour: no fuel needed — water only." });
    return slots;
  }

  if (opts.discipline === "triathlon") {
    slots.push({ fromMin: -60, toMin: -30, what: `Pre-load: ${Math.round(plan.fluidMlPerHour * 0.5)} ml fluid with electrolytes${plan.caffeineMg ? ` + ${plan.caffeineMg} mg caffeine` : ""}.` });
    slots.push({ fromMin: -20, toMin: 0, what: "Swim: nothing during — top up beforehand; last sips at the start corral." });
    slots.push({ fromMin: 0, toMin: 15, what: "Bike start: settle the first 15 min, then begin fueling." });
    const bikeEnd = Math.max(15, (opts.transitionMin ?? opts.totalMin) - 5);
    for (let t = 15; t < bikeEnd; t += 30) {
      slots.push({
        fromMin: t,
        toMin: Math.min(t + 30, bikeEnd),
        what: `Bike: ${Math.round(plan.carbsGPerHour / 2)} g carbs + ${drinkMlPerSlot} ml + ${Math.round(plan.sodiumMgPerHour / 2)} mg sodium every 30 min (${gelsPerHour}× gel/h or drink-mix equivalent).`,
      });
    }
    if (opts.transitionMin != null)
      slots.push({ fromMin: opts.transitionMin, toMin: opts.transitionMin + 2, what: "T2: last gel in transition if the run is 60+ min; grab salt if it's hot." });
    slots.push({
      fromMin: opts.transitionMin ?? 0,
      toMin: opts.totalMin,
      what: `Run: ${Math.min(60, plan.carbsGPerHour)} g/h via cola/gels at aid stations + ${Math.round(plan.fluidMlPerHour * 0.7)} ml/h — smaller, more frequent than the bike.`,
    });
  } else {
    const hourly: string =
      opts.discipline === "bike"
        ? `${plan.carbsGPerHour} g carbs + ${plan.fluidMlPerHour} ml fluid + ${plan.sodiumMgPerHour} mg sodium per hour.`
        : `Gel every ~25 min (~${Math.min(60, plan.carbsGPerHour)} g/h) + water at every station.`;
    for (let h = 0; h * 60 < opts.totalMin; h++)
      slots.push({ fromMin: h * 60, toMin: Math.min((h + 1) * 60, opts.totalMin), what: `Hour ${h + 1}: ${hourly}` });
  }
  return slots;
}
