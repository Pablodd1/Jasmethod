// JasMiamiMethod — Masters 400m/200m Sprint Engine
// For 60+ athletes targeting national or world-record level performance.
//
// The science of masters sprinting is different from open-category sprinting:
// - Type II muscle fiber atrophy is the main driver of speed loss (~8% power/decade)
// - Recovery needs are longer: 48-72h between max-velocity sessions (not 24-48h)
// - Volume must be LOWER but intensity must stay HIGH to preserve fast-twitch fibers
// - Strength training 2-3×/week is mandatory to counter sarcopenia
// - Injury risk is higher: warm-up is longer, speed volume is capped
// - Creatine and protein become MORE important with age (anabolic resistance)
//
// Sources:
// - Messa et al. 2024: type II fibre atrophy in masters sprint runners (PMC)
// - Rebollar 2023: masters sprinters — less is more
// - Cannataro 2022: high-speed resistance training counters sarcopenia
// - Haugen 2019: sprint training development review
// - WMA 2025: masters athletics records and standards
// - Rittweger 2018: muscle power decline ~8%/decade in masters athletes

import type { GeneratedWeek, PlanSession } from "./science";

export interface MastersSprintProfile {
  age: number;                    // 55, 60, 65, 70, etc.
  event: "200m" | "400m";
  currentPB: { event200m?: number; event400m?: number }; // seconds
  targetPB: { event200m?: number; event400m?: number };
  yearsTraining: number;
  injuryHistory: string[];
  trainingDaysPerWeek: number;
}

// Age-graded decline rates (from Masters Athletics research)
export const AGE_DECLINE = {
  powerPerDecade: 0.08,     // 8% neuromuscular power loss per decade after 40
  musclePerDecade: 0.05,    // 5% muscle mass per decade
  typeIILoss: "Fast-twitch (type II) fibers are lost faster than slow-twitch (type I) fibers",
  recoveryMultiplier: 1.5,  // recovery takes 1.5× longer than a 25-year-old
  injuryRisk: "Higher — warm-up must be longer, speed volume capped",
};

// M60 World Records (approximate, verify against WMA records page)
export const M60_RECORDS = {
  "100m": 11.70,
  "200m": 23.00,
  "400m": 51.40,
  longJump: "5.85m",
};

// Target paces by level for M60
export const M60_TARGETS: Record<string, { "200m": number; "400m": number }> = {
  world_record: { "200m": 23.0, "400m": 51.4 },
  national: { "200m": 24.5, "400m": 55.0 },
  regional: { "200m": 26.0, "400m": 60.0 },
  competitive: { "200m": 28.0, "400m": 65.0 },
};

