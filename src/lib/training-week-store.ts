import { prisma } from "./db";
import { ACTIVITY_EVIDENCE_SELECT, type ActivityDecision } from "./activity-evidence";
import { trainingViewDisclosureAllowed } from "./activity-disclosure";
import { currentOrReportedWorkoutWhere } from "./calendar-workouts";
import { localDate } from "./dates";
import { buildTrainingWeekReview, trainingWeekBounds } from "./training-week-review";

/** Optional local display read. Failure must not hide saved session instructions. */
export async function readTrainingWeekReview(actorId: string, userId: string, today: string, timezone: string, activePlanId: string | null, decisions: readonly ActivityDecision[], db: Pick<typeof prisma, "workout"> = prisma) {
  try {
    const bounds = trainingWeekBounds(today);
    const rows = await db.workout.findMany({ where: { AND: [currentOrReportedWorkoutWhere(userId, activePlanId)], date: { gte: localDate(bounds.start, timezone), lt: localDate(bounds.until, timezone) } },
      select: { ...ACTIVITY_EVIDENCE_SELECT, title: true, planDay: { select: { planId: true } } }, orderBy: [{ date: "asc" }, { id: "asc" }], take: 501 });
    if (!trainingViewDisclosureAllowed(actorId, userId, rows)) return null;
    return buildTrainingWeekReview(rows.slice(0,500), userId, today, timezone, activePlanId, decisions, rows.length > 500);
  } catch { return null; }
}
