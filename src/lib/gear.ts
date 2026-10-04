// JasMiamiMethod — Equipment intelligence (power, aero, swim, HR, all tools).
// Recommendations grounded in RESEARCH_SOURCES (peer-reviewed).
// ponytail: rule-based gear advice; upgrade path = per-model drag database when
// users enter exact bikes.

import { ResearchSource } from "./research";

export interface GearInput {
  bikeType?: string;            // road | tt | tri | gravel | mountain
  hasBikePowerMeter?: boolean;
  hasRunPowerMeter?: boolean;
  hasBikeComputer?: boolean;
  hasAeroBars?: boolean;
  hasHrm?: boolean;             // chest strap
  hasGpsWatch?: boolean;
  hasSwimPaceTool?: boolean;    // watch w/ swim mode, pool pace clock, etc.
  hasSmartTrainer?: boolean;
  hasCadenceSensor?: boolean;
  raceDistance?: string;        // sprint | olympic | half | full | hyrox | run | swim
  sports?: string[];            // triathlon | run | bike | swim | hyrox
  ftp?: number | null;
  runPaceBase?: number | null;  // sec/km
  swimPaceBase?: number | null; // sec/100m
  weeklyHours?: number | null;
  experience?: string;          // beginner | amateur | advanced | pro
}

export interface GearAdvice {
  id: string;
  category: "power" | "aero" | "pacing" | "heart" | "swim" | "equipment" | "data";
  title: string;
  advice: string;
  sourceIds: string[];
  priority: 1 | 2 | 3;          // 1 = do first
}

