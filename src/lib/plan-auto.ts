// Setup never silently assigns a goal, event date or individual plan.
import { ensureFirstPlan } from "./first-plan-store";
import { assessPlanningSetup, planningGoal, PLANNABLE_GOALS, type PlanningSetup } from "./planning-setup";
export { parseDate } from "./dates";
import { enforceEccentricSpacing } from "./performance-engine";

/** Plan-level biomechanical gate: ≥48 h between high-eccentric (run Z4+/plyo/heavy lower-body)
 * sessions. A later conflicting session moves to bike/swim if the athlete has one, else drops to Z2.
 * Pure; apply to a generated week before preview/confirmation. */
export function spaceHighEccentricSessions<T extends { date: Date | string; sport: string; type: string; intensity?: string | null }>(week: T[], availableSports: string[]) {
  return enforceEccentricSpacing(week, availableSports);
}

export function starterPlanInputs(profile: {
  goal?: string | null; experience?: string | null; weeklyHours?: number | null; raceDate?: Date | null;
} | null, setup: PlanningSetup | null = null) {
  const distance = PLANNABLE_GOALS.includes(planningGoal(profile?.goal) || "") ? planningGoal(profile?.goal) : null;
  const level = ["pro", "advanced", "amateur", "beginner"].includes(profile?.experience || "") ? profile!.experience! : null;
  const hasRace = Boolean(profile?.raceDate && Number.isFinite(profile.raceDate.getTime()) && profile.raceDate.getTime() > Date.now());
  return { distance, level, weeks: setup?.planWeeks ?? null, hasRace, ...assessPlanningSetup(profile, setup) };
}

/** Compatibility entry point. Only a first provisional week may be automatic;
 * replacing any active plan still requires explicit preview and confirmation. */
export async function autoGenerateStarterPlan(userId: string) {
  return ensureFirstPlan(userId);
}
