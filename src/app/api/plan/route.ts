import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { analyzeHydration } from "@/lib/adaptive";

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

// PUT /api/plan — update a session within a plan (edit workout) or toggle a day off
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { sessionId, planDayId, dayOff } = body || {};

    // Day-off toggle: picked rest day → 20 min Z1 + breathing replaces sessions
    if (planDayId && dayOff !== undefined) {
      const day = await prisma.planDay.findFirst({ where: { id: planDayId, plan: { userId: user.id } } });
      if (!day) return NextResponse.json({ error: "Plan day not found" }, { status: 404 });
      const updated = await prisma.planDay.update({ where: { id: planDayId }, data: { dayOff: Boolean(dayOff) } });
      return NextResponse.json({ ok: true, planDay: updated });
    }

    const { title, durationMin, intensity, sport, date, completed, notes, preWeightKg, postWeightKg } = body || {};
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
        ...(preWeightKg !== undefined && { preWeightKg: parseFloat(preWeightKg) }),
        ...(postWeightKg !== undefined && { postWeightKg: parseFloat(postWeightKg) }),
      },
    });
    // Pre/post weight → sweat-loss analysis (Casa 2000: >2% = dehydration)
    const w = updated;
    const hydration = w.preWeightKg && w.postWeightKg ? analyzeHydration(w.preWeightKg, w.postWeightKg) : null;
    return NextResponse.json({ ok: true, workout: updated, hydration });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Update failed" }, { status: 500 });
  }
}
