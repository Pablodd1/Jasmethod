export const dynamic = "force-dynamic";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { updateWorkout, workoutRevision } from "@/lib/workout-update";
import { dayBounds, addDaysKey, localDate } from "@/lib/dates";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { analyzeHydration, progressionAdvice } from "@/lib/adaptive";

// GET /api/plan — list user's plans
export async function GET(req: Request) {
  let user;
  try {
    user = (await trainingAccess(req)).athlete;
  } catch (e) {
    return errorResponse(e);
  }
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const weekOnly = new URL(req.url).searchParams.get("view") === "week";
  const day = dayBounds(user.timezone);
  const plans = await prisma.trainingPlan.findMany({
    where: { userId: user.id, status: "active" },
    include: {
      days: {
        ...(weekOnly
          ? {
              where: {
                date: {
                  gte: localDate(addDaysKey(day.key, -7), user.timezone),
                  lt: localDate(addDaysKey(day.key, 8), user.timezone),
                },
              },
            }
          : {}),
        include: { sessions: true },
        orderBy: { date: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  // Progression oversight: completion % by week for the active plan
  let progression = null;
  const active = plans[0];
  if (active) {
    const byWeek = new Map<
      string,
      { weekStart: Date; planned: number; completed: number }
    >();
    const now = Date.now();
    for (const day of active.days) {
      if (day.date.getTime() > now) continue; // only past/current days count
      const d = new Date(day.date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - d.getDay()); // week starts Sunday
      const key = d.toISOString().slice(0, 10);
      if (!byWeek.has(key))
        byWeek.set(key, { weekStart: d, planned: 0, completed: 0 });
      const wk = byWeek.get(key)!;
      for (const s of day.sessions) {
        wk.planned += 1;
        if (s.completed) wk.completed += 1;
      }
    }
    const weeks = Array.from(byWeek.values()).sort(
      (a, b) => a.weekStart.getTime() - b.weekStart.getTime(),
    );
    progression = progressionAdvice(weeks);
  }

  return NextResponse.json({ plans: plans.map(plan => ({...plan, days: plan.days.map(day => ({...day, sessions: day.sessions.map(w => ({...w, revision: workoutRevision(w)}))}))})), progression });
}

// PUT /api/plan — update a session within a plan (edit workout) or toggle a day off
export async function PUT(req: Request) {
  try {
    const { actor, athlete } = await trainingAccess(req);
    const body = await req.json();
    if (body.planDayId && body.dayOff !== undefined) {
      if (typeof body.dayOff !== "boolean")
        throw new ApiError("Invalid day off");
      const day = await prisma.planDay.findFirst({
        where: { id: body.planDayId, plan: { userId: athlete.id } },
      });
      if (!day) throw new ApiError("Day not found", 404);
      const updated = await prisma.$transaction(async (tx) => {
        const result = await tx.planDay.update({
          where: { id: day.id },
          data: { dayOff: body.dayOff },
        });
        if (body.dayOff) await tx.workout.updateMany({where:{planDayId:day.id,planned:true,completed:false},data:{approved:false}});
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            subjectId: athlete.id,
            action: "day.off",
            entityId: day.id,
            before: JSON.stringify(day),
            after: JSON.stringify(result),
          },
        });
        return result;
      });
      return NextResponse.json({ ok: true, planDay: updated });
    }
    const workout = await updateWorkout(actor.id, athlete, body);
    return NextResponse.json({
      ok: true,
      workout,
      hydration:
        workout.preWeightKg && workout.postWeightKg
          ? analyzeHydration(workout.preWeightKg, workout.postWeightKg)
          : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
