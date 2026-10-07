import { invalidateDoubleDay } from "./double-day";
import type { Prisma } from "@prisma/client";
import { ApiError } from "./access";
import { effectivePrescription } from "./effective-prescription";
import { readPersistedPrescription, replaceSportStructure, structureEditBlockReason, validateStructurePrescription } from "./sport-structure-edit";

type Resolved = NonNullable<Awaited<ReturnType<typeof effectivePrescription>>>;
function readBudget(raw: string | null): number | null {
  try {
    const prescription = readPersistedPrescription(raw);
    const budget = prescription.durationMin === 0 ? prescription.sportStructureBudgetMin : prescription.durationMin;
    return typeof budget === "number" && Number.isFinite(budget) && budget > 0 ? budget : null;
  } catch { return null; }
}
export function structureMetadata(resolved: Resolved) {
  let sportStructure: unknown = null;
  let blocked = structureEditBlockReason(resolved.workout, resolved.canonical.timezone);
  try { sportStructure = readPersistedPrescription(resolved.workout.prescription).sportStructure ?? null; }
  catch (error) { blocked ||= error instanceof Error ? error.message : "The saved prescription cannot be edited."; }
  return { sessionId: resolved.workout.id, sport: resolved.workout.sport, revision: resolved.canonical.revision, sportStructure, declaredBudgetMin: readBudget(resolved.workout.prescription), editable: blocked === null, reason: blocked, verdict: resolved.canonical.verdict, resolutionReason: resolved.canonical.reason };
}

/** Caller must supply an authenticated athlete scope and a Serializable transaction. */
export async function applySportStructureEdit(tx: Prisma.TransactionClient, context: { actorId: string; athleteId: string }, body: { id: string; expectedRevision: string; sportStructure: unknown | null }) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${context.athleteId}))`;
  // Read prescription, check-in, activity, setup and anchors in this transaction.
  const current = await effectivePrescription(context.athleteId, body.id, tx);
  if (!current) throw new ApiError("Workout not found", 404);
  if (body.expectedRevision !== current.canonical.revision) throw new ApiError("This session or its safety/targets changed. Reload the saved structure before editing.", 409);
  const blocked = structureEditBlockReason(current.workout, current.canonical.timezone);
  if (blocked) throw new ApiError(blocked, 409);
  const nextPrescription = replaceSportStructure(current.workout.prescription, current.workout.sport, body.sportStructure);
  validateStructurePrescription(nextPrescription, { athleteId: context.athleteId, workoutId: body.id, sport: current.workout.sport, title: current.workout.title, dateLocal: current.canonical.dateLocal, timezone: current.canonical.timezone });
  const prescription = JSON.stringify(nextPrescription);
  const updated = await tx.workout.updateMany({
    where: { id: body.id, userId: context.athleteId, planned: true, completed: false, prescription: current.workout.prescription, feedbackAt: null, feedbackStatus: null, feedbackNote: null, actualDurationMin: null, actualSport: null, actualDetails: null, rpe: null },
    data: { prescription, approved: false, originalPlan: invalidateDoubleDay(current.workout.originalPlan) },
  });
  if (updated.count !== 1) throw new ApiError("This session changed while saving. Reload before editing.", 409);
  await tx.auditLog.create({ data: { actorId: context.actorId, subjectId: context.athleteId, action: "workout.sportStructure", entityId: body.id, before: current.workout.prescription, after: prescription, note: `${body.sportStructure === null ? "Cleared explicit structure and obsolete executable steps" : "Saved explicit sport structure"}; source revision ${body.expectedRevision}` } });
  const resolved = await effectivePrescription(context.athleteId, body.id, tx);
  if (!resolved) throw new ApiError("The saved session could not be verified.", 409);
  return structureMetadata(resolved);
}
