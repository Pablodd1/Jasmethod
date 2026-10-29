import { unitsOf } from "@/lib/units";
import { savedCycleSummary } from "@/lib/training-cycle";
import { dailyRecoveryContext } from "@/lib/daily-recovery";
import { workoutJStress, hasPerformedTraining } from "@/lib/j-metrics";
import { SessionResolutionError } from "@/lib/canonical-session";
import { readIntervalsReceipt } from "@/lib/intervals-delivery";
import {personalizedDailyMotivation} from "@/lib/reference";
import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { dayBounds, dateKey, addDaysKey } from "@/lib/dates";
import { estimateIf, estimateDistanceKm } from "@/lib/prescription";
import { estimateTss } from "@/lib/fitness";
import {
  fuelCurveReference,
} from "@/lib/fueling";
import { effectivePrescription } from "@/lib/effective-prescription";
import { intervalsConnectorEnabled, trainingCapabilities } from "@/lib/capabilities";
import { baseWorkout } from "@/lib/prescription";
import { athleteDayReview } from "@/lib/athlete-day-review";
import { readPlanningSetup } from "@/lib/planning-setup-store";
import { readActivityDecisions } from "@/lib/activity-reconciliation";
import { workoutRevision } from '@/lib/workout-update';
import { currentOrReportedWorkoutWhere, currentWorkoutWhere, isCurrentWorkout } from '@/lib/calendar-workouts';
import { readDailyInputContext } from '@/lib/daily-input-context';
import { readTrainingWeekReview } from '@/lib/training-week-store';
import { trainingViewDisclosureAllowed, ACTIVITY_DISCLOSURE_REASON } from '@/lib/activity-disclosure';
import { readVerifiedActivityReport } from '@/lib/activity-report-envelope';
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const { actor, athlete: user } = await trainingAccess(req);
    const { start, end, key } = dayBounds(user.timezone);
    const currentPlan = await prisma.trainingPlan.findFirst({ where: { userId: user.id, status: "active" }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id:true, name:true, startDate:true, weeks:true, raceDate:true } });
    // A cheap read displays saved instructions while richer context resolves.
    // It neither creates training nor grants execution/export permission.
    if (new URL(req.url).searchParams.get("view") === "plan") {
      const saved = await prisma.workout.findMany({ where: { AND: [currentWorkoutWhere(user.id, currentPlan?.id ?? null)], planned: true, date: { gte: start, lt: end } },
        orderBy: [{ startTime: "asc" }, { createdAt: "asc" }], take: 30,
        select: { id: true, title: true, sport: true, durationMin: true, startTime: true, completed: true, feedbackStatus: true, source: true, externalId: true, notes: true } });
      if (!trainingViewDisclosureAllowed(actor.id, user.id, saved)) throw new ApiError(ACTIVITY_DISCLOSURE_REASON, 403);
      return Response.json({ kind: "saved_today_plan", date: key, timezone: user.timezone, sessions: saved.map(({source,externalId,notes,...session})=>session), readOnly: true }, { headers: { "Cache-Control": "private, no-store" } });
    }
  const [allWorkouts, race, connectors, checkin, restDay, activePlan, eventToday, setupState, activityDecisions, preWeights] = await Promise.all([
    prisma.workout.findMany({
      where: {
        AND: [currentOrReportedWorkoutWhere(user.id, currentPlan?.id ?? null)],
        date: { gte: start, lt: end },
      },
      include: { planDay: { select: { notes: true, dayOff: true, plan: { select: { id: true, status: true, userId: true } } } } },
      orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
    }),
    prisma.race.findFirst({
      where: { userId: user.id, date: { gte: new Date(`${dateKey(start,user.timezone)}T00:00:00Z`) } },
      orderBy: [{ priority: "asc" }, { date: "asc" }],
    }),
    prisma.connector.findMany({
      where: { userId: user.id },
      select: {
        provider: true,
        status: true,
        lastSyncAt: true,
        lastSyncCount: true,
        lastError: true,
      },
    }),
    prisma.dailyCheckin.findUnique({
      where: { userId_date: { userId: user.id, date: start } },
    }),
    currentPlan ? prisma.planDay.findFirst({ where: { planId: currentPlan.id, plan: { userId: user.id, status: "active" }, date: { gte: start, lt: end }, OR:[{dayOff:true},{focus:"event"}] }, select: { id: true, dayOff:true, focus:true } }) : Promise.resolve(null),
    Promise.resolve(currentPlan),
    prisma.race.findFirst({where:{userId:user.id,date:{gte:new Date(`${key}T00:00:00Z`),lt:new Date(`${addDaysKey(key,1)}T00:00:00Z`)}},select:{id:true}}),
    readPlanningSetup(user.id),
    readActivityDecisions(user.id),
    actor.id === user.id ? prisma.preWorkoutWeight.findMany({ where: { userId: user.id, workoutId: { not: null }, observedAt: { gte: start, lt: end } }, select: { workoutId: true, weightKg: true, observedAt: true, updatedAt: true } }) : Promise.resolve([]),
  ]);
  const preWeightFor = (id: string) => {
    const row = preWeights.find(item => item.workoutId === id);
    return row ? { weightKg: row.weightKg, observedAt: row.observedAt.toISOString(), revision: row.updatedAt.toISOString(), source: "athlete_reported" } : null;
  };

  const workouts = allWorkouts.filter(w => w.planned && isCurrentWorkout(w, user.id, currentPlan?.id ?? null));

  // KCoach Activity Reports — narratives generated at sync time (last 7 days,
  // newest first) for the Today page report card.
  const reported = await prisma.workout.findMany({
    where: {
      userId: user.id,
      planned: false,
      completed: true,
      insights: { not: null },
      date: { gte: new Date(start.getTime() - 7 * 86400000) },
    },
    orderBy: { date: "desc" },
    take: 5,
    select: { id: true, date: true, title: true, sport: true, insights: true, source: true, externalId: true, notes: true },
  });

    // GET is read-only. Missing plans require explicit setup/plan creation.
    const todaysWorkouts = workouts;
    const resolvedWorkouts = await Promise.all(todaysWorkouts.map(async w => {
      try { return await effectivePrescription(user.id, w.id); }
      catch (error) {
        if (error instanceof SessionResolutionError) return { resolutionError: error.message };
        throw error;
      }
    }));
    const sessions = todaysWorkouts.flatMap<any>((w, index) => {
      const resolved = resolvedWorkouts[index];
      if (!resolved) return [];
      if ("resolutionError" in resolved) return [{
        id: w.id, feedbackRevision: workoutRevision(w), preWorkoutWeight: preWeightFor(w.id), title: w.title || "Session needs review", sport: w.sport, type: w.type,
        revision: null, verdict: "blocked", resolutionReason: resolved.resolutionError,
        capability: { available: false, mode: "unavailable", reason: resolved.resolutionError, deviceTested: false },
        matchedPlanId: w.matchedPlanId,
        jStress: workoutJStress(w),
        durationMin: 0, durationIsEstimate: false, intensity: null, tss: null, if: null, distanceKm: null,
        startTime: w.startTime, completed: w.completed, feedbackStatus: w.feedbackStatus,
        actualDurationMin: w.actualDurationMin, actualSport: w.actualSport, actualDetails: w.actualDetails, feedbackNote: w.feedbackNote, rpe: w.rpe, avgHr: w.avgHr, avgPower: w.avgPower, calories: w.calories, preWeightKg: w.preWeightKg, postWeightKg: w.postWeightKg, regenCount: w.regenCount, approved: w.approved,
        dayOff: !!w.planDay?.dayOff, prescription: { steps: [], targets: {}, verdict: "rest", detail: {}, scaled: { reason: resolved.resolutionError, originalMin: w.durationMin } },
        fuel: null, fuelCurve: [], post: null, coachNotes: null,
      }];
      const { prescription: p, canonical, targetProfile } = resolved;
      const fuel = resolved.nutrition?.fuel ?? null;
      const post = resolved.nutrition?.post ?? null;
      // Legacy estimates retained for API compatibility; actual JStress is separate.
      const tss = estimateTss({
        durationMin: p.durationMin,
        intensity: p.intensity || undefined,
        ftp: targetProfile?.ftp || undefined,
        lthr: targetProfile?.lthr || undefined,
      });
      const ifFactor = estimateIf(p.intensity || "z2", tss, p.durationMin);
      const distanceSteps = canonical.steps.filter(step => step.endpoint.type === "distance");
      const distanceKm = distanceSteps.length
        ? distanceSteps.reduce((sum, step) => sum + (step.endpoint.type === "distance" ? step.endpoint.meters : 0), 0) / 1000
        : canonical.sport === "run" && targetProfile?.runPaceBase
          ? estimateDistanceKm(canonical.sport, p.intensity, canonical.durationMin, targetProfile)
          : null;
      return {
        id: w.id,
        feedbackRevision: workoutRevision(w), preWorkoutWeight: preWeightFor(w.id),
        revision: canonical.revision,
        existingReview: resolved.existingReview,
        plannedDurationMin: w.durationMin,
        environment: canonical.environment,
        intervalsPublication: w.deliveryProvider === "intervals" ? (() => {
          const receipt = readIntervalsReceipt(w.deliveryId);
          return receipt ? { status: receipt.status, revisionMatches: receipt.revision === canonical.revision, deviceReceived: false } : { status: "legacy", revisionMatches: false, deviceReceived: false };
        })() : null,
        capability: canonical.capability,
        verdict: canonical.verdict,
        reviewRequirement:canonical.reviewRequirement,
        resolutionReason: canonical.reason,
        durationIsEstimate: canonical.exactTimeSeconds === null,
        title: p.title,
        sport: p.sport,
        type: p.type,
        durationMin: p.durationMin,
        intensity: p.intensity,
        matchedPlanId: w.matchedPlanId,
        jStress: workoutJStress(w),
        tss,
        if: ifFactor,
        distanceKm,
        distanceKind: distanceSteps.length ? "prescribed_steps" : distanceKm == null ? "unavailable" : "estimate",
        startTime: w.startTime,
        completed: w.completed,
        feedbackStatus: w.feedbackStatus,
        actualDurationMin: w.actualDurationMin,
        actualDetails: w.actualDetails,
        actualSport: w.actualSport,
        feedbackNote: w.feedbackNote,
        rpe: w.rpe,
        avgHr: w.avgHr, avgPower: w.avgPower, calories: w.calories, preWeightKg: w.preWeightKg, postWeightKg: w.postWeightKg,
        regenCount: w.regenCount,
        approved: w.approved,
        dayOff: !!w.planDay?.dayOff,
        prescription: { ...p, steps: canonical.steps, targets: {} },
        fuel,
        fuelCurve: fuel ? fuelCurveReference(false) : [],
        post,
        coachNotes: baseWorkout(w).description || null,
      };
    });
    let recoveryAnswers = null;
    try { const parsed = checkin ? JSON.parse(checkin.answers || "null") : null; if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) recoveryAnswers = parsed; } catch { /* Missing safety remains unknown. */ }
    const eventDay = !!eventToday || restDay?.focus === "event" || !!(user.profile?.raceDate && dateKey(user.profile.raceDate,user.timezone)===key);
    const plannedRest = !eventDay && (allWorkouts.some(w=>w.source==="starter-rest") || !!restDay?.dayOff || (!!workouts.length && workouts.every(w => w.planDay?.dayOff)));
    const scopedReview = recoveryAnswers?.inputMetadata?.existingReview;
    const reviewedSessionId = scopedReview?.version === "existing-workout-review-v1"
      ? sessions.find(session=>session.id===scopedReview.sessionId && session.verdict==="ready" && session.existingReview?.eligible)?.id ?? null : null;
    const recovery = dailyRecoveryContext({ plannedRest, eventDay, sessions, reviewedSessionId, performedToday: allWorkouts.some(hasPerformedTraining), injured: !!user.profile?.injured, answers: recoveryAnswers });
    const visibleConnectors = connectors.filter(c => c.provider !== "intervals" || intervalsConnectorEnabled());
    const [inputContext, weekReview] = await Promise.all([
      readDailyInputContext(user.id, user.timezone),
      readTrainingWeekReview(actor.id, user.id, key, user.timezone, currentPlan?.id ?? null, activityDecisions),
    ]);
    if (!trainingViewDisclosureAllowed(actor.id, user.id, [...allWorkouts, ...reported], inputContext)) throw new ApiError(ACTIVITY_DISCLOSURE_REASON, 403);
    return Response.json({
      inputContext,
      weekReview,
      athleteReview: athleteDayReview(allWorkouts.map(w=>({...w,feedbackRevision:workoutRevision(w)})), user.id, key, user.timezone, setupState.setup, activityDecisions),
      recovery,
      cycle: activePlan ? savedCycleSummary(activePlan, user.timezone, key) : null,
      capabilities: trainingCapabilities(),
      motivation: personalizedDailyMotivation({date:key,name:user.name,goal:user.profile?.goal,sessionTitle:sessions[0]?.title,rest:plannedRest || !!user.profile?.injured || ["hold","urgent"].includes(recovery.safetyStatus),checkinComplete:!!checkin && !sessions.some(s=>s.verdict==="blocked"),enabled:user.motivation?.dailyQuote !== false,style:user.motivation?.style,lang:user.language}),
      date: key,
      timezone: user.timezone,
      units: unitsOf(user.profile?.units, user.language),
      needsTesting: {
        vo2max: !user.profile?.vo2max,
        lthr: !user.profile?.lthr,
      },
      vo2maxSource: user.profile?.vo2max ? "profile_reference" : null,
      deviceSummary: {
        connected: visibleConnectors.filter((c: any) => c.status === "connected").length,
        stale: visibleConnectors.some((c: any) => c.status === "connected" && c.lastSyncAt && Date.now() - new Date(c.lastSyncAt).getTime() > 12 * 3600000),
      },
      sessions,
      activityReports: reported.flatMap((w) => {
        const parsed = readVerifiedActivityReport(w.insights, w);
        if (!parsed) return [];
        return [{
          id: w.id,
          date: w.date,
          title: w.title,
          sport: w.sport,
          headline: parsed?.headline || "",
          body: parsed?.body || "",
        }];
      }),
      connectors: visibleConnectors,
      checkin: checkin
        ? {
            date: checkin.date,
            adaptation: JSON.parse(checkin.adaptation || "null"),
          }
        : null,
      updatedAt: new Date().toISOString(),
      race: race
        ? {
            name: race.name,
            daysAway: Math.round(
              (Date.parse(race.date.toISOString().slice(0,10)) -
                Date.parse(key)) /
                86400000,
            ),
          }
        : null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
