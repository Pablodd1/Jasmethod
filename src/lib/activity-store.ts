import { prisma } from "./db";
import { dayBounds } from "./dates";

// Provider records remain the source of measured results. A fulfilled plan is
// linked to the import so it is never counted a second time in training load.
export async function storeActivity(
  userId: string,
  timezone: string,
  activity: any,
): Promise<boolean> {
  if (
    !activity.externalId ||
    !Number.isFinite(new Date(activity.date).getTime()) ||
    !Number.isFinite(activity.durationMin) ||
    activity.durationMin <= 0
  )
    throw new Error("Activity has invalid date or duration");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const existing = await tx.workout.findFirst({
      where: {
        userId,
        externalId: activity.externalId,
        source: activity.source,
      },
    });
    if (existing) {
      await clearActivityLinks(tx, userId, [existing.id]);
      const fields = [
        "sport",
        "title",
        "date",
        "durationMin",
        "distanceKm",
        "avgHr",
        "maxHr",
        "avgPower",
        "np",
        "tss",
        "calories",
      ];
      await tx.workout.update({
        where: { id: existing.id },
        data: {
          ...Object.fromEntries(
            fields
              .filter((k) => activity[k] !== undefined)
              .map((k) => [k, activity[k]]),
          ),
          actualDurationMin: activity.durationMin,
        },
      });
      await matchActivity(tx, userId, timezone, { ...existing, ...activity, id: existing.id });
      return false;
    }
    const same = await tx.workout.findFirst({
      where: {
        userId,
        planned: false,
        completed: true,
        sport: activity.sport,
        date: {
          gte: new Date(new Date(activity.date).getTime() - 60000),
          lte: new Date(new Date(activity.date).getTime() + 60000),
        },
        durationMin: {
          gte: activity.durationMin - 1,
          lte: activity.durationMin + 1,
        },
      },
    });
    if (same) return false;
    const fields = [
      "date",
      "sport",
      "title",
      "durationMin",
      "distanceKm",
      "avgHr",
      "maxHr",
      "avgPower",
      "np",
      "tss",
      "calories",
      "source",
      "externalId",
    ];
    const data = Object.fromEntries(
      fields
        .filter((k) => activity[k] !== undefined)
        .map((k) => [k, activity[k]]),
    );
    const saved = await tx.workout.create({
      data: {
        userId,
        type: "endurance",
        planned: false,
        completed: true,
        actualDurationMin: activity.durationMin,
        ...data,
      } as any,
    });
    await matchActivity(tx, userId, timezone, saved);
    return true;
  });
}

// A duration alone cannot distinguish a morning interval session from an
// evening easy run. Abstain whenever more than one prescription could fit.
export function selectUnambiguousPlan<T extends { durationMin: number }>(
  candidates: T[], actualDurationMin: number,
): T | null {
  const eligible = candidates.filter(w =>
    Math.abs(w.durationMin - actualDurationMin) <= Math.max(10, w.durationMin * 0.3));
  return eligible.length === 1 ? eligible[0] : null;
}

async function matchActivity(tx: any, userId: string, timezone: string, activity: any) {
  const { start, end } = dayBounds(timezone, new Date(activity.date));
  const candidates = await tx.workout.findMany({ where: {
    userId, planned: true, completed: false, matchedPlanId: null,
    feedbackStatus: null,
    sport: activity.sport, date: { gte: start, lt: end },
  }});
  const best = selectUnambiguousPlan<any>(candidates, activity.durationMin);
  if (best) await tx.workout.update({ where: { id: best.id },
    data: { completed: true, matchedPlanId: activity.id } });
}

async function clearActivityLinks(tx: any, userId: string, activityIds: string[]) {
  // Preserve explicit athlete/coach feedback; only retract automatic completion.
  await tx.workout.updateMany({ where: { userId, planned: true,
    matchedPlanId: { in: activityIds }, feedbackStatus: null },
    data: { completed: false, matchedPlanId: null } });
  await tx.workout.updateMany({ where: { userId, planned: true,
    matchedPlanId: { in: activityIds } }, data: { matchedPlanId: null } });
}

export async function deleteImportedActivities(userId: string, source: string, externalIds: string[]) {
  if (!externalIds.length) return { count: 0 };
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const rows = await tx.workout.findMany({ where: { userId, source,
      planned: false, externalId: { in: externalIds } }, select: { id: true } });
    await clearActivityLinks(tx, userId, rows.map(row => row.id));
    const deleted = await tx.workout.deleteMany({ where: { userId, source,
      planned: false, id: { in: rows.map(row => row.id) } } });
    return deleted;
  });
}
