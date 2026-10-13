import type { PlanningSetup } from "./planning-setup";

export const STARTER_SESSION_VERSION = "day-zero-v1";
/** A product starting suggestion, not a measured baseline or a performance protocol. */
export function starterRestriction(profile: {injured?:boolean;birthYear?:number|null}|null|undefined, setup:PlanningSetup|null|undefined, now=new Date()) {
  return !!profile?.injured || !!(profile?.birthYear && now.getUTCFullYear()-profile.birthYear<18)
    || setup?.restrictions === "present" || setup?.qualifiedReview === "required" || setup?.interruptions === "yes";
}
export function starterSession(goal:string|null|undefined, recentSport?:string|null) {
  const sport = goal === "cycle" ? "bike" : goal === "swim-only" ? "swim"
    : goal === "hyrox" || goal === "track-sprint" ? "mobility"
    : ["sprint","olympic","half","full","run-only","5k","10k","half-marathon","marathon"].includes(goal??"") ? "run" : ["run","bike","swim"].includes(recentSport ?? "") ? recentSport! : "mobility";
  const guidance = sport === "run" ? "Walk or alternate comfortable walking and easy jogging. Keep conversation easy; no pace target."
    : sport === "bike" ? "Use a familiar bike in a safe setting. Pedal comfortably; no power target."
    : sport === "swim" ? "Only if you can swim confidently with appropriate supervision and pool access: familiar relaxed swimming, pausing as needed. Otherwise choose gentle land movement in Profile."
    : "Use gentle familiar walking and comfortable mobility. No loaded stations, jumps or maximal efforts.";
  return { starterVersion:STARTER_SESSION_VERSION, title:"Day zero — comfortable observation", sport,
    type:"recovery", intensity:"z1", durationMin:20,
    description:`${guidance} Up to 20 minutes, not a compulsory minimum. This is a conservative starter suggestion, not a fully individualized plan or a fitness test. Check in first; stop if symptoms develop. Record actual minutes and overall effort afterward so the next session can use your history. Update Profile for sport, equipment, restrictions and goals.`, startTime:null };
}
/** Never grant an incomplete-setup exception to a changed protocol or numeric target. */
export function isStarterSession(workout:{source?:string|null;originalPlan?:string|null;sport?:string;type?:string}) {
  if (workout.source !== "starter" || !workout.originalPlan) return false;
  try {
    const p=JSON.parse(workout.originalPlan);
    return (workout.sport == null || workout.sport===p.sport) && (workout.type == null || workout.type===p.type) && p.starterVersion===STARTER_SESSION_VERSION && ["run","bike","swim","mobility"].includes(p.sport)
      && p.type==="recovery" && p.intensity==="z1" && Number.isInteger(p.durationMin) && p.durationMin>=1 && p.durationMin<=20 && !p.protocol && !p.sportStructure;
  } catch { return false; }
}
