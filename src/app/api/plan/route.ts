import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { analyzeHydration, progressionAdvice } from "@/lib/adaptive";

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

  // Progression oversight: completion % by week for the active plan
  let progression = null;
  const active = plans[0];
  if (active) {
    const byWeek = new Map<string, { weekStart: Date; planned: number; completed: number }>();
    const now = Date.now();
    for (const day of active.days) {
      if (day.date.getTime() > now) continue; // only past/current days count
      const d = new Date(day.date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - d.getDay()); // week starts Sunday
      const key = d.toISOString().slice(0, 10);
      if (!byWeek.has(key)) byWeek.set(key, { weekStart: d, planned: 0, completed: 0 });
      const wk = byWeek.get(key)!;
      for (const s of day.sessions) {
        wk.planned += 1;
        if (s.completed) wk.completed += 1;
      }
    }
    const weeks = Array.from(byWeek.values()).sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());
    progression = progressionAdvice(weeks);
  }

  return NextResponse.json({ plans, progression });
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

    const { title, durationMin, intensity, sport, date, completed, notes, preWeightKg, postWeightKg, indoor } = body || {};
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
        ...(indoor !== undefined && { indoor: Boolean(indoor) }),
      },
    });
    // Moving a workout also moves its plan day, so the calendar stays in sync.
    if (date !== undefined && updated.planDayId) {
      await prisma.planDay.update({ where: { id: updated.planDayId }, data: { date: new Date(date) } });
    }
    // Pre/post weight → sweat-loss analysis (Casa 2000: >2% = dehydration)
    const w = updated;
    const hydration = w.preWeightKg && w.postWeightKg ? analyzeHydration(w.preWeightKg, w.postWeightKg) : null;
    return NextResponse.json({ ok: true, workout: updated, hydration });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Update failed" }, { status: 500 });
  }
}
