import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { computeJMetrics } from "@/lib/j-metrics";
import { groupActivityEvidence,publicActivityReconciliation } from "@/lib/activity-evidence";
import { readActivityDecisions } from "@/lib/activity-reconciliation";
import { addDaysKey, dateKey, localDate } from "@/lib/dates";
import { computePmc, executionScore } from "@/lib/fitness";

// Owner-only JMetrics and legacy estimates retained for history compatibility.
export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const asOf = new Date();
  const since90 = localDate(addDaysKey(dateKey(asOf, user.timezone), -89), user.timezone);
  const [profile, completed, rest,activityDecisions] = await Promise.all([
    prisma.athleteProfile.findUnique({ where: { userId: user.id } }),
    prisma.workout.findMany({
      where: { userId: user.id, OR: [{ completed: true }, { feedbackStatus: { in: ["completed", "partial", "substituted"] } }], matchedPlanId: null, date: { gte: since90, lte: asOf } },
      orderBy: { date: "asc" },
    }),
    prisma.metricObservation.findMany({
      where: { userId: user.id, metricType: "jmm_rest_day", source: "manual", value: 1, qualityFlag: "ok", measurementMethod: "athlete_reported_rest", observedAt: { gte: since90, lte: asOf } },
      select: { observedAt: true },
    }),
    readActivityDecisions(user.id),
  ]);
  const ftp = profile?.ftp ?? null;
  const lthr = profile?.lthr ?? null;
  const reconciled=groupActivityEvidence(completed,activityDecisions);
  const jMetrics = computeJMetrics(completed, asOf, user.timezone, rest.map(r => dateKey(r.observedAt, user.timezone)),90,activityDecisions);
  const pmc = reconciled.unresolvedGroups?null:computePmc(
    reconciled.effective.filter(w => w.completed).map((w) => ({
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
  const executionEvidence=groupActivityEvidence(completed7,activityDecisions);
  const executionUnavailableReason=executionEvidence.unresolvedGroups?"Possible activity copies need explicit review before execution and duration compliance can be calculated.":null;
  const execution = executionUnavailableReason?null:executionScore(
    planned7.map((w) => ({
      date: w.date,
      sport: w.sport,
      durationMin: w.durationMin,
    })),
    executionEvidence.effective.map((w) => ({
      date: w.date,
      sport: w.sport,
      durationMin: w.actualDurationMin ?? w.durationMin,
    })),
  );

  return NextResponse.json({
    pmc,
    jMetrics,
    activityReconciliation:publicActivityReconciliation(completed,activityDecisions),
    execution,
    executionUnavailableReason,
    goalDistance: profile?.goal ?? null,
    physiology: { ftp, lthr },
  });
}
