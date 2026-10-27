import { ApiError, errorResponse, trainingAccess } from "@/lib/access";
import { prisma } from "@/lib/db";
import { dateKey } from "@/lib/dates";
import { isCurrentWorkout } from "@/lib/calendar-workouts";
import { requireWorkoutRevision, workoutHasHistory } from "@/lib/workout-update";

// A pre-workout observation is not an execution report or a safety clearance.
export async function PUT(req: Request) {
  try {
    const { actor, athlete } = await trainingAccess(req);
    if (actor.id !== athlete.id) throw new ApiError("Only the athlete can record this measurement", 403);
    let body: unknown;
    try { body = await req.json(); } catch { throw new ApiError("Invalid measurement"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("Invalid measurement");
    const input = body as Record<string, unknown>;
    if (Object.keys(input).some(key => !["sessionId", "expectedRevision", "expectedMeasurementRevision", "weightKg"].includes(key))) throw new ApiError("Invalid measurement field");
    if (typeof input.sessionId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.sessionId)) throw new ApiError("Session is required");
    if (input.expectedMeasurementRevision !== null && (typeof input.expectedMeasurementRevision !== "string" || !Number.isFinite(Date.parse(input.expectedMeasurementRevision)))) throw new ApiError("Reload the measurement before saving", 409);
    if (input.weightKg !== null && (typeof input.weightKg !== "number" || !Number.isFinite(input.weightKg) || input.weightKg < 20 || input.weightKg > 350)) throw new ApiError("Invalid weight");
    const now = new Date();
    const measurement = await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${athlete.id}))`;
      const [workout, plan, previous] = await Promise.all([
        tx.workout.findFirst({ where: { id: input.sessionId as string, userId: athlete.id }, include: { planDay: { include: { plan: { select: { id: true, status: true, userId: true } } } } } }),
        tx.trainingPlan.findFirst({ where: { userId: athlete.id, status: "active" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } }),
        tx.preWorkoutWeight.findUnique({ where: { workoutId: input.sessionId as string } }),
      ]);
      if (!workout) throw new ApiError("Session not found", 404);
      if (previous && previous.userId !== athlete.id) throw new ApiError("Measurement ownership needs review", 409);
      requireWorkoutRevision(workout, input.expectedRevision);
      if ((previous?.updatedAt.toISOString() ?? null) !== input.expectedMeasurementRevision) throw new ApiError("Measurement changed. Reload before saving", 409);
      if (!workout.planned || !isCurrentWorkout(workout, athlete.id, plan?.id ?? null) || dateKey(workout.date, athlete.timezone) !== dateKey(now, athlete.timezone)) throw new ApiError("Record this measurement on the current workout day", 409);
      if (input.weightKg !== null && workoutHasHistory(workout)) throw new ApiError("This workout already has results. Review its result instead", 409);
      if (input.weightKg === null) {
        if (previous) await tx.preWorkoutWeight.delete({ where: { id: previous.id } });
        return null;
      }
      if (previous && previous.weightKg === input.weightKg) return previous;
      return tx.preWorkoutWeight.upsert({ where: { workoutId: workout.id }, create: { userId: athlete.id, workoutId: workout.id, weightKg: input.weightKg as number, observedAt: now }, update: { weightKg: input.weightKg as number, observedAt: now } });
    }, { isolationLevel: "Serializable" });
    return Response.json({ ok: true, sessionId: input.sessionId, measurement: measurement ? { weightKg: measurement.weightKg, observedAt: measurement.observedAt.toISOString(), revision: measurement.updatedAt.toISOString(), source: "athlete_reported" } : null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: unknown) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2034") return errorResponse(new ApiError("Another change was saved. Reload and retry", 409));
    return errorResponse(error);
  }
}
