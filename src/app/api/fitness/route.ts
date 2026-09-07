import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { computePmc, executionScore, predictRace } from "@/lib/fitness";

// GET /api/fitness — PMC (fitness/fatigue/form + ramp), execution score, race prediction
export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.athleteProfile.findUnique({
    where: { userId: user.id },
  });
  const ftp = profile?.ftp ?? null;
  const lthr = profile?.lthr ?? null;

  // Completed workouts for the last 90 days → PMC
  const since90 = new Date(Date.now() - 90 * 86400000);
  const completed = await prisma.workout.findMany({
    where: {
      userId: user.id,
      completed: true,
      matchedPlanId: null,
      date: { gte: since90, lte: new Date() },
    },
    orderBy: { date: "asc" },
  });
  const pmc = computePmc(
    completed.map((w) => ({
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
    execution,
    predictions,
    goalDistance: profile?.goal ?? null,
    physiology: { ftp, lthr },
  });
}
