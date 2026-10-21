import { prisma } from "./db";
import { ApiError } from "./access";
import { dayBounds } from "./dates";
import { effectivePrescription } from "./effective-prescription";
import { EXISTING_REVIEW_VERSION } from "./existing-workout-review";
import { SUBJECTIVE_FIELDS } from "./checkin-safety";

/** A scoped confirmation of unchanged instructions, never a workout generator. */
export async function reviewExistingWorkout(actorId: string, athlete: { id: string; timezone: string }, value: Record<string, unknown>) {
  if (actorId !== athlete.id) throw new ApiError("The athlete must personally confirm current symptoms and time for the short review.", 403);
  if (typeof value.sessionId !== "string" || !value.sessionId || value.sessionId.length > 200 ||
    typeof value.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(value.expectedRevision) ||
    typeof value.contextRevision !== "string" || !/^[a-f0-9]{64}$/.test(value.contextRevision)) throw new ApiError("Reload the selected saved workout before reviewing it.", 409);
  if (value.noSymptoms !== true || value.recoveryUnchanged !== true || value.timeConfirmed !== true || value.confirmed !== true)
    throw new ApiError("Explicitly confirm current symptoms, recovery concerns and the displayed remaining training time. Otherwise use the full check-in.");
  const { start, key } = dayBounds(athlete.timezone);
  return prisma.$transaction(async tx => {
    const resolved = await effectivePrescription(athlete.id, value.sessionId as string, tx);
    if (!resolved) throw new ApiError("Saved session not found", 404);
    const candidate = resolved.existingReview;
    if (resolved.canonical.revision !== value.expectedRevision || candidate.contextRevision !== value.contextRevision)
      throw new ApiError("The session or its context changed. Refresh and review it again.", 409);
    if (!candidate.eligible || candidate.remainingPlanMinutes === null) throw new ApiError(candidate.reason, 422);
    const previous = await tx.dailyCheckin.findUnique({ where: { userId_date: { userId: athlete.id, date: start } } });
    if (resolved.canonical.verdict === "ready") return { ok: true, duplicate: true, sessionId: candidate.sessionId, revision: resolved.canonical.revision };
    const now = new Date().toISOString();
    const answers = {
      ...Object.fromEntries(SUBJECTIVE_FIELDS.map(field => [field, null])),
      sick: false, newPain: false, urgentSymptoms: false, availableMin: candidate.remainingPlanMinutes,
      inputMetadata: { version: EXISTING_REVIEW_VERSION, source: "athlete-confirmed-existing", observedOn: key, recordedAt: now,
        existingReview: { version: EXISTING_REVIEW_VERSION, sessionId: candidate.sessionId, workoutRevision: candidate.workoutRevision,
          contextRevision: candidate.contextRevision, confirmedAt: now, noSymptoms: true, recoveryUnchanged: true,
          timeConfirmed: true, availableMin: candidate.remainingPlanMinutes } },
    };
    const adaptation = { score: 0, scoreAvailable: false, verdict: "easy", durationFactor: 1, intensityCap: "z2", safetyStatus: "clear",
      ruleId: `${EXISTING_REVIEW_VERSION}:scoped`, missingFields: [...SUBJECTIVE_FIELDS],
      message: "Only the selected unchanged easy session was reviewed. Subjective recovery scores remain unknown. This is not medical clearance or permission to add training." };
    const saved = await tx.dailyCheckin.upsert({ where: { userId_date: { userId: athlete.id, date: start } },
      create: { userId: athlete.id, date: start, answers: JSON.stringify(answers), adaptation: JSON.stringify(adaptation) },
      update: { answers: JSON.stringify(answers), adaptation: JSON.stringify(adaptation), shadowV2: null } });
    await tx.workout.updateMany({ where: { id: candidate.sessionId, userId: athlete.id, planned: true, completed: false }, data: { approved: false } });
    const fresh = await effectivePrescription(athlete.id, candidate.sessionId, tx);
    if (!fresh || fresh.canonical.verdict !== "ready") throw new ApiError(fresh?.canonical.reason || "The current safety context requires the full check-in.", 422);
    await tx.auditLog.create({ data: { actorId, subjectId: athlete.id, action: "checkin.review-existing", entityId: saved.id,
      before: previous ? JSON.stringify(previous) : null,
      after: JSON.stringify({ answers, adaptation, sessionId: candidate.sessionId, revision: fresh.canonical.revision, instructionsChanged: false }) } });
    return { ok: true, duplicate: false, sessionId: candidate.sessionId, revision: fresh.canonical.revision };
  }, { isolationLevel: "Serializable" });
}
