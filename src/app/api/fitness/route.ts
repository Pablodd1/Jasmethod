import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { computeJMetrics } from "@/lib/j-metrics";
import { addDaysKey, dateKey, localDate } from "@/lib/dates";
import { computePmc, executionScore, predictRace } from "@/lib/fitness";

// Owner-only JMetrics and legacy estimates retained for history compatibility.
export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const asOf = new Date();
  const since90 = localDate(addDaysKey(dateKey(asOf, user.timezone), -89), user.timezone);
  const [profile, completed, rest] = await Promise.all([
    prisma.athleteProfile.findUnique({ where: { userId: user.id } }),
    prisma.workout.findMany({
      where: { userId: user.id, OR: [{ completed: true }, { feedbackStatus: { in: ["completed", "partial", "substituted"] } }], matchedPlanId: null, date: { gte: since90, lte: asOf } },
      orderBy: { date: "asc" },
    }),
    prisma.metricObservation.findMany({
      where: { userId: user.id, metricType: "jmm_rest_day", source: "manual", value: 1, qualityFlag: "ok", measurementMethod: "athlete_reported_rest", observedAt: { gte: since90, lte: asOf } },
      select: { observedAt: true },
    }),
  ]);
  const ftp = profile?.ftp ?? null;
  const lthr = profile?.lthr ?? null;
  const jMetrics = computeJMetrics(completed, asOf, user.timezone, rest.map(r => dateKey(r.observedAt, user.timezone)));
  const pmc = computePmc(
    completed.filter(w => w.completed).map((w) => ({
      date: w.date,
      tssInput: {
        durationMin: w.actualDurationMin ?? w.durationMin,
        avgPower: w.np ?? w.avgPower,
        avgHr: w.avgHr,
        rpe: w.rpe,
        intensity: w.intensity,
        tss: w.tss,
        ftp,
        lthr,
      },
    })),
    asOf, user.timezone,
  );

  // Execution score over the last 7 days
  const since7 = new Date(Date.now() - 7 * 86400000);
  const [planned7, completed7] = await Promise.all([
    prisma.workout.findMany({
      where: {
        userId: user.id,
        planned: true,
        date: { gte: since7, lte: new Date() },
      },
    }),
    prisma.workout.findMany({
      where: {
        userId: user.id,
        completed: true,
        matchedPlanId: null,
        date: { gte: since7, lte: new Date() },
      },
    }),
  ]);
  const execution = executionScore(
    planned7.map((w) => ({
      date: w.date,
      sport: w.sport,
      durationMin: w.durationMin,
    })),
    completed7.map((w) => ({
      date: w.date,
      sport: w.sport,
      durationMin: w.actualDurationMin ?? w.durationMin,
    })),
  );

  // Race predictions for every distance (and flag the goal distance)
  const predictions = ["sprint", "olympic", "half", "full"]
    .map((d) =>
      predictRace(
        {
          ftp,
          runPaceBase: profile?.runPaceBase ?? null,
          swimPaceBase: profile?.swimPaceBase ?? null,
        },
        d,
      ),
    )
    .filter(Boolean);

  return NextResponse.json({
    pmc,
    jMetrics,
    execution,
    predictions,
    goalDistance: profile?.goal ?? null,
    physiology: { ftp, lthr },
  });
}
