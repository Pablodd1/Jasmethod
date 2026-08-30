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

    const { title, durationMin, intensity, sport, date, startTime, completed, notes, preWeightKg, postWeightKg, indoor, rpe, avgHr, maxHr, avgPower, np, distanceKm } = body || {};
    if (!sessionId) return NextResponse.json({ error: "sessionId required" }, { status: 400 });

    const existing = await prisma.workout.findFirst({ where: { id: sessionId, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Session not found" }, { status: 404 });

    // When a session is marked done and no RPE/HR was supplied, derive a sensible
    // RPE from intensity so daily load (TSS) is always known — not left empty.
    let resolvedRpe = rpe;
    let resolvedAvgHr = avgHr;
    if (completed === true && (rpe === undefined || rpe === null || rpe === "")) {
      const z = (intensity ?? existing.intensity ?? "z2") as string;
      resolvedRpe = z === "z1" || z === "z2" ? 3 : z === "z3" ? 5 : z === "z4" ? 7 : 9;
    }
    if (completed === true && (avgHr === undefined || avgHr === null || avgHr === "")) {
      const lthr = (await prisma.athleteProfile.findUnique({ where: { userId: user.id } }))?.lthr ?? null;
      if (lthr) {
        const cap = intensity === "z2" ? 0.85 : intensity === "z4" ? 0.95 : 0.9;
        resolvedAvgHr = Math.round(lthr * cap);
      }
    }

    const updated = await prisma.workout.update({
      where: { id: sessionId },
      data: {
        ...(title !== undefined && { title }),
        ...(durationMin !== undefined && { durationMin: parseInt(durationMin, 10) }),
        ...(intensity !== undefined && { intensity }),
        ...(sport !== undefined && { sport }),
        ...(date !== undefined && { date: new Date(date) }),
        // startTime "HH:mm"; explicit null/"" clears it (back to flexible)
        ...(startTime !== undefined && { startTime: startTime === null || startTime === "" ? null : String(startTime) }),
        ...(completed !== undefined && { completed }),
        ...(notes !== undefined && { notes }),
        ...(preWeightKg !== undefined && { preWeightKg: parseFloat(preWeightKg) }),
        ...(postWeightKg !== undefined && { postWeightKg: parseFloat(postWeightKg) }),
        ...(indoor !== undefined && { indoor: Boolean(indoor) }),
        // Post-session data → daily load (TSS) via /api/fitness + /api/race-forecast PMC
        ...(resolvedRpe !== undefined && resolvedRpe !== null && resolvedRpe !== "" && { rpe: parseInt(String(resolvedRpe), 10) }),
        ...(resolvedAvgHr !== undefined && resolvedAvgHr !== null && resolvedAvgHr !== "" && { avgHr: parseInt(String(resolvedAvgHr), 10) }),
        ...(maxHr !== undefined && maxHr !== null && maxHr !== "" && { maxHr: parseInt(String(maxHr), 10) }),
        ...(avgPower !== undefined && avgPower !== null && avgPower !== "" && { avgPower: parseFloat(String(avgPower)) }),
        ...(np !== undefined && np !== null && np !== "" && { np: parseFloat(String(np)) }),
        ...(distanceKm !== undefined && distanceKm !== null && distanceKm !== "" && { distanceKm: parseFloat(String(distanceKm)) }),
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
