// POST /api/v1/training/sessions/[sessionId]/focus — focus-ready toggle.
// Persisted in the day's check-in answers (focus.<sessionId>) so it survives
// reloads and rides along with the existing check-in pipeline. Idempotent;
// read-modify-write runs under the user's advisory lock (same pattern as
// activity-store) so concurrent saves can't clobber each other.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { effectivePrescription } from "@/lib/effective-prescription";
import { dayBounds } from "@/lib/dates";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  try {
    const { athlete } = await trainingAccess(req);
    const { sessionId } = await ctx.params;
    const body = await req.json().catch(() => ({}));
    if (typeof body?.ready !== "boolean")
      throw new ApiError("ready must be true or false");
    const resolved = await effectivePrescription(athlete.id, sessionId);
    if (!resolved) throw new ApiError("Session not found", 404);
    if (body.expectedRevision !== resolved.canonical.revision)
      throw new ApiError("This session changed. Refresh before saving focus.", 409);
    if (resolved.canonical.verdict !== "ready") throw new ApiError("Complete the safety check-in before marking training ready.", 409);
    const { start } = dayBounds(athlete.timezone);
    const workout = await prisma.workout.findFirst({
      where: { id: sessionId, userId: athlete.id },
      select: { id: true },
    });
    if (!workout) throw new ApiError("Session not found", 404);
    const ok = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${athlete.id}))`;
      const existing = await tx.dailyCheckin.findUnique({
        where: { userId_date: { userId: athlete.id, date: start } },
        select: { answers: true },
      });
      let answers: any = {};
      try {
        answers = JSON.parse(existing?.answers || "{}");
      } catch {}
      answers.focus = { ...(answers.focus || {}), [sessionId]: body.ready };
      if (existing)
        await tx.dailyCheckin.update({
          where: { userId_date: { userId: athlete.id, date: start } },
          data: { answers: JSON.stringify(answers) },
        });
      else
        await tx.dailyCheckin.create({
          data: { userId: athlete.id, date: start, answers: JSON.stringify(answers) },
        });
      return true;
    });
    return NextResponse.json({ ok, focusReady: body.ready });
  } catch (e) {
    return errorResponse(e);
  }
}
