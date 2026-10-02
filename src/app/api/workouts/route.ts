import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { parseManualWorkout } from "@/lib/manual-workout";

export async function GET(req: Request) {
  try {
    const { athlete } = await trainingAccess(req);
    const days = Number(new URL(req.url).searchParams.get("days") || "14");
    if (!Number.isInteger(days) || days < 1 || days > 90) throw new ApiError("days must be 1–90");
    const workouts = await prisma.workout.findMany({ where: { userId: athlete.id, date: { gte: new Date(Date.now() - days * 86400000) } }, orderBy: { date: "asc" } });
    return NextResponse.json({ workouts });
  } catch (error) { return errorResponse(error); }
}

// Log only what the athlete explicitly reports. No synthetic sport, minutes,
// biometrics, recovery prescription or provider side effects.
export async function POST(req: Request) {
  try {
    const { actor, athlete } = await trainingAccess(req);
    const body = await req.json().catch(() => { throw new ApiError("Invalid JSON"); });
    let parsed;
    try { parsed = parseManualWorkout(body, athlete.timezone); } catch (error) { throw new ApiError(error instanceof Error ? error.message : "Invalid activity"); }
    const workout = await prisma.$transaction(async (tx) => {
      const created = await tx.workout.create({ data: { userId: athlete.id, ...parsed } });
      await tx.auditLog.create({ data: { actorId: actor.id, subjectId: athlete.id, action: "activity.manual-report", entityId: created.id, after: JSON.stringify(parsed) } });
      return created;
    });
    return NextResponse.json({ ok: true, workout }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