export function generateMastersSprintPlan(opts: {
  age: number;
  event: "200m" | "400m";
  weeks: number;
  startDate: Date;
  currentPB200?: number;    // seconds
  currentPB400?: number;    // seconds
  targetPB400?: number;     // seconds
  trainingDays: number;     // 4-6 (masters athletes should NOT train 7 days)
}): GeneratedWeek[] {
  const { event, weeks, startDate, trainingDays } = opts;
  const ageGroup = opts.age >= 70 ? "M70" : opts.age >= 65 ? "M65" : "M60";
  const is400 = event === "400m";
  const recoveryFactor = 1.5; // 60yo needs 1.5× the recovery of a 25yo

  const weeksOut: GeneratedWeek[] = [];

  for (let w = 1; w <= weeks; w++) {
    const phase = w <= weeks * 0.25 ? "General Prep"
      : w <= weeks * 0.55 ? "Specific Prep"
      : w <= weeks - 1 ? "Pre-Competition"
      : "Competition";
    const isRace = w === weeks || w === weeks - 1;
    const sessions: PlanSession[] = [];
    const vol = 1 - (w / weeks) * 0.2; // volume decreases over the cycle

    // MONDAY: Speed Development (the key session)
    const speedTitle = is400
      ? w <= weeks * 0.25 ? "Speed: Acceleration Development" : w <= weeks * 0.55 ? "Speed: 200m Repeats" : "Speed: Race-Specific Endurance"
      : w <= weeks * 0.25 ? "Speed: Acceleration + Max Velocity" : w <= weeks * 0.55 ? "Speed: Flying 30s" : "Speed: Race Model";
    const speedDesc = is400
      ? (w <= weeks * 0.25
        ? `10 min warm-up + drills. 6×80m accelerations at 90-95% MV, rest 3 min (full recovery — masters need longer). Plyo: box jumps 3×5, A-skips 3×20m. Cool: 10 min walk + stretch.`
        : w <= weeks * 0.55
        ? `10 min warm-up + drills. 5×200m at target 400m race pace (first 200 split pace), rest 5-6 min. This teaches pacing under fatigue. Plyo: single-leg bounds 3×6/leg. Cool: 10 min walk + stretch.`
        : `10 min warm-up + drills. 3×150m at 95% of target race pace, rest 8-10 min. Then 1×300m time trial to gauge fitness. Race week: reduce volume 50%.`)
      : (w <= weeks * 0.25
        ? `10 min warm-up + drills. 6×20m block starts at 100% effort, rest 3-4 min. 4×30m fly at 95-100% MV, rest 5 min. Plyo: box jumps 3×5, single-leg bounds 3×6/leg.`
        : w <= weeks * 0.55
        ? `10 min warm-up + drills. 5×60m at 95% MV, rest 5-6 min. 3×30m fly at 100% MV, rest 6 min. Plyo: depth jumps 3×5 from 30cm.`
        : `10 min warm-up + drills. 3×60m at race pace, rest 6 min. 2×30m fly at 100% MV. Volume halved — sharpen only.`);

    sessions.push({
      sport: "run", title: speedTitle, minutes: 90, zone: "z5", type: "speed",
      description: speedDesc,
    });

    // TUESDAY: Strength — Heavy Lower (mandatory for masters: counters type II fiber loss)
    sessions.push({
      sport: "strength", title: "Strength: Heavy Lower + Core", minutes: 75, zone: "z1", type: "strength",
      description: `MANDATORY for masters sprinters — counters type II fiber atrophy (Messa 2024). Back Squat 4×4 @85% 1RM (3-4 min rest). RDL 3×6 @80%. Bulgarian Split Squat 3×5/leg. Calf Raise 3×8 loaded. Core: Pallof Press 3×10/side, dead bugs 3×10. Heavy loading preserves fast-twitch fibers (Cannataro 2022).`,
    });

    // WEDNESDAY: Tempo Recovery (extensive tempo — keeps aerobic base, flushes)
    sessions.push({
      sport: "run", title: "Tempo Recovery + Core", minutes: 45, zone: "z2", type: "tempo",
      description: `10 min jog. ${is400 ? "8" : "10"}×100m @70% max velocity, rest 45-60s (walk back). Should feel conversational. Core: 3×(30s plank + 10 dead bugs + 20 side plank). Cool: 5 min walk + stretch. This flushes lactate and keeps the aerobic base.`,
    });

    // THURSDAY: Rest or Upper Body (masters need more recovery)
    sessions.push({
      sport: "recovery", title: "Recovery or Upper Body (optional)", minutes: 40, zone: "z1", type: "recovery",
      description: `COMPLETE REST or upper-body strength only (bench 3×8 @75%, rows 3×8, pull-aparts 3×15). Masters athletes need 48-72h between intense lower-body sessions — this is not optional (recovery factor 1.5× at age 60).`,
    });

    // FRIDAY: Strength — Power + Plyo (the explosive day)
    sessions.push({
      sport: "strength", title: "Strength: Power + Plyometrics", minutes: 60, zone: "z3", type: "plyo",
      description: `Power Clean 4×3 @70% (3 min rest). Trap Bar Jump Squat 4×4 @30% 1RM. Depth Jumps 3×5 from 30cm box. Single-Leg Bounds 3×6/leg. Sled Push 4×20m heavy. Plyo contacts: 40-60 max per session. Explosive intent on every rep — this is neural, not metabolic.`,
    });

    // SATURDAY: Second speed session or race-specific
    if (!isRace && trainingDays >= 5) {
      const satTitle = is400
        ? w <= weeks * 0.4 ? "Speed Endurance II: 300-400m Repeats" : w <= weeks * 0.7 ? "Special Endurance: 350m + 150m" : "Race Simulation: 300m time trial"
        : w <= weeks * 0.4 ? "Speed Endurance: 120-150m Repeats" : w <= weeks * 0.7 ? "Speed Endurance: 150m × repeats" : "Race Simulation: 120m time trial";
      const satDesc = is400
        ? w <= weeks * 0.4
          ? `10 min warm-up + drills. 3×300m @85% MV with 15-20 min full recovery. This is the key 400m-specific session — builds lactate tolerance.`
          : w <= weeks * 0.7
          ? `10 min warm-up + drills. 350m @90% target race pace, rest 20 min, then 150m @95% MV. Simulates the race model.`
          : `10 min warm-up + drills. 300m time trial at 90-95% target pace. Full recovery 20 min. Final race rehearsal.`
        : w <= weeks * 0.4
        ? `10 min warm-up + drills. 4×120m at 90-95% MV, rest 10 min. Build speed endurance for the curve.`
        : w <= weeks * 0.7
        ? `10 min warm-up + drills. 3×150m at 92-95% MV, rest 10-12 min. Curve running practice at race intensity.`
        : `10 min warm-up + drills. 120m time trial at 95-100% effort. Full recovery 15 min between reps. Race rehearsal.`;
      sessions.push({
        sport: "run", title: satTitle, minutes: 90, zone: "z5", type: "speed",
        description: satDesc,
      });
    }

    // SUNDAY: Rest (mandatory for masters)
    sessions.push({
      sport: "recovery", title: "Rest Day (mandatory)", minutes: 0, zone: "z1", type: "recovery",
      description: "Complete rest. At 60+, the body needs 48-72h between intense sessions. This is not optional — it's where the adaptation happens. Sleep 8-9h, hydrate, eat protein.",
    });

    weeksOut.push({
      week: w,
      theme: `${event} ${phase} — week ${w}${isRace ? " (RACE WEEK)" : ""}`,
      sessions,
      totalMinutes: sessions.reduce((a, s) => a + s.minutes, 0),
    });
  }
  return weeksOut;
}

