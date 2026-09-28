// POST /api/v1/training/sessions/[sessionId]/focus — focus-ready toggle.
// Persisted in the day's check-in answers (focus.<sessionId>) so it survives
// reloads and rides along with the existing check-in pipeline. Idempotent;
// the JSON merge is a single atomic upsert (no read-modify-write race).
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
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
    const { start } = dayBounds(athlete.timezone);
    const workout = await prisma.workout.findFirst({
      where: { id: sessionId, userId: athlete.id },
      select: { id: true },
    });
    if (!workout) throw new ApiError("Session not found", 404);
    await prisma.$executeRaw`
      INSERT INTO "DailyCheckin" ("id", "userId", "date", "answers", "createdAt")
      VALUES (
        replace(cast(gen_random_uuid() as text), '-', ''),
        ${athlete.id},
        ${start},
        ${JSON.stringify({ focus: { [sessionId]: body.ready } })},
        now()
      )
      ON CONFLICT ("userId","date") DO UPDATE SET
        "answers" = jsonb_set(
          COALESCE("DailyCheckin"."answers"::jsonb, '{}'::jsonb),
          ARRAY['focus', ${sessionId}],
          ${JSON.stringify(body.ready)}::jsonb
        )::text
    `;
    return NextResponse.json({ ok: true, focusReady: body.ready });
  } catch (e) {
    return errorResponse(e);
  }
}
