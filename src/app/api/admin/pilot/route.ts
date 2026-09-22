import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canCoach } from "@/lib/access";
import { dateKey } from "@/lib/dates";

export const dynamic = "force-dynamic";

// GET /api/admin/pilot — cohort outcome evidence (admin/coach).
// The honest "is this working" feed: adherence, estimated-load trend,
// session-RPE trend, baseline-test deltas, and symptom-day rate across the
// cohort over a window. Software aggregates only — this does NOT prove
// causality, and the response says so. It exists so claims stay measured
// while real athlete outcomes accumulate.
export async function GET(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCoach(me))
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });

  const url = new URL(req.url);
  const days = Math.max(14, Math.min(180, Number(url.searchParams.get("days")) || 30));
  const since = new Date(Date.now() - days * 86400000);

  const athletes = await prisma.user.findMany({
    where: me.role === "coach"
      ? {
          role: "athlete",
          coachedBy: { some: { coachId: me.id, status: "active" } },
        }
      : { role: "athlete" },
    select: { id: true, name: true, avatar: true },
  });
  const ids = athletes.map((a) => a.id);
  if (!ids.length) return NextResponse.json({ ok: true, days, athletes: 0, cohort: null, perAthlete: [] });

  const [workouts, checkins, benchmarks] = await Promise.all([
    prisma.workout.findMany({
      where: { userId: { in: ids }, date: { gte: since } },
      select: {
        userId: true, date: true, planned: true, completed: true,
        durationMin: true, actualDurationMin: true, rpe: true,
        feedbackStatus: true, intensity: true,
      },
    }),
    prisma.dailyCheckin.findMany({
      where: { userId: { in: ids }, date: { gte: since } },
      select: { userId: true, date: true, answers: true },
    }),
    prisma.benchmarkTest.findMany({
      where: { userId: { in: ids }, date: { gte: since }, result: { not: null } },
      orderBy: { date: "asc" },
      select: { userId: true, type: true, date: true, result: true },
    }),
  ]);

  // Adherence: planned sessions fulfilled (completed or matched), per athlete.
  const perAthlete = athletes.map((a) => {
    const w = workouts.filter((x) => x.userId === a.id);
    const planned = w.filter((x) => x.planned);
    const done = planned.filter(
      (x) => x.completed && !["partial", "skipped"].includes(x.feedbackStatus || ""),
    );
    const rpes = w
      .filter((x) => x.rpe != null)
      .map((x) => x.rpe as number);
    const cks = checkins.filter((x) => x.userId === a.id);
    let symptomDays = 0;
    for (const c of cks) {
      try {
        const ans = JSON.parse(c.answers || "{}");
        if (ans.sick || ans.newPain) symptomDays++;
      } catch {}
    }
    // Baseline deltas: first→latest per type within the window
    const byType = new Map<string, number[]>();
    for (const b of benchmarks.filter((b) => b.userId === a.id)) {
      const arr = byType.get(b.type) || [];
      arr.push(b.result as number);
      byType.set(b.type, arr);
    }
    const deltas = Array.from(byType.entries())
      .filter(([, arr]) => arr.length >= 2)
      .map(([type, arr]) => ({
        type,
        first: arr[0],
        latest: arr[arr.length - 1],
        improving: ["run5k", "swim", "run1k"].includes(type)
          ? arr[arr.length - 1] < arr[0]
          : arr[arr.length - 1] > arr[0],
      }));
    return {
      athleteId: a.id,
      athlete: a.name,
      avatar: a.avatar,
      planned: planned.length,
      adherencePct: planned.length ? Math.round((done.length / planned.length) * 100) : null,
      sessionsLogged: w.filter((x) => x.completed).length,
      avgRpe: rpes.length ? +(rpes.reduce((s, r) => s + r, 0) / rpes.length).toFixed(1) : null,
      checkinDays: cks.length,
      symptomDays,
      baselineDeltas: deltas,
    };
  });

  const withAdherence = perAthlete.filter((p) => p.adherencePct != null);
  const cohort = {
    athletes: perAthlete.length,
    avgAdherencePct: withAdherence.length
      ? Math.round(withAdherence.reduce((s, p) => s + (p.adherencePct || 0), 0) / withAdherence.length)
      : null,
    avgRpe: (() => {
      const r = perAthlete.filter((p) => p.avgRpe != null);
      return r.length ? +(r.reduce((s, p) => s + (p.avgRpe || 0), 0) / r.length).toFixed(1) : null;
    })(),
    symptomDayRate: (() => {
      const totalCheckinDays = perAthlete.reduce((s, p) => s + p.checkinDays, 0);
      const totalSymptomDays = perAthlete.reduce((s, p) => s + p.symptomDays, 0);
      return totalCheckinDays
        ? Math.round((totalSymptomDays / totalCheckinDays) * 1000) / 10
        : null;
    })(),
    improvingBaselines: perAthlete.reduce(
      (s, p) => s + p.baselineDeltas.filter((d) => d.improving).length,
      0,
    ),
    trackedBaselines: perAthlete.reduce((s, p) => s + p.baselineDeltas.length, 0),
  };

  return NextResponse.json({
    ok: true,
    days,
    disclaimer:
      "Aggregate of logged training and self-reports. Observational — it does not prove causality or claim superiority over other methods.",
    cohort,
    perAthlete: perAthlete.sort((a, b) => (b.adherencePct ?? -1) - (a.adherencePct ?? -1)),
  });
}