// Race model for 400m — pacing strategy based on world-class splits
export const RACE_MODEL_400M = {
  explanation: "The 400m is two races in one: an all-out 200m, then a decaying 200m on borrowed energy. The best runners go out fast but controlled — the differential between first and second 200 is ~1.5-2.0 seconds for elite, ~2-3 seconds for masters.",
  worldRecord: {
    athlete: "Wayde van Niekerk",
    time: 43.03,
    first200: 21.1,
    second200: 22.0,
    differential: 0.90,
    source: "Rio 2016 Olympic Final (Wikipedia/World Athletics)",
  },
  mastersReference: {
    athlete: "M60 World Class",
    time: 51.4,
    first200: 24.5,
    second200: 27.0,
    differential: 2.50,
    note: "At 60, the differential widens because anaerobic capacity declines faster than aerobic capacity",
  },
  keyPrinciples: [
    "First 50m: violent acceleration from blocks — drive phase, big arms, low heel recovery",
    "50-200m: transition to upright, relax the face and hands, build to race pace",
    "200-300m: FLOAT — maintain mechanics, don't press, let momentum carry",
    "300-400m: everything you have left — arms drive, knees up, fight the deceleration",
    "The differential tells you if you went out too hard (differential >3s) or too soft (<1.5s)",
  ],
};

// Recovery protocol specific to masters sprinters
export const MASTERS_RECOVERY_PROTOCOL = {
  betweenSpeedSessions: "48-72 hours minimum between max-velocity sessions",
  betweenStrengthSessions: "48 hours between heavy lower-body strength sessions",
  weeklyStructure: "2 speed days + 2 strength days + 1 tempo day + 2 rest days = 7 days (no doubling up)",
  nutrition: [
    "Creatine 3-5g/day — MORE important at 60+ (anabolic resistance means you need more)",
    "Protein 1.8-2.2g/kg/day — higher than younger athletes to counter anabolic resistance",
    "Omega-3 DHA 1-2g/d — reduces inflammation, supports brain health",
    "Vitamin D 2000-4000 IU/d — bone health, muscle function",
    "Post-session: 30-40g protein within 30 min (older athletes need more per meal)",
  ],
  sleep: "8-9 hours minimum. Growth hormone peaks in deep sleep and is critical for masters recovery.",
  warningSigns: [
    "Morning resting HR +5bpm above baseline for 3+ days",
    "CMJ height drops >8% below baseline",
    "Persistent soreness that doesn't resolve in 72h",
    "Sleep quality declining — not recovering between sessions",
  ],
};