export function gearAdvice(input: GearInput): GearAdvice[] {
  const out: GearAdvice[] = [];
  const isTri = ["sprint", "olympic", "half", "full"].includes(input.raceDistance || "");
  const isBoxing = input.raceDistance === "boxing" || (input.sports || []).includes("boxing");
  const sports = input.sports || (isTri ? ["bike", "run", "swim"] : input.raceDistance ? [input.raceDistance] : []);
  const level = input.experience || "amateur";

  // ---- BOXING: measurement + bio data stack ----
  if (isBoxing) {
    out.push({
      id: "box-smart-bag",
      category: "power",
      title: "Punch-force measurement (smart bag or accelerometer)",
      advice: "Punch force is THE boxing KPI: elite straight punches land ~1500N vs ~1000N for juniors, Olympic boxers reach 2000-4800N. A water-filled smart bag (pressure-sensor validated) or accelerometer bag gives you peak force + punch count per round — train power by number, not feel.",
      sourceIds: ["pieter2022", "walilko2005", "diewald2022", "busko2016"],
      priority: 1,
    });
    out.push({
      id: "box-jump-cmj",
      category: "data",
      title: "CMJ / jump contact mat or app (neuromuscular readiness)",
      advice: "Countermovement-jump height and reactive strength index track punch output: boxers with higher CMJ throw more punches in fights and hit harder (Loturco). A contact mat (Optojump-class) or a phone jump app + weekly 3-jump test = your explosiveness and freshness gauge for the whole camp.",
      sourceIds: ["loturco2016", "munozlopez2024"],
      priority: 1,
    });
    out.push({
      id: "box-reaction",
      category: "equipment",
      title: "Reaction lights (BlazePod / FITLIGHT)",
      advice: "Eye-hand coordination and reaction time are the top predictors of punch hit rate — above raw eyesight. Reactive light pods for 10 min, 2-3×/week (cue → jab/slip/step) measurably improve visual reaction time and visuomotor skill. Cheaper alternative: a partner with a tennis ball and hand signals.",
      sourceIds: ["zhang2025", "hassan2025", "appelbaum2016"],
      priority: 2,
    });
    out.push({
      id: "box-video",
      category: "data",
      title: "Phone tripod (60fps) — film your rounds",
      advice: "The cheapest bio-feedback that exists: film shadow and bag rounds weekly, review at half speed for tells — dropping lead hand, flat feet, telegraphed shoulders. Motor learning sticks better with filmed feedback + one cue per session.",
      sourceIds: ["martinezdequel2019", "appelbaum2016"],
      priority: 3,
    });
    if (!input.hasHrm) {
      out.push({
        id: "box-hrm",
        category: "heart",
        title: "HR strap for round-based intensity",
        advice: "3-min rounds are HIIT: a chest strap shows inter-round HR recovery (the fight engine metric). Track HR at the 60s rest — faster drop between rounds = better aerobic recovery for the next output.",
        sourceIds: ["seiler2009", "plews2013"],
        priority: 2,
      });
    } else {
      out.push({
        id: "box-hrm",
        category: "heart",
        title: "Inter-round HR recovery (use your strap)",
        advice: "With your HR strap: log HR at end of round and at the 60s rest buzzer. Target: ≥25 bpm drop by the bell. Falling recovery across rounds = aerobic engine limit, add roadwork; stable recovery but fading punches = local shoulder/muscular endurance, add burnout finishers.",
        sourceIds: ["seiler2009"],
        priority: 2,
      });
    }
  }

  // ---- BIKE POWER ----
  if (sports.includes("bike") && !input.hasBikePowerMeter) {
    out.push({
      id: "pm-bike",
      category: "power",
      title: "Bike power meter",
      advice: input.ftp
        ? `Your FTP is ${input.ftp}W but nothing measures it live. A crank or pedal PM (Assioma, 4iiii, Garmin Rally, Favero) makes every interval measurable — power pacing beats HR for steady efforts.`
        : "No bike power meter detected. An entry pedal PM (Favero Assioma ~$350-500) supports threshold tests and power-based pacing. Without a meter, reported effort and duration still support training review.",
      sourceIds: ["jobson2009", "sanders2019"],
      priority: 1,
    });
  }

  // ---- SMART TRAINER (indoor consistency) ----
  if (sports.includes("bike") && !input.hasSmartTrainer && input.weeklyHours && input.weeklyHours >= 5) {
    out.push({
      id: "trainer",
      category: "equipment",
      title: "Smart trainer for structured sessions",
      advice: "A wheel-on or direct-drive smart trainer (Zwift Hub, Wahoo KICKR) gives you ERG-mode interval sessions and accurate power indoors — Miami heat makes indoor threshold work non-negotiable in summer.",
      sourceIds: ["jobson2009", "croucher2023"],
      priority: 2,
    });
  }

  // ---- CADENCE ----
  if (sports.includes("bike") && !input.hasCadenceSensor && !input.hasBikePowerMeter) {
    out.push({
      id: "cadence",
      category: "equipment",
      title: "Cadence sensor ($30-50)",
      advice: "Cheapest measurement upgrade: a cadence sensor (Wahoo, Garmin) tells you your pedal RPM so you can target 85-95 rpm in Z2 and avoid grinding. Pairs with any bike computer or watch.",
      sourceIds: ["jobson2009"],
      priority: 3,
    });
  }

  // ---- RUN POWER ----
  if (sports.includes("run") && !input.hasRunPowerMeter && level !== "beginner") {
    out.push({
      id: "pm-run",
      category: "power",
      title: "Running power meter (Stryd)",
      advice: input.runPaceBase
        ? `Your run threshold is ~${(input.runPaceBase / 60).toFixed(1)} min/km. A Stryd pod adds run power, giving instant feedback on hills and fatigue where pace lies to you. Validated against lab economy.`
        : "Stryd run power gives instant effort feedback where pace lies (hills, wind, fatigue). Best ROI for triathletes and hilly-course racers.",
      sourceIds: ["garcia2018", "austin2022"],
      priority: 2,
    });
  }

  // ---- HEART RATE STRAP ----
  if (!input.hasHrm && !isBoxing) {
    out.push({
      id: "hrm",
      category: "heart",
      title: "Chest HR strap",
      advice: "Optical wrist HR drifts on intervals. A chest strap (Garmin HRM-Pro, Polar H10 ~$60-90) is the gold standard for HRV and LTHR work — required for the HR-based zones this app builds.",
      sourceIds: ["plews2013", "buchheit2014"],
      priority: 1,
    });
  }

  // ---- GPS WATCH ----
  if (!input.hasGpsWatch) {
    out.push({
      id: "watch",
      category: "data",
      title: "GPS multisport watch",
      advice: "A GPS watch (Coros Pace, Garmin Forerunner) is your data hub: pace, distance, HR, sleep, recovery. Entry models start ~$200 and sync everything into this app.",
      sourceIds: ["fullagar2015", "mah2011"],
      priority: 2,
    });
  }

  // ---- SWIM MEASUREMENT ----
  if (sports.includes("swim")) {
    if (!input.hasSwimPaceTool) {
      out.push({
        id: "swim-tool",
        category: "swim",
        title: "Swim pacing tool",
        advice: input.swimPaceBase
          ? `Your CSS is ~${(input.swimPaceBase).toFixed(0)} sec/100m. To track it you need either a swim-mode watch (Coros/Garmin) for pool sets or a Tempo/Form swim tracker. Without one, swim intervals are guesswork.`
          : "Swim measurement is the most overlooked. A swim-mode watch or a Tempo swim tracker gives you stroke rate, SWOLF and split times per 100m — needed to run the CSS tests in the Labs section.",
        sourceIds: ["coggan", "friel"],
        priority: 1,
      });
    }
    if (input.raceDistance === "half" || input.raceDistance === "full") {
      out.push({
        id: "swim-openwater",
        category: "swim",
        title: "Open-water swim safety + sighting",
        advice: "For your distance race: add an open-water swim buoy (safety), practice sighting every 6-8 strokes, and do at least 2 OW sessions before race day. Miami's current can add 5-10 min to a 1.2mi swim if you drift.",
        sourceIds: ["ely2007"],
        priority: 3,
      });
    }
  }

  // ---- AERODYNAMICS (tri/road only) ----
  if (isTri && input.bikeType && input.bikeType !== "gravel" && input.bikeType !== "mountain") {
    const aero: string[] = [];
    if (!input.hasAeroBars) {
      aero.push("Add clip-on aero bars: at 40 km/h aero position saves ~30-60 W vs hands-on-hoods — the cheapest speed upgrade for a tri bike.");
    }
    aero.push("Lower your torso: a 5 cm drop in trunk angle measurably cuts CdA (Fonda & Saris). Get a bike fit that prioritizes hip angle + flat back.");
    aero.push("Aero helmet + tight kit save 5-15 W at race pace. Skip the baggy jersey on race day.");
    out.push({
      id: "aero-tri",
      category: "aero",
      title: `${(input.bikeType || "BIKE").toUpperCase()} aerodynamics for ${input.raceDistance}`,
      advice: aero.join(" "),
      sourceIds: ["fonda2011", "griffiths2022", "debray2014"],
      priority: input.ftp && input.ftp > 220 ? 2 : 3,
    });
  }

  // ---- POWER PACING STRATEGY ----
  if (input.hasBikePowerMeter && input.raceDistance) {
    out.push({
      id: "pacing-power",
      category: "pacing",
      title: `Power pacing for ${input.raceDistance}`,
      advice: "Use current power and reviewed threshold-relative targets to manage surges on hilly courses. Check perceived effort too; a processed summary power value is not a live interval target.",
      sourceIds: ["croucher2023", "sanders2019"],
      priority: 3,
    });
  }

  // ---- DATA HUB SUMMARY (the "everything in one place" pitch) ----
  const measured = [
    input.hasBikePowerMeter ? "bike power" : null,
    input.hasRunPowerMeter ? "run power" : null,
    input.hasHrm ? "HR strap" : null,
    input.hasGpsWatch ? "GPS watch" : null,
    input.hasSwimPaceTool ? "swim pacing" : null,
  ].filter(Boolean);
  out.push({
    id: "data-hub",
    category: "data",
    title: "Your measurement stack",
    advice: measured.length
      ? `You're tracking: ${measured.join(", ")}. Gap check: ${out.filter(a => a.priority === 1).map(a => a.title).join(", ") || "nothing urgent"}.`
      : "No measurement tools detected yet. This app turns raw data into coaching decisions — start with the HR strap (priority 1) and build from there.",
    sourceIds: [],
    priority: 3,
  });

  return out.sort((a, b) => a.priority - b.priority);
}

export function gearSources(advice: GearAdvice[], all: ResearchSource[]): ResearchSource[] {
  const ids = new Set(advice.flatMap((a) => a.sourceIds));
  return all.filter((s) => ids.has(s.id));
}
