// POST /api/v1/training/sessions/[sessionId]/completion — log the workout.
// Maps to the SAME audited updateWorkout the Today feedback form uses
// (rpe, actual duration, feedbackStatus, note) so one pipeline serves both.
import { NextResponse } from "next/server";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { effectivePrescription } from "@/lib/effective-prescription";
import { updateWorkout, workoutRevision } from "@/lib/workout-update";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { actor, athlete } = await trainingAccess(req);
    const { sessionId } = await ctx.params;
    // Typed validation (Codex P2): malformed JSON is a 400, not an empty
    // completion; a request without any actual fields does not fabricate one.
    let body: any;
    try {
      body = await req.json();
    } catch {
      throw new ApiError("Invalid JSON body");
    }
    const actual = body?.actual;
    if (!actual || typeof actual !== "object" || Array.isArray(actual) ||
        !["completed", "partial", "substituted", "skipped", "unknown"].includes(actual.status))
      throw new ApiError("Choose an explicit session outcome");
    if (actual.durationMinutes != null && (!Number.isInteger(actual.durationMinutes) || actual.durationMinutes < 0 || actual.durationMinutes > 1440))
      throw new ApiError("durationMinutes must be a whole number from 0 to 1440");
    if (actual.sessionRpe != null && (!Number.isInteger(actual.sessionRpe) || actual.sessionRpe < 1 || actual.sessionRpe > 10))
      throw new ApiError("sessionRpe must be a whole number from 1 to 10");
    if (actual.comments != null && (typeof actual.comments !== "string" || actual.comments.length > 1000))
      throw new ApiError("comments must be text of at most 1000 characters");
    const resolved = await effectivePrescription(athlete.id, sessionId);
    if (!resolved) throw new ApiError("Session not found", 404);
    if (body.expectedRevision !== resolved.canonical.revision)
      throw new ApiError("This session changed. Refresh the plan before saving feedback.", 409);
    await updateWorkout(actor.id, athlete, {
      sessionId,
      expectedRevision: workoutRevision(resolved.workout),
      actualSport: actual.actualSport ?? null,
      actualDetails: actual.actualDetails,
      rpe: actual.sessionRpe ?? null,
      actualDurationMin: actual.durationMinutes ?? null,
      feedbackStatus: actual.status,
      feedbackNote: actual.comments ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
