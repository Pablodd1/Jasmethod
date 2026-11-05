import {workoutRevision} from "@/lib/workout-update";
import {profileRevision} from "@/lib/profile-service";
export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canCoach, canAccessAthlete, ApiError, errorResponse } from "@/lib/access";
import { coachingSummary } from "@/lib/coaching";
import { readActivityDecisions } from "@/lib/activity-reconciliation";
import { addDaysKey, dateKey, dayBounds, localDate } from "@/lib/dates";
import { activityDisclosure, activityAuditDisclosure } from "@/lib/activity-disclosure";
import { computeJMetrics, hasPerformedTraining } from "@/lib/j-metrics";
import { derivedActivityPolicy } from "@/lib/derived-activity-policy";
import { buildCycleBaselineReviews } from "@/lib/cycle-review";
import { readSportHeartRate } from "@/lib/sport-heart-rate";
import { sportEvidence } from "@/lib/sport-evidence";
import { isUnperformedSupersededWorkout } from "@/lib/superseded-workout";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sign in", 401);
    if (!canCoach(actor))
      throw new ApiError("Administrator access required", 403);
    if (actor.role !== "admin" && !(await canAccessAthlete(actor, (await params).id)))
      throw new ApiError("This athlete is not assigned to you", 403);
    const athlete = await prisma.user.findUnique({
      where: { id: (await params).id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        timezone: true,
        language: true,
        avatar: true,
        createdAt: true,
        profile: true,
      },
    });
    if (!athlete) throw new ApiError("Athlete not found", 404);
    const days = Math.max(
      7,
      Math.min(180, Math.floor(Number(new URL(req.url).searchParams.get("days")) || 30)),
    );
    const now = new Date();
    const today = dayBounds(athlete.timezone, now).key;
    const since = localDate(addDaysKey(today, 1 - days), athlete.timezone);
    const until = new Date(now.getTime() + 28 * 86400000);
    const loadDays = Math.min(days, 90);
    const loadStart = localDate(addDaysKey(today, 1 - loadDays), athlete.timezone);
    const [
      workouts,
      metrics,
      checkins,
      races,
      benchmarks,
      blood,
      nutrition,
      sleep,
      connectors,
      audit,
      plan,
      restDays,
      appliedAnchors,
      decisions,
    ] = await Promise.all([
      prisma.workout.findMany({
        where: { userId: athlete.id, date: { gte: since, lte: until } },
        orderBy: { date: "asc" },
        include: { planDay: { select: { dayOff: true } } },
      }),
      prisma.dailyMetrics.findMany({
        where: { userId: athlete.id, date: { gte: since } },
        orderBy: { date: "asc" },
      }),
      prisma.dailyCheckin.findMany({
        where: { userId: athlete.id, date: { gte: since } },
        orderBy: { date: "desc" },
        take: 30,
      }),
      prisma.race.findMany({
        where: { userId: athlete.id },
        orderBy: { date: "desc" },
        take: 20,
      }),
      prisma.benchmarkTest.findMany({
        where: { userId: athlete.id },
        orderBy: { date: "desc" },
        take: 30,
      }),
      prisma.bloodPanel.findMany({
        where: { userId: athlete.id },
        include: { results: true },
        orderBy: { date: "desc" },
        take: 3,
      }),
      prisma.nutritionLog.findMany({
        where: { userId: athlete.id, date: { gte: since } },
        orderBy: { date: "desc" },
        take: 60,
      }),
      prisma.sleepRecord.findMany({
        where: { userId: athlete.id, date: { gte: since } },
        orderBy: { date: "desc" },
      }),
      prisma.connector.findMany({
        where: { userId: athlete.id },
        select: {
          provider: true,
          status: true,
          lastSyncAt: true,
          lastSyncCount: true,
          lastError: true,
        },
      }),
      prisma.auditLog.findMany({
        where: { subjectId: athlete.id },
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.trainingPlan.findFirst({
        where: { userId: athlete.id, status: "active" },
        orderBy: { createdAt: "desc" },
      }),
      prisma.metricObservation.findMany({
        where: { userId: athlete.id, metricType: "jmm_rest_day", source: "manual", value: 1, qualityFlag: "ok",
          measurementMethod: "athlete_reported_rest", observedAt: { gte: loadStart, lte: now } },
        select: { observedAt: true },
      }),
      prisma.auditLog.findMany({
        where: { subjectId: athlete.id, action: "baseline.fromTest" },
        select: { entityId: true },
      }),
      readActivityDecisions(athlete.id),
    ]);
    const disclosed = activityDisclosure(workouts, actor.id, athlete.id);
    const metricView = activityDisclosure(metrics, actor.id, athlete.id);
    const auditView = activityAuditDisclosure(audit, actor.id, athlete.id);
    const performed = workouts.filter(row => row.date >= loadStart && row.date <= now && hasPerformedTraining(row));
    const loadUnavailableReason = activityDisclosure(performed, actor.id, athlete.id).reason
      ?? derivedActivityPolicy(performed).reason;
    const jMetrics = loadUnavailableReason ? null
      : computeJMetrics(performed, now, athlete.timezone, restDays.map(row => dateKey(row.observedAt, athlete.timezone)), loadDays, decisions);
    const observations = !loadUnavailableReason && !jMetrics?.reconciliation?.unresolvedGroups
      ? sportEvidence(performed.filter(row => !row.matchedPlanId), athlete.id, decisions, now).map(({ sport, latest }) => ({ sport, latest }))
      : [];
    const references = buildCycleBaselineReviews({
      profile: athlete.profile, tests: benchmarks, appliedIds: appliedAnchors.flatMap(row => row.entityId ? [row.entityId] : []),
      sports: ["run", "bike", "swim"], now, timezone: athlete.timezone,
    });
    const heartRate = (["run", "bike", "swim", "hyrox"] as const).flatMap(sport =>
      (["lthr", "maxHr"] as const).flatMap(metric => {
        const reference = readSportHeartRate(athlete.profile?.manualPrs, sport, metric, now, athlete.timezone);
        return reference ? [reference] : [];
      }));
    // The summary ignores future and replaced unperformed rows. Disclosure
    // must evaluate the same contributors, including all performed history.
    const analysisRows = workouts.filter(row => row.date <= now && !isUnperformedSupersededWorkout(row));
    const analysisUnavailableReason = activityDisclosure(analysisRows, actor.id, athlete.id).reason ?? metricView.reason;
    return Response.json({
      athlete,
      profileRevision: profileRevision(athlete.profile),
      workouts: disclosed.records.map(w=>({...w, ...(actor.id !== athlete.id ? { insights: null } : {}), revision:workoutRevision(w)})),
      metrics: metricView.records,
      checkins: actor.id !== athlete.id && (disclosed.limited || metricView.limited) ? checkins.map(row=>({ id:row.id,date:row.date,answers:null,adaptation:null,fuel:null,ergos:null,shadowV2:null })) : checkins,
      races,
      benchmarks,
      blood,
      nutrition,
      sleep,
      connectors,
      audit: auditView.records,
      disclosure: { workoutsUnavailableReason: disclosed.reason, metricsUnavailableReason: metricView.reason, auditUnavailableReason: auditView.reason },
      plan,
      days,
      today,
      metricReview: { jMetrics, loadUnavailableReason, references, heartRate, observations },
      analysisUnavailableReason,
      analysis: analysisUnavailableReason ? null : coachingSummary(analysisRows, metrics, athlete.profile, athlete.timezone, now, decisions),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
