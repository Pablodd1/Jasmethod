import type { PlanningSetup } from "./planning-setup";

import type { WorkoutStep } from "./prescription";

export const STARTER_SESSION_VERSION = "day-zero-v2";
export const STARTER_SESSION_MINUTES = 60;
/** A product starting suggestion, not a measured baseline or a performance protocol. */
export function starterRestriction(profile: {injured?:boolean;birthYear?:number|null}|null|undefined, setup:PlanningSetup|null|undefined, now=new Date()) {
  return !!profile?.injured || !!(profile?.birthYear && now.getUTCFullYear()-profile.birthYear<18)
    || setup?.restrictions === "present" || setup?.qualifiedReview === "required" || setup?.interruptions === "yes";
}
const TRIATHLON_GOALS = ["triathlon","sprint","olympic","half","full"];
export function starterSession(goal:string|null|undefined, recentSport?:string|null, observationIndex?: number) {
  const triathlonSport = observationIndex === undefined ? "run" : (["swim","bike","run"] as const)[observationIndex % 3] ?? "swim";
  const sport = goal === "cycle" ? "bike" : goal === "swim-only" ? "swim"
    : goal === "hyrox" || goal === "track-sprint" ? "mobility"
    : TRIATHLON_GOALS.includes(goal ?? "") ? triathlonSport
    : ["run-only","5k","10k","half-marathon","marathon"].includes(goal??"") ? "run" : ["run","bike","swim"].includes(recentSport ?? "") ? recentSport! : "mobility";
  const guidance = sport === "run" ? "Walk or alternate comfortable walking and easy jogging. Keep conversation easy; no pace target."
    : sport === "bike" ? "Use a familiar bike in a safe setting. Pedal comfortably; no power target."
    : sport === "swim" ? "Only if you can swim confidently with appropriate supervision and pool access: familiar relaxed swimming, pausing as needed. Otherwise choose gentle land movement in Profile."
    : goal === "hyrox" ? "Alternate easy walking with familiar unloaded station patterns such as a supported squat or step-back. Skip any unfamiliar movement. No race loads, jumps or maximal efforts."
    : "Use gentle familiar walking and comfortable mobility. No loaded stations, jumps or maximal efforts.";
  return { starterVersion:STARTER_SESSION_VERSION, title:"Day zero — comfortable observation", sport,
    type:"recovery", intensity:"z1", durationMin:goal ? STARTER_SESSION_MINUTES : 20,
    description:`${guidance} Use the scheduled time as a session window. Take longer breaks or finish early if effort rises or symptoms develop. Record completed blocks, actual minutes and overall effort. Add recent sport history or a dated test result in Profile to refine your next sessions.`, startTime:null };
}
/** Never grant an incomplete-setup exception to a changed protocol or numeric target. */
export function isStarterSession(workout:{source?:string|null;originalPlan?:string|null;sport?:string;type?:string}) {
  if (workout.source !== "starter" || !workout.originalPlan) return false;
  try {
    const p=JSON.parse(workout.originalPlan);
    return (workout.sport == null || workout.sport===p.sport) && (workout.type == null || workout.type===p.type) && [STARTER_SESSION_VERSION,"day-zero-v1"].includes(p.starterVersion) && ["run","bike","swim","mobility"].includes(p.sport)
      && p.type==="recovery" && p.intensity==="z1" && Number.isInteger(p.durationMin) && p.durationMin>=1 && p.durationMin<=(p.starterVersion==="day-zero-v1" ? 20 : STARTER_SESSION_MINUTES) && !p.protocol && !p.sportStructure;
  } catch { return false; }
}

/** Repeatable easy efforts with observation and recovery inside the session window. */
export function starterSessionSteps(sport: string, minutes: number, description?: string | null): WorkoutStep[] {
  const total = Math.round(minutes * 60);
  if (total < 1) return [];
  const warmup = Math.floor(total / 4);
  const technique = Math.floor(total / 6);
  const cooldown = Math.floor(total / 6);
  const main = total - warmup - technique - cooldown;
  const names = sport === "run" ? ["Easy walk or jog", "Marching and controlled leg swings", "Comfortable walk/run", "Easy walk"]
    : sport === "bike" ? ["Easy spin", "Smooth cadence in a light gear", "Comfortable seated riding", "Easy spin"]
    : sport === "swim" ? ["Easy swimming with wall breaks", "Relaxed stroke practice", "Relaxed swimming with pauses at the wall", "Easy lengths or finish at the wall"]
    : ["Easy walking and comfortable mobility", "Rehearse familiar unloaded movements", "Easy walking and unloaded movement practice", "Easy walk and settle breathing"];
  const steps: WorkoutStep[] = [];
  const add = (name: string, seconds: number, phase: WorkoutStep["phase"], note?: string) => {
    if (seconds > 0) steps.push({ name, seconds, phase, zone: "z1", target: { type: "open" }, ...(note ? { note } : {}) });
  };
  add(names[0], warmup, "warmup", description ?? undefined);
  add(names[1], technique, "warmup", "Keep the effort comfortable. Pause whenever needed.");
  const count = total >= 1800 ? 3 : 1;
  for (let index = 0; index < count; index++) {
    const block = Math.floor(main * (index + 1) / count) - Math.floor(main * index / count);
    const recovery = Math.floor(block / 2);
    add(names[2], block - recovery, "active", "Repeat at the same easy effort. Record completed blocks and any symptoms or changes in effort.");
    add(sport === "swim" ? "Rest at the wall" : "Easy movement or rest", recovery, "recovery");
  }
  add(names[3], cooldown, "cooldown", "Let breathing settle naturally. Record what you actually completed.");
  return steps;
}
