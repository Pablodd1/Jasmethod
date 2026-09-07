import { prisma } from "./db";
import { ApiError } from "./access";
import { dateKey, parseDate, localDate } from "./dates";
import { baseWorkout } from "./prescription";

export async function updateWorkout(
  actorId: string,
  athlete: { id: string; timezone: string },
  body: any,
) {
  const id = String(body.sessionId || "");
  if (!id) throw new ApiError("Session is required");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.workout.findFirst({
      where: { id, userId: athlete.id },
      include: { planDay: true },
    });
    if (!existing) throw new ApiError("Session not found", 404);
    const data: Record<string, any> = {};
    for (const [key, max] of Object.entries({
      durationMin: 1440,
      actualDurationMin: 1440,
      rpe: 10,
      avgHr: 240,
      maxHr: 250,
      avgPower: 2500,
      np: 2500,
      distanceKm: 1500,
      preWeightKg: 350,
      postWeightKg: 350,
    })) {
      if (body[key] === undefined) continue;
      if (body[key] === null || body[key] === "") {
        if (key !== "durationMin") data[key] = null;
        continue;
      }
      const n = Number(body[key]);
      if (
        !Number.isFinite(n) ||
        n < 0 ||
        n > max ||
        (["durationMin", "actualDurationMin", "rpe", "avgHr", "maxHr"].includes(
          key,
        ) &&
          !Number.isInteger(n))
      )
        throw new ApiError(`Invalid ${key}`);
      data[key] = n;
    }
    for (const key of ["title", "notes", "feedbackNote"])
      if (body[key] !== undefined)
        data[key] =
          body[key] === null
            ? null
            : String(body[key]).slice(0, key === "title" ? 200 : 4000);
    if (data.title !== undefined && !data.title?.trim())
      throw new ApiError("Title is required");
    if (body.intensity !== undefined) {
      if (!/^z[1-7]$/.test(body.intensity))
        throw new ApiError("Invalid intensity");
      data.intensity = body.intensity;
    }
    if (body.sport !== undefined) {
      if (
        ![
          "run",
          "bike",
          "swim",
          "strength",
          "mobility",
          "recovery",
          "brick",
          "hyrox",
          "boxing",
          "other",
        ].includes(body.sport)
      )
        throw new ApiError("Invalid sport");
      data.sport = body.sport;
    }
    for (const key of ["completed", "indoor"])
      if (body[key] !== undefined) {
        if (typeof body[key] !== "boolean")
          throw new ApiError(`Invalid ${key}`);
        data[key] = body[key];
      }
    if (body.startTime !== undefined) {
      if (body.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.startTime))
        throw new ApiError("Invalid time");
      data.startTime = body.startTime || null;
    }
    if (body.feedbackStatus !== undefined) {
      if (!["completed", "partial", "skipped"].includes(body.feedbackStatus))
        throw new ApiError("Invalid workout outcome");
      data.feedbackStatus = body.feedbackStatus;
      data.feedbackAt = new Date();
      data.completed = body.feedbackStatus !== "skipped";
      if (body.feedbackStatus === "skipped") data.actualDurationMin = 0;
      else if (data.actualDurationMin == null)
        data.actualDurationMin =
          existing.actualDurationMin ?? existing.durationMin;
    }
    if (body.date !== undefined) {
      data.date = parseDate(body.date, athlete.timezone);
      if (existing.planDay) {
        const targetDate = localDate(
          dateKey(data.date, athlete.timezone),
          athlete.timezone,
        );
        let day = await tx.planDay.findFirst({
          where: { planId: existing.planDay.planId, date: targetDate },
        });
        if (!day) {
          const plan = await tx.trainingPlan.findUniqueOrThrow({
            where: { id: existing.planDay.planId },
          });
          const offset = Math.round(
            (Date.parse(dateKey(targetDate, athlete.timezone)) -
              Date.parse(dateKey(plan.startDate, athlete.timezone))) /
              86400000,
          );
          day = await tx.planDay.create({
            data: {
              planId: plan.id,
              date: targetDate,
              week: Math.max(1, Math.floor(offset / 7) + 1),
              dayOfWeek: new Date(
                `${dateKey(targetDate, athlete.timezone)}T12:00Z`,
              ).getUTCDay(),
              focus: data.sport || existing.sport,
            },
          });
        }
        data.planDayId = day.id;
      }
    }
    const prescriptionFields = [
      "title",
      "durationMin",
      "intensity",
      "sport",
      "notes",
      "startTime",
    ];
    if (prescriptionFields.some((k) => body[k] !== undefined)) {
      // An explicit edit establishes a new base; measured results stay separate.
      const base = {
        ...baseWorkout(existing),
        ...Object.fromEntries(
          prescriptionFields
            .filter((k) => data[k] !== undefined)
            .map((k) => [k === "notes" ? "description" : k, data[k]]),
        ),
      };
      data.type = base.type;
      data.durationMin = base.durationMin;
      data.intensity = base.intensity;
      data.title = base.title;
      data.notes = base.description;
      data.originalPlan = JSON.stringify(base);
      data.prescription = null;
      data.approved = false;
    }
    const updated = await tx.workout.update({ where: { id }, data });
    await tx.auditLog.create({
      data: {
        actorId,
        subjectId: athlete.id,
        action: body.feedbackStatus ? "workout.feedback" : "workout.update",
        entityId: id,
        before: JSON.stringify(existing),
        after: JSON.stringify(updated),
        note: body.reason ? String(body.reason).slice(0, 1000) : null,
      },
    });
    return updated;
  });
}
