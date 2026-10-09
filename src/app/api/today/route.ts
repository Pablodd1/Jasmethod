import { unitsOf } from "@/lib/units";
import { savedCycleSummary } from "@/lib/training-cycle";
import { dailyRecoveryContext } from "@/lib/daily-recovery";
import { workoutJStress, hasPerformedTraining } from "@/lib/j-metrics";
import { SessionResolutionError } from "@/lib/canonical-session";
import { readIntervalsReceipt } from "@/lib/intervals-delivery";
import {personalizedDailyMotivation} from "@/lib/reference";
import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse } from "@/lib/access";
import { dayBounds, dateKey } from "@/lib/dates";
import { estimateIf, estimateDistanceKm } from "@/lib/prescription";
import { estimateTss } from "@/lib/fitness";
import {
  fuelCurveReference,
} from "@/lib/fueling";
import { effectivePrescription } from "@/lib/effective-prescription";
import { intervalsConnectorEnabled, trainingCapabilities } from "@/lib/capabilities";
import { baseWorkout } from "@/lib/prescription";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const { athlete: user } = await trainingAccess(req);
    const { start, end, key } = dayBounds(user.timezone);
  const [allWorkouts, race, connectors, checkin, restDay, activePlan] = await Promise.all([
    prisma.workout.findMany({
      where: {
        userId: user.id,
        date: { gte: start, lt: end },
      },
      include: { planDay: { select: { notes: true, dayOff: true } } },
      orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
    }),
    prisma.race.findFirst({
      where: { userId: user.id, date: { gte: start } },
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
    prisma.planDay.findFirst({ where: { plan: { userId: user.id, status: "active" }, date: { gte: start, lt: end }, dayOff: true }, select: { id: true } }),
    prisma.trainingPlan.findFirst({ where: { userId: user.id, status: "active" }, orderBy: { createdAt: "desc" }, select: { id:true, name:true, startDate:true, weeks:true, raceDate:true } }),
  ]);

  const workouts = allWorkouts.filter(w => w.planned);

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
    select: { id: true, date: true, title: true, sport: true, insights: true },
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
        id: w.id, title: w.title || "Session needs review", sport: w.sport, type: w.type,
        revision: null, verdict: "blocked", resolutionReason: resolved.resolutionError,
        capability: { available: false, mode: "unavailable", reason: resolved.resolutionError, deviceTested: false },
        matchedPlanId: w.matchedPlanId,
        jStress: workoutJStress(w),
        durationMin: 0, durationIsEstimate: false, intensity: null, tss: null, if: null, distanceKm: null,
        startTime: w.startTime, completed: w.completed, feedbackStatus: w.feedbackStatus,
        actualDurationMin: w.actualDurationMin, actualSport: w.actualSport, rpe: w.rpe, regenCount: w.regenCount, approved: w.approved,
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
        revision: canonical.revision,
        intervalsPublication: w.deliveryProvider === "intervals" ? (() => {
          const receipt = readIntervalsReceipt(w.deliveryId);
          return receipt ? { status: receipt.status, revisionMatches: receipt.revision === canonical.revision, deviceReceived: false } : { status: "legacy", revisionMatches: false, deviceReceived: false };
        })() : null,
        capability: canonical.capability,
        verdict: canonical.verdict,
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
        actualSport: w.actualSport,
        rpe: w.rpe,
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
    const plannedRest = !!restDay || (!!workouts.length && workouts.every(w => w.planDay?.dayOff));
    const recovery = dailyRecoveryContext({ plannedRest, sessions, performedToday: allWorkouts.some(hasPerformedTraining), injured: !!user.profile?.injured, answers: recoveryAnswers });
    const visibleConnectors = connectors.filter(c => c.provider !== "intervals" || intervalsConnectorEnabled());
    return Response.json({
      recovery,
      cycle: activePlan ? savedCycleSummary(activePlan, user.timezone, key) : null,
      capabilities: trainingCapabilities(),
      motivation: personalizedDailyMotivation({date:key,name:user.name,goal:user.profile?.goal,sessionTitle:sessions[0]?.title,rest:plannedRest || !!user.profile?.injured || (!!sessions.length && sessions.every(s=>s.durationMin===0)) || (!!todaysWorkouts.length && todaysWorkouts.every(w=>w.planDay?.dayOff)),checkinComplete:!!checkin,enabled:user.motivation?.dailyQuote !== false,style:user.motivation?.style,lang:user.language}),
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
      activityReports: reported.map((w) => {
        let parsed: { headline: string; body: string } | null = null;
        try {
          parsed = JSON.parse(w.insights!);
        } catch {}
        return {
          id: w.id,
          date: w.date,
          title: w.title,
          sport: w.sport,
          headline: parsed?.headline || "",
          body: parsed?.body || "",
        };
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
              (Date.parse(dateKey(race.date, user.timezone)) -
                Date.parse(key)) /
                86400000,
            ),
          }
        : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
