import { createHash } from "node:crypto";
import { prisma } from "./db";
import { ApiError } from "./access";
import { dateKey, parseDate, localDate } from "./dates";
import { baseWorkout } from "./prescription";

export const WORKOUT_TYPES = ["interval", "tempo", "threshold", "endurance", "recovery", "strength", "skill", "race", "test", "speed", "plyo", "volume", "mobility", "hyrox", "boxing"];
export function validateWorkoutType(value: unknown): string {
  if (typeof value !== "string" || !WORKOUT_TYPES.includes(value)) throw new ApiError("Invalid workout type");
  return value;
}
export function workoutHasHistory(w: Record<string, any>): boolean {
  return Boolean(w.completed || !w.planned || w.feedbackStatus || w.feedbackAt || w.feedbackNote ||
    w.actualDurationMin != null || w.actualSport || w.actualDetails || w.rpe != null || w.avgHr != null || w.avgPower != null ||
    w.externalId || w.matchedPlanId);
}
export function workoutRevision(w: Record<string, any>): string {
  const keys = ["id", "date", "title", "sport", "type", "durationMin", "intensity", "startTime", "notes", "planned", "completed", "approved", "originalPlan", "prescription", "feedbackStatus", "actualDurationMin", "actualSport", "actualDetails", "feedbackNote", "feedbackAt", "rpe", "avgHr", "maxHr", "avgPower", "np", "distanceKm", "preWeightKg", "postWeightKg", "indoor", "planDayId"];
  return createHash("sha256").update(JSON.stringify(keys.map(key => w[key] ?? null))).digest("hex");
}
export function requireWorkoutRevision(w: Record<string, any>, revision: unknown) {
  if (typeof revision !== "string" || revision !== workoutRevision(w))
    throw new ApiError("This session changed or its version is missing. Reload before editing.", 409);
}

export async function updateWorkout(
  actorId: string,
  athlete: { id: string; timezone: string },
  body: any,
) {
  const id = String(body.sessionId || "");
  if (!id) throw new ApiError("Session is required");
  try { return await prisma.$transaction(async (tx) => {
    const existing = await tx.workout.findFirst({
      where: { id, userId: athlete.id },
      include: { planDay: true },
    });
    if (!existing) throw new ApiError("Session not found", 404);
    if (body.protectHistory && workoutHasHistory(existing)) throw new ApiError("Recorded sessions and feedback cannot be rewritten by the plan editor.", 409);
    const prescriptionKeys = ["title", "type", "durationMin", "intensity", "sport", "notes", "startTime", "date", "indoor"];
    if (prescriptionKeys.some(key => body[key] !== undefined) || body.expectedRevision !== undefined)
      requireWorkoutRevision(existing, body.expectedRevision);
    const data: Record<string, any> = {};
    if (body.type !== undefined) data.type = validateWorkoutType(body.type);
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
        n < (key === "rpe" ? 1 : 0) ||
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
        if (key === "completed") data.feedbackAt = new Date();
      }
    if (body.startTime !== undefined) {
      if (body.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.startTime))
        throw new ApiError("Invalid time");
      data.startTime = body.startTime || null;
    }
    if (body.actualSport !== undefined) {
      if (body.actualSport === null || body.actualSport === "") data.actualSport = null;
      else if (["run", "bike", "swim", "strength", "mobility", "recovery", "brick", "hyrox", "boxing", "other"].includes(body.actualSport)) data.actualSport = body.actualSport;
      else throw new ApiError("Invalid actual sport");
    }
    if (body.actualDetails !== undefined) {
      if (body.actualDetails === null) data.actualDetails = null;
      else {
        if (!body.actualDetails || typeof body.actualDetails !== "object" || Array.isArray(body.actualDetails)) throw new ApiError("Invalid reported quantities");
        const limits: Record<string, number> = { distanceKm: 1500, reps: 100000, loadKg: 2000 };
        if (Object.keys(body.actualDetails).some(key => !(key in limits))) throw new ApiError("Unknown reported quantity");
        const values: Record<string, number | null> = {};
        for (const [key, value] of Object.entries(body.actualDetails)) {
          if (value === null) { values[key] = null; continue; }
          if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > limits[key] || (key === "reps" && !Number.isInteger(value))) throw new ApiError(`Invalid actual ${key}`);
          values[key] = value;
        }
        data.actualDetails = JSON.stringify({ schemaVersion: 1, source: "athlete_report", observedDate: dateKey(existing.date, athlete.timezone), enteredAt: new Date().toISOString(), values });
      }
    }
    if (body.feedbackStatus !== undefined) {
      if (!["completed", "partial", "substituted", "skipped", "unknown"].includes(body.feedbackStatus))
        throw new ApiError("Invalid workout outcome");
      data.feedbackStatus = body.feedbackStatus;
      data.feedbackAt = new Date();
      data.completed = body.feedbackStatus === "completed";
      // Status is not a duration report. A partial or skipped prescription
      // says nothing about other activity; never substitute planned minutes.
      // Explicit null clears an old value; omitted fields retain prior reports.
    }
    // Corrections are new observations for the next safety/load assessment,
    // even when the athlete keeps the same outcome or clears a prior value.
    if (["actualDurationMin", "actualSport", "actualDetails", "rpe", "feedbackNote"].some(key => body[key] !== undefined))
      data.feedbackAt = new Date();
    if (body.date !== undefined) {
      try { data.date = parseDate(body.date, athlete.timezone); } catch { throw new ApiError("Invalid session date"); }
      if (data.date.getTime() !== existing.date.getTime()) data.approved = false;
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
        if (day.dayOff && (data.sport || existing.sport) !== "recovery") throw new ApiError("The destination is a rest day. Change its setting before moving training.", 409);
        data.planDayId = day.id;
      }
    }
    const changesPlan = prescriptionKeys.some(key => data[key] !== undefined &&
      (key === "date" ? data.date.getTime() !== existing.date.getTime() : data[key] !== existing[key as keyof typeof existing]));
    if (changesPlan && workoutHasHistory(existing))
      throw new ApiError("Recorded sessions and feedback cannot be rewritten. Record corrections as feedback instead.", 409);
    const prescriptionFields = [
      "title",
      "type",
      "durationMin",
      "intensity",
      "sport",
      "notes",
      "startTime",
      "indoor",
    ];
    const changedPrescriptionFields = prescriptionFields.filter(
      (key) =>
        data[key] !== undefined &&
        data[key] !== existing[key as keyof typeof existing],
    );
    if (changedPrescriptionFields.length) {
      // An explicit edit establishes a new base; measured results stay separate.
      const base = {
        ...baseWorkout(existing),
        ...Object.fromEntries(
          changedPrescriptionFields.map((k) => [
            k === "notes" ? "description" : k,
            data[k],
          ]),
        ),
      };
      // A free-form prescription edit supersedes the selected protocol. A
      // title/time edit alone retains its exact set and recovery structure.
      if (
        base.protocol &&
        ["durationMin", "intensity", "sport", "notes", "type"].some((key) =>
          changedPrescriptionFields.includes(key),
        )
      ) {
        delete base.protocol;
        base.type = data.type ?? (["strength", "mobility", "hyrox", "boxing"].includes(
          base.sport,
        )
          ? base.sport
          : base.intensity === "z1"
            ? "recovery"
            : base.intensity === "z2"
              ? "endurance"
              : "interval");
      }
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
  }, { isolationLevel: "Serializable" }); } catch (error: any) {
    if (error.code === "P2034") throw new ApiError("Another session change was saved. Reload and retry.", 409);
    throw error;
  }
}
