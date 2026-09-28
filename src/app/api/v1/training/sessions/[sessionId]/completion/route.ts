// POST /api/v1/training/sessions/[sessionId]/completion — log the workout.
// Maps to the SAME audited updateWorkout the Today feedback form uses
// (rpe, actual duration, feedbackStatus, note) so one pipeline serves both.
import { NextResponse } from "next/server";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { updateWorkout } from "@/lib/workout-update";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { athlete } = await trainingAccess(req);
    const { sessionId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    const actual = body?.actual || {};
    if (
      actual.durationMinutes != null &&
      !(actual.durationMinutes >= 0 && actual.durationMinutes <= 1440)
    )
      throw new ApiError("durationMinutes must be 0-1440");
    if (actual.sessionRpe != null && !(actual.sessionRpe >= 1 && actual.sessionRpe <= 10))
      throw new ApiError("sessionRpe must be 1-10");
    await updateWorkout(athlete.id, athlete, {
      sessionId,
      rpe: actual.sessionRpe ?? undefined,
      actualDurationMin: actual.durationMinutes ?? undefined,
      feedbackStatus: "completed",
      feedbackNote: actual.comments ?? undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
