import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { estimateTss } from "@/lib/fitness";

// GET /api/admin — admin overview of all athletes (admin role only)
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin" && me.role !== "coach") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const now = new Date();
  const users = await prisma.user.findMany({
    where: { role: { not: "admin" } },
    include: {
      profile: true,
      connectors: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const rows = await Promise.all(users.map(async (u) => {
    // 30-day training volume
    const thirty = new Date(now.getTime() - 30 * 86400000);
    const workouts30 = await prisma.workout.findMany({
      where: { userId: u.id, date: { gte: thirty }, completed: true },
      select: { id: true, date: true, tss: true, durationMin: true, sport: true, avgPower: true, avgHr: true, rpe: true, intensity: true },
    });
    // last workout date
    const lastW = await prisma.workout.findFirst({
      where: { userId: u.id, completed: true },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    // last checkin
    const lastC = await prisma.dailyCheckin.findFirst({
      where: { userId: u.id },
      orderBy: { date: "desc" },
      select: { date: true },
    });
    // benchmarks (first vs latest per type → improvement signal)
    const benchmarks = await prisma.benchmarkTest.findMany({
      where: { userId: u.id, completed: true },
      orderBy: { date: "asc" },
      select: { type: true, result: true, date: true },
    });
    const byType: Record<string, { first?: number; latest?: number; improved?: boolean }> = {};
    for (const b of benchmarks) {
      if (!byType[b.type]) byType[b.type] = {};
      const t = byType[b.type];
      if (t.first === undefined) t.first = b.result || undefined;
      t.latest = b.result || t.latest;
    }
    for (const t of Object.values(byType)) {
      if (t.first !== undefined && t.latest !== undefined) {
        // lower is better for run/swim times; higher for ftp/lthr/cp
        const lowerBetter = ["run5k", "swim"].includes(Object.keys(byType).find(k => byType[k] === t) || "");
        t.improved = lowerBetter ? t.latest < t.first : t.latest > t.first;
      }
    }

    const totalTss30 = workouts30.reduce((s, w) => s + estimateTss({
      durationMin: w.durationMin,
      avgPower: w.avgPower,
      avgHr: w.avgHr,
      rpe: w.rpe,
      intensity: w.intensity,
      tss: w.tss,
      ftp: u.profile?.ftp ?? null,
      lthr: u.profile?.lthr ?? null,
    }), 0);
    const daysSinceLast = lastW ? Math.floor((now.getTime() - lastW.date.getTime()) / 86400000) : null;
    const streak = await prisma.workout.count({ where: { userId: u.id, date: { gte: new Date(now.getTime() - 7 * 86400000) }, completed: true } });

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      avatar: u.avatar,
      language: u.language,
      createdAt: u.createdAt,
      goal: u.profile?.goal || null,
      experience: u.profile?.experience || null,
      ftp: u.profile?.ftp || null,
      vo2max: u.profile?.vo2max || null,
      lastWorkoutDays: daysSinceLast,
      workouts30: workouts30.length,
      totalTss30: Math.round(totalTss30),
      streak7: streak,
      lastCheckinDays: lastC ? Math.floor((now.getTime() - lastC.date.getTime()) / 86400000) : null,
      connectors: u.connectors.map((c) => ({ provider: c.provider, status: c.status })),
      benchmarks: byType,
      benchmarkCount: benchmarks.length,
    };
  }));

  const active = rows.filter((r) => r.lastWorkoutDays !== null && r.lastWorkoutDays <= 7);
  const atRisk = rows.filter((r) => r.lastWorkoutDays === null || r.lastWorkoutDays > 7);

  return NextResponse.json({
    rows,
    summary: {
      total: rows.length,
      active: active.length,
      atRisk: atRisk.length,
      avgTss30: rows.length ? Math.round(rows.reduce((s, r) => s + r.totalTss30, 0) / rows.length) : 0,
      connected: rows.filter((r) => r.connectors.length > 0).length,
    },
  });
}
