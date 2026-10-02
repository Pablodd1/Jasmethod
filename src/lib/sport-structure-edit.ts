import { dateKey } from "./dates";
import { canonicalSession } from "./canonical-session";
import { normalizeSportStructure } from "./sport-structure";

export const MAX_STRUCTURE_REQUEST_BYTES = 64 * 1024;
export const STRUCTURED_SPORTS = ["swim", "strength", "hyrox", "brick"] as const;

export class StructureEditError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Bound the streamed body too; Content-Length can be missing or inaccurate. */
export async function readStructureEditBody(request: Request): Promise<string> {
  if (!request.body) throw new StructureEditError("Send structured workout JSON.", 400);
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_STRUCTURE_REQUEST_BYTES) {
        await reader.cancel();
        throw new StructureEditError("Structured workout JSON is too large (maximum 64 KiB).", 413);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch (error) {
    if (error instanceof StructureEditError) throw error;
    throw new StructureEditError("The request body could not be read as UTF-8 JSON.", 400);
  } finally { reader.releaseLock(); }
}

export function parseStructureEditRequest(text: string): { id: string; expectedRevision: string; sportStructure: unknown | null } {
  if (new TextEncoder().encode(text).length > MAX_STRUCTURE_REQUEST_BYTES) throw new StructureEditError("Structured workout JSON is too large (maximum 64 KiB).", 413);
  let body: unknown;
  try { body = JSON.parse(text); } catch { throw new StructureEditError("Invalid JSON. Check quotes, commas and brackets.", 400); }
  if (!object(body)) throw new StructureEditError("Send one structured workout object.", 400);
  if (Object.keys(body).some(key => !["id", "expectedRevision", "sportStructure"].includes(key))) throw new StructureEditError("Only id, expectedRevision and sportStructure may be edited here.", 400);
  if (typeof body.id !== "string" || !body.id.trim() || body.id.length > 200) throw new StructureEditError("Select the session to edit.", 400);
  if (typeof body.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(body.expectedRevision)) throw new StructureEditError("Reload the session before editing: a current revision is required.", 409);
  if (!Object.prototype.hasOwnProperty.call(body, "sportStructure") || (body.sportStructure !== null && !object(body.sportStructure))) throw new StructureEditError("sportStructure must be an object, or null to clear it.", 400);
  return { id: body.id, expectedRevision: body.expectedRevision, sportStructure: body.sportStructure };
}

export interface StructureEditableWorkout {
  date: Date | string; sport: string; planned: boolean; completed: boolean;
  feedbackAt?: Date | string | null; feedbackStatus?: string | null; feedbackNote?: string | null;
  actualDurationMin?: number | null; actualSport?: string | null; actualDetails?: string | null; rpe?: number | null;
  avgHr?: number | null; maxHr?: number | null; avgPower?: number | null; np?: number | null;
  preWeightKg?: number | null; postWeightKg?: number | null; externalId?: string | null; matchedPlanId?: string | null;
  planDay?: { dayOff: boolean } | null;
}
export function structureEditBlockReason(workout: StructureEditableWorkout, timezone: string, now = new Date()): string | null {
  if (!STRUCTURED_SPORTS.includes(workout.sport as typeof STRUCTURED_SPORTS[number])) return "Structured sport editing is available for pool swim, strength, HYROX and brick sessions.";
  if (!workout.planned) return "Recorded activities cannot be changed into a planned workout.";
  if (dateKey(new Date(workout.date), timezone) < dateKey(now, timezone)) return "Past sessions are read-only. Edit a current or future planned workout instead.";
  if (workout.completed || workout.feedbackAt != null || workout.feedbackStatus != null || workout.feedbackNote != null || workout.actualDurationMin != null || workout.actualSport != null || workout.actualDetails != null || workout.rpe != null || workout.avgHr != null || workout.maxHr != null || workout.avgPower != null || workout.np != null || workout.preWeightKg != null || workout.postWeightKg != null || workout.externalId != null || workout.matchedPlanId != null) return "Sessions with recorded activity or feedback are read-only. Their training history is preserved.";
  if (workout.planDay?.dayOff) return "This is a rest day. Review the plan before adding training.";
  return null;
}

export function readPersistedPrescription(raw: string | null): Record<string, unknown> {
  let value: unknown;
  try { value = raw == null ? null : JSON.parse(raw); } catch { throw new StructureEditError("The saved prescription is malformed. Recalculate it through check-in before editing.", 409); }
  if (!object(value)) throw new StructureEditError("No valid saved prescription is available. Complete check-in before editing.", 409);
  return value;
}

export function replaceSportStructure(raw: string | null, sport: string, structure: unknown | null): Record<string, unknown> {
  const next = { ...readPersistedPrescription(raw) };
  if (structure === null) {
    delete next.sportStructure;
    delete next.sportStructureBudgetMin;
    delete next.structureReviewRequired;
    // Old generic steps may have been superseded by explicit structured data.
    // Clearing must never silently reactivate that older executable workout.
    next.steps = [];
  } else {
    try { next.sportStructure = normalizeSportStructure(structure, sport); }
    catch (error) { throw new StructureEditError(error instanceof Error ? error.message : "Invalid structured sport fields."); }
    const budget = next.durationMin === 0 ? next.sportStructureBudgetMin : next.durationMin;
    if (typeof budget !== "number" || !Number.isFinite(budget) || budget <= 0 || budget > 1440) throw new StructureEditError("A reviewed positive duration is required before applying structure. Recalculate the session through check-in first.", 409);
    next.sportStructureBudgetMin = budget;
    delete next.structureReviewRequired;
  }
  return next;
}

/** Shape check only: these hypothetical admission fields are never persisted. */
export function validateStructurePrescription(prescription: Record<string, unknown>, context: { athleteId: string; workoutId: string; sport: string; title: string; dateLocal: string; timezone: string }): void {
  if (prescription.sportStructure == null) return;
  const budget = prescription.sportStructureBudgetMin;
  const candidate = canonicalSession({
    athleteId: context.athleteId,
    workout: { id: context.workoutId, userId: context.athleteId, sport: context.sport, title: context.title, durationMin: budget },
    prescription: { ...prescription, durationMin: budget, verdict: "full" },
    dateLocal: context.dateLocal, timezone: context.timezone,
  });
  if (candidate.verdict !== "ready") throw new StructureEditError(candidate.reason);
}
