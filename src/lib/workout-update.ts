import { invalidateDoubleDay, doubleDayPlan, hasDoubleDayMetadata } from "./double-day";
import { holdStructuredPlanEdit } from "./preserve-sport-structure";
import type { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
import { prisma } from "./db";
import { ApiError } from "./access";
import { dateKey, parseDate, localDate } from "./dates";
import { baseWorkout } from "./prescription";
import { parseActualFueling, readActualFueling } from "./actual-fueling";
import { parseSessionObservations, OBSERVATION_LIMITS } from "./session-observations";

export const WORKOUT_TYPES = ["interval", "tempo", "threshold", "endurance", "recovery", "strength", "skill", "race", "test", "speed", "plyo", "volume", "mobility", "hyrox", "boxing"];
export function validateWorkoutType(value: unknown): string {
  if (typeof value !== "string" || !WORKOUT_TYPES.includes(value)) throw new ApiError("Invalid workout type");
  return value;
}
export function workoutHasHistory(w: Record<string, any>): boolean {
  return Boolean(w.completed || !w.planned || ["feedbackStatus", "feedbackAt", "feedbackNote", "actualDurationMin", "actualSport", "actualDetails", "rpe",
    "avgHr", "maxHr", "avgPower", "np", "distanceKm", "calories", "preWeightKg", "postWeightKg", "externalId", "matchedPlanId"].some(field => w[field] != null));
}
export function workoutRevision(w: Record<string, any>): string {
  const keys = ["id", "date", "title", "sport", "type", "durationMin", "intensity", "startTime", "notes", "planned", "completed", "approved", "originalPlan", "prescription", "feedbackStatus", "actualDurationMin", "actualSport", "actualDetails", "feedbackNote", "feedbackAt", "rpe", "avgHr", "maxHr", "avgPower", "np", "distanceKm", "calories", "preWeightKg", "postWeightKg", "indoor", "planDayId"];
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
  transaction?: Prisma.TransactionClient,
) {
  const id = String(body.sessionId || "");
  if (!id) throw new ApiError("Session is required");
  try { const apply = async (tx: Prisma.TransactionClient) => {
    const existing = await tx.workout.findFirst({
      where: { id, userId: athlete.id },
      include: { planDay: true },
    });
    if (!existing) throw new ApiError("Session not found", 404);
    // Execution reports are observations, not future plans. Apply this at the
    // shared writer so calendar, daily card, chat and coach edits agree.
    const reportsActual = ["completed", "feedbackStatus", "actualDurationMin", "actualSport", "actualDetails", "actualFueling", "rpe", "feedbackNote", "avgHr", "maxHr", "avgPower", "np", "distanceKm", "calories", "preWeightKg", "postWeightKg"].some(key => body[key] !== undefined);
    let observedDate = existing.date;
    if (reportsActual && body.date !== undefined) {
      try { observedDate = parseDate(body.date, athlete.timezone); } catch { throw new ApiError("Invalid session date"); }
    }
    if (reportsActual && dateKey(observedDate, athlete.timezone) > dateKey(new Date(), athlete.timezone))
      throw new ApiError("Future sessions cannot have recorded results. Change the planned session instead, or report work on its actual date.", 409);
    if (body.protectHistory && workoutHasHistory(existing)) throw new ApiError("Recorded sessions and feedback cannot be rewritten by the plan editor.", 409);
    const prescriptionKeys = ["title", "type", "durationMin", "intensity", "sport", "notes", "startTime", "date", "indoor"];
    if(prescriptionKeys.some(key=>body[key]!==undefined) && hasDoubleDayMetadata(existing)&&!doubleDayPlan(existing)) throw new ApiError("Saved pair metadata needs review. Generate a new reviewed plan before editing this session.",409);
    if (prescriptionKeys.some(key => body[key] !== undefined) || body.expectedRevision !== undefined)
      requireWorkoutRevision(existing, body.expectedRevision);
    const data: Record<string, any> = {};
    // Validate optional measurements consistently for Today, daily and calendar.
    const observations: Record<string, number | null> = {};
    for (const key of Object.keys(OBSERVATION_LIMITS)) if (body[key] !== undefined) {
      if (body[key] !== null && typeof body[key] !== 'number' && typeof body[key] !== 'string') throw new ApiError(`Invalid ${key}`);
      observations[key] = body[key] === null || body[key] === '' ? null : Number(body[key]);
    }
    try { Object.assign(data, parseSessionObservations(observations)); } catch (error) { throw new ApiError((error as Error).message); }
    if (body.type !== undefined) data.type = validateWorkoutType(body.type);
    for (const [key, max] of Object.entries({
      durationMin: 1440,
      actualDurationMin: 1440,
      rpe: 10,
      avgHr: 240,
      maxHr: 250,
      avgPower: 2500,
      np: 2500,
      calories: 20000,
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
        (["durationMin", "actualDurationMin", "rpe", "avgHr", "maxHr", "calories"].includes(
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
      if (typeof body.intensity !== "string" || !/^z[1-7]$/.test(body.intensity))
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
    if (body.actualDetails !== undefined || body.actualFueling !== undefined) {
      let details: Record<string, any> = {};
      if (existing.actualDetails != null) {
        try { details = JSON.parse(existing.actualDetails); } catch { throw new ApiError("Saved actual details need review before adding quantities or fueling"); }
        if (!details || typeof details !== "object" || Array.isArray(details) || details.schemaVersion !== 1 || !details.values || typeof details.values !== "object" || Array.isArray(details.values)) throw new ApiError("Saved actual details need review before adding quantities or fueling");
      }
      let values = details.values || {};
      if (body.actualDetails === null) values = {};
      else if (body.actualDetails !== undefined) {
        if (!body.actualDetails || typeof body.actualDetails !== "object" || Array.isArray(body.actualDetails)) throw new ApiError("Invalid reported quantities");
        const limits: Record<string, number> = { distanceKm: 1500, reps: 100000, loadKg: 2000 };
        if (Object.keys(body.actualDetails).some(key => !Object.hasOwn(limits,key))) throw new ApiError("Unknown reported quantity");
        values = {};
        for (const [key, value] of Object.entries(body.actualDetails)) {
          if (value === null) { values[key] = null; continue; }
          if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > limits[key] || (key === "reps" && !Number.isInteger(value))) throw new ApiError(`Invalid actual ${key}`);
          values[key] = value;
        }
      }
      const next: Record<string, unknown> = { ...details, schemaVersion: 1, source: "athlete_report", observedDate: dateKey(existing.date, athlete.timezone), enteredAt: new Date().toISOString(), values };
      if (body.actualFueling !== undefined) {
        let patch;
        try { patch = parseActualFueling(body.actualFueling); } catch (error) { throw new ApiError((error as Error).message); }
        const fueling = patch === null ? null : { schemaVersion:1, carbsG:null,fluidMl:null,giSymptoms:null,...readActualFueling(details),...patch };
        if (fueling && [fueling.carbsG,fueling.fluidMl,fueling.giSymptoms,fueling.urineMl ?? null].some(value=>value!==null)) next.fueling = fueling;
        else delete next.fueling;
      }
      const siblingData = Object.keys(next).some(key => !["schemaVersion","source","observedDate","enteredAt","values"].includes(key));
      data.actualDetails = body.actualDetails === null && !Object.keys(values).length && !siblingData ? null : JSON.stringify(next);
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
    if (["actualDurationMin", "actualSport", "actualDetails", "actualFueling", "rpe", "feedbackNote", ...Object.keys(OBSERVATION_LIMITS)].some(key => body[key] !== undefined))
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
        // Omitted intensity is not permission to adopt the legacy Z2 fallback.
        ...(body.intensity === undefined ? { intensity: existing.intensity } : {}),
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
      data.originalPlan = invalidateDoubleDay(JSON.stringify(base));
      data.prescription = holdStructuredPlanEdit(existing.prescription, base.sport, base.title);
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
  }; return await (transaction ? apply(transaction) : prisma.$transaction(apply, { isolationLevel: "Serializable" })); } catch (error: any) {
    if (error.code === "P2034") throw new ApiError("Another session change was saved. Reload and retry.", 409);
    throw error;
  }
}
