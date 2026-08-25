import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/plan — list user's plans
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const plans = await prisma.trainingPlan.findMany({
    where: { userId: user.id },
    include: { days: { include: { sessions: true }, orderBy: { date: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return NextResponse.json({ plans });
}

// PUT /api/plan — update a session within a plan (edit workout)
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { sessionId, title, durationMin, intensity, sport, date, completed, notes } = body || {};
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

    const existing = await prisma.workout.findFirst({ where: { id: sessionId, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    const updated = await prisma.workout.update({
      where: { id: sessionId },
      data: {
        ...(title !== undefined && { title }),
        ...(durationMin !== undefined && { durationMin: parseInt(durationMin, 10) }),
        ...(intensity !== undefined && { intensity }),
        ...(sport !== undefined && { sport }),
        ...(date !== undefined && { date: new Date(date) }),
        ...(completed !== undefined && { completed }),
        ...(notes !== undefined && { notes }),
      },
    });
    return NextResponse.json({ ok: true, workout: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Update failed" }, { status: 500 });
  }
}
