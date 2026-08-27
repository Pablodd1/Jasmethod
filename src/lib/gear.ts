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
  const sports = input.sports || (isTri ? ["bike", "run", "swim"] : input.raceDistance ? [input.raceDistance] : []);
  const level = input.experience || "amateur";

  // ---- BIKE POWER ----
  if (sports.includes("bike") && !input.hasBikePowerMeter) {
    out.push({
      id: "pm-bike",
      category: "power",
      title: "Bike power meter",
      advice: input.ftp
        ? `Your FTP is ${input.ftp}W but nothing measures it live. A crank or pedal PM (Assioma, 4iiii, Garmin Rally, Favero) makes every interval measurable — power pacing beats HR for steady efforts.`
        : "No bike power meter detected. An entry pedal PM (Favero Assioma ~$350-500) unlocks FTP tests, TSS and even pacing. You can't manage what you can't measure.",
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
  if (!input.hasHrm) {
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
      advice: "Use normalized power targets (not average) on hilly courses — surges cost more than steady output. Set interval targets as % of FTP, not feel.",
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
