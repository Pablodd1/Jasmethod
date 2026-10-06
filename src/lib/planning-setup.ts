import {parsePlanningTarget, setupNumber, type PlanningTarget} from "./planning-target";
import { dateKey } from "./dates";
import { parseTravelContext, type TravelContext } from "./travel-context";
export type { TravelContext } from "./travel-context";
// Source-labelled setup evidence. No wearable or maximal testing is required.
export const PLANNING_SETUP_VERSION = "manual-setup-v1";
export const planningGoal = (goal?: string | null) => ["5k","10k","half-marathon","marathon"].includes(goal || "") ? "run-only" : goal ?? null;
export const PLANNABLE_GOALS = ["sprint", "olympic", "half", "full", "hyrox", "boxing", "track-sprint", "cycle", "run-only", "swim-only", "lifting"];
export interface PlanningSetup {
  version: typeof PLANNING_SETUP_VERSION;
  source: "athlete_reported" | "coach_set";
  confirmedAt: string;
  adultConfirmed: boolean;
  profileConfirmed: boolean;
  goalDescription: string;
  baselineWeeklyMinutes: number | null;
  baselineObservedAt: string | null;
  interruptions: "none" | "yes" | "unknown";
  restrictions: "none" | "present" | "unknown";
  qualifiedReview: "none_needed" | "required" | "unknown";
  trainingDays: number[];
  maxSessionMinutes: number | null;
  equipmentAccess: string;
  planWeeks: number | null;
  trackEvent: "100m" | "200m" | "400m" | null;
  targetGoal: PlanningTarget | null;
  baselinePlanOptIn?: boolean;
  coachPreference?: string;
  travel?: TravelContext | null;
}
export function parsePlanningSetup(value: unknown, now = new Date(), timezone = "UTC", options: {allowPastTarget?:boolean} = {}): PlanningSetup {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid planning setup");
  const v = value as Record<string, unknown>;
  const number = (key: string, min: number, max: number) => {
    if (v[key] == null || v[key] === "") return null;
    return setupNumber(v[key], key, min, max);
  };
  const option = <T extends string>(key: string, values: readonly T[], fallback: T): T => {
    if (v[key] == null || v[key] === "") return fallback;
    if (!values.includes(v[key] as T)) throw new Error(`Invalid setup ${key}`);
    return v[key] as T;
  };
  const days = v.trainingDays == null ? [] : v.trainingDays;
  if (!Array.isArray(days) || days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) throw new Error("Invalid training days");
  const date = v.baselineObservedAt ? String(v.baselineObservedAt) : null;
  if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date || date > dateKey(now, timezone))) throw new Error("Invalid baseline observation date");
  return {
    version: PLANNING_SETUP_VERSION, source: "athlete_reported", confirmedAt: now.toISOString(),
    adultConfirmed: v.adultConfirmed === true, profileConfirmed: v.profileConfirmed === true,
    goalDescription: typeof v.goalDescription === "string" ? v.goalDescription.trim().slice(0,1000) : "",
    baselineWeeklyMinutes: number("baselineWeeklyMinutes", 0, 2400), baselineObservedAt: date,
    interruptions: option("interruptions", ["none", "yes", "unknown"], "unknown"),
    restrictions: option("restrictions", ["none", "present", "unknown"], "unknown"),
    qualifiedReview: option("qualifiedReview", ["none_needed", "required", "unknown"], "unknown"),
    trainingDays: [...new Set(days as number[])].sort(), maxSessionMinutes: number("maxSessionMinutes", 10, 300),
    equipmentAccess: typeof v.equipmentAccess === "string" ? v.equipmentAccess.trim().slice(0,1000) : "",
    planWeeks: number("planWeeks", 4, 30),
    baselinePlanOptIn: v.baselinePlanOptIn === true,
    coachPreference: typeof v.coachPreference === "string" ? v.coachPreference.trim().slice(0,200) : "",
    travel: parseTravelContext(v.travel),
    targetGoal: parsePlanningTarget(v.targetGoal,now,timezone,options.allowPastTarget),
    trackEvent: v.trackEvent == null || v.trackEvent === "" ? null : option<"100m" | "200m" | "400m">("trackEvent", ["100m","200m","400m"], "100m"),
  };
}
export function assessPlanningSetup(profile: {goal?: string|null; experience?: string|null; weeklyHours?: number|null; birthYear?: number|null; injured?: boolean}|null, setup: PlanningSetup|null, now = new Date(), context: "planning" | "daily" = "planning") {
  if (setup) {
    try {
      if (!Number.isFinite(Date.parse(setup.confirmedAt)) || Date.parse(setup.confirmedAt) > now.getTime()) throw new Error("Invalid setup confirmation time");
      const validated = parsePlanningSetup(setup,new Date(now.getTime()+86400000),"UTC",{allowPastTarget:true});
      setup = {...validated,source:setup.source,confirmedAt:setup.confirmedAt};
    } catch { return {ready:false, missing:["Review invalid or incomplete setup evidence"], review:[] as string[], ruleId:PLANNING_SETUP_VERSION}; }
  }
  const missing: string[] = [];
  const review: string[] = [];
  if (!profile?.goal || !PLANNABLE_GOALS.includes(planningGoal(profile.goal)!)) missing.push("Choose a supported training goal");
  if (!profile?.experience || !["beginner","amateur","advanced","pro"].includes(profile.experience)) missing.push("Confirm training experience");
  if (!profile?.weeklyHours || !Number.isFinite(profile.weeklyHours)) missing.push("Confirm available weekly training time");
  if (!setup?.profileConfirmed) missing.push("Explicitly confirm experience and available weekly time");
  if (!setup?.adultConfirmed) missing.push("Confirm adult pilot eligibility");
  if (profile?.birthYear && now.getUTCFullYear() - profile.birthYear < 18) review.push("Under-18 athletes need qualified review outside this adult pilot");
  if (!setup?.goalDescription) missing.push("Describe your goal (fitness, completion or performance)");
  if (!setup?.baselineWeeklyMinutes || !setup.baselineObservedAt) missing.push("Report recent tolerated weekly training and its observation date");
  else if (now.getTime() - Date.parse(setup.baselineObservedAt) > 28 * 86400000) missing.push("Update training history from the last four weeks");
  if (!setup || setup.interruptions === "unknown") missing.push("Confirm recent training interruptions");
  else if (setup.interruptions === "yes") review.push("Return after an interruption needs a reviewed starting load");
  if (!setup || setup.restrictions === "unknown") missing.push("Confirm current symptoms, injuries and restrictions");
  else if (setup.restrictions === "present" || profile?.injured) review.push("Current symptoms or restrictions need qualified review before an automated plan");
  if (!setup || setup.qualifiedReview === "unknown") missing.push("Confirm whether medical, pregnancy/postpartum or other circumstances need qualified review");
  else if (setup.qualifiedReview === "required") review.push("This circumstance is outside the automated adult pilot; ask a qualified professional for an individualized plan");
  if (context === "planning" && setup && now.getTime() - Date.parse(setup.confirmedAt) > 7 * 86400000) missing.push("Reconfirm current restrictions and availability before replacing a plan");
  if (!setup?.trainingDays.length) missing.push("Choose available training days");
  if (!setup?.maxSessionMinutes) missing.push("Confirm the maximum time per training day");
  if (!setup?.equipmentAccess) missing.push("Describe equipment and venue access");
  if (profile?.goal === "track-sprint" && !setup?.trackEvent) missing.push("Choose the actual track event; no event distance is assumed");
  const numericGoal = setup?.targetGoal && ["pace","power","speed"].includes(setup.targetGoal.metric);
  const targetReview = numericGoal ? ["Your numeric performance target is a goal, not a benchmark. Target-driven progression requires coaching review and is unavailable in this pilot. A baseline-only plan is bounded by recent tolerated training; it is not optimized or promised to achieve your target."] : [];
  if (numericGoal && !setup?.baselinePlanOptIn) review.push(...targetReview, "Explicitly choose baseline-only conservative planning in setup to keep this aspiration alongside a plan based on current tolerated training.");
  if (context === "planning" && setup?.targetGoal?.targetDate && setup.targetGoal.targetDate < dateKey(now,"UTC")) missing.push("Review your past target date before replacing a plan");
  if (!setup?.planWeeks) missing.push("Choose a planning horizon");
  return { ready: !missing.length && !review.length, missing, review, ruleId: PLANNING_SETUP_VERSION, ...(numericGoal ? {targetReview, planningBasis: setup?.baselinePlanOptIn ? "baseline_only" as const : "review_required" as const} : {}) };
}
