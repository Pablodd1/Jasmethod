import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { computeJMetrics, hasPerformedTraining } from "@/lib/j-metrics";
import { activityActualMinutes,groupActivityEvidence,publicActivityReconciliation } from "@/lib/activity-evidence";
import { readActivityDecisions } from "@/lib/activity-reconciliation";
import { addDaysKey, dateKey, localDate } from "@/lib/dates";
import { computePmc, executionScore } from "@/lib/fitness";
import { derivedActivityPolicy } from "@/lib/derived-activity-policy";

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
      where: { userId: user.id, OR: [{ completed: true }, { feedbackStatus: { in: ["completed", "partial", "substituted"] } }], date: { gte: since90, lte: asOf } },
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
  const policy=derivedActivityPolicy(completed);
  const reconciled=groupActivityEvidence(completed.filter(w=>hasPerformedTraining(w)&&!w.matchedPlanId),activityDecisions);
  const jMetrics = computeJMetrics(completed, asOf, user.timezone, rest.map(r => dateKey(r.observedAt, user.timezone)),90,activityDecisions);
  const missingDurationReason="Actual training duration is missing or invalid; planned minutes are not performed minutes. No extra training capacity is inferred.";
  const pmcUnavailableReason=policy.reason ?? (reconciled.unresolvedGroups ? "Possible activity copies need explicit review before legacy load can be calculated." : reconciled.effective.some(w=>activityActualMinutes(w)===null)?missingDurationReason:null);
  const pmc = pmcUnavailableReason?null:computePmc(
    reconciled.effective.map((w) => ({
      date: w.date,
      tssInput: {
        durationMin: activityActualMinutes(w)!,
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
        OR: [{ completed: true }, { feedbackStatus: { in: ["completed", "partial", "substituted"] } }],
        date: { gte: since7, lte: new Date() },
      },
    }),
  ]);
  const executionPolicy=derivedActivityPolicy([...planned7,...completed7]);
  const executionEvidence=groupActivityEvidence(completed7.filter(w=>hasPerformedTraining(w)&&!w.matchedPlanId),activityDecisions);
  // The legacy matching score treats any matched activity as fully completed.
  // Keep partial/substituted work in load without claiming full execution.
  const executionUnavailableReason=executionPolicy.reason ?? (executionEvidence.unresolvedGroups?"Possible activity copies need explicit review before execution and duration compliance can be calculated.":executionEvidence.effective.some(w=>activityActualMinutes(w)===null)?missingDurationReason:completed7.some(w=>["partial","substituted"].includes(w.feedbackStatus ?? ""))?"Legacy execution scoring cannot represent partial or substituted outcomes. Actual work remains counted in training load; full completion is not inferred.":null);
  const execution = executionUnavailableReason?null:executionScore(
    planned7.map((w) => ({
      date: w.date,
      sport: w.sport,
      durationMin: w.durationMin,
    })),
    executionEvidence.effective.map((w) => ({
      date: w.date,
      sport: w.actualSport ?? w.sport,
      durationMin: activityActualMinutes(w)!,
    })),
  );

  return NextResponse.json({
    pmc,
    pmcUnavailableReason,
    derivedActivityPolicy: { load:policy, execution:executionPolicy },
    jMetrics,
    activityReconciliation:publicActivityReconciliation(completed,activityDecisions),
    execution,
    executionUnavailableReason,
    goalDistance: profile?.goal ?? null,
    physiology: { ftp, lthr },
  });
}
