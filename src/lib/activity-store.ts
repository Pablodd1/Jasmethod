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
      const fields = [
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
    const { start, end } = dayBounds(timezone, new Date(activity.date));
    const candidates = await tx.workout.findMany({
      where: {
        userId,
        planned: true,
        completed: false,
        matchedPlanId: null,
        sport: activity.sport,
        date: { gte: start, lt: end },
      },
    });
    const match = candidates.filter(
      (w) =>
        Math.abs(w.durationMin - activity.durationMin) <=
        Math.max(10, w.durationMin * 0.3),
    );
    // Ambiguous double-session days require manual reconciliation.
    if (match.length === 1)
      await tx.workout.update({
        where: { id: match[0].id },
        data: { completed: true, matchedPlanId: saved.id },
      });
    return true;
  });
}
