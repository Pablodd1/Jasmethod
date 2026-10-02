// Setup never silently assigns a goal, event date or individual plan.
import { prisma } from "./db";
import { assessPlanningSetup, planningGoal, PLANNABLE_GOALS, type PlanningSetup } from "./planning-setup";
import { readPlanningSetup } from "./planning-setup-store";
export { parseDate } from "./dates";

export function starterPlanInputs(profile: {
  goal?: string | null; experience?: string | null; weeklyHours?: number | null; raceDate?: Date | null;
} | null, setup: PlanningSetup | null = null) {
  const distance = PLANNABLE_GOALS.includes(planningGoal(profile?.goal) || "") ? planningGoal(profile?.goal) : null;
  const level = ["pro", "advanced", "amateur", "beginner"].includes(profile?.experience || "") ? profile!.experience! : null;
  const hasRace = Boolean(profile?.raceDate && Number.isFinite(profile.raceDate.getTime()) && profile.raceDate.getTime() > Date.now());
  return { distance, level, weeks: setup?.planWeeks ?? null, hasRace, ...assessPlanningSetup(profile, setup) };
}

/** Compatibility entry point: only reports an existing plan or explicit gaps.
 * A new/replacement plan must be previewed and confirmed in /training. */
export async function autoGenerateStarterPlan(userId: string) {
  const [user, existing, setupState] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, include: { profile: true } }),
    prisma.trainingPlan.findFirst({ where: { userId, status: "active" }, orderBy: { createdAt: "desc" }, select: { id: true, distance: true } }),
    readPlanningSetup(userId),
  ]);
  if (!user) throw new Error("user not found");
  if (existing) return { planId: existing.id, distance: existing.distance, created: false, status: "existing", missing: [] as string[] };
  const readiness = assessPlanningSetup(user.profile, setupState.setup);
  return { planId: null, distance: user.profile?.goal ?? null, created: false,
    status: readiness.ready ? "preview_confirmation_required" : "setup_incomplete",
    missing: [...readiness.missing, ...readiness.review] };
}
