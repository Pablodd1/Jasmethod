import {personalizedDailyMotivation} from "@/lib/reference";
import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse } from "@/lib/access";
import { dayBounds, dateKey } from "@/lib/dates";
import { prescribeToday, postWorkoutFuel } from "@/lib/adaptive";
import { estimateIf, estimateDistanceKm } from "@/lib/prescription";
import { estimateTss } from "@/lib/fitness";
import {
  buildFuelingPlan,
  fuelCurveReference,
  postFuelPersonalized,
  caffeineAllowedFromPrefs,
} from "@/lib/fueling";
import { autoGenerateStarterPlan } from "@/lib/plan-auto";
import { baseWorkout } from "@/lib/prescription";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const { athlete: user } = await trainingAccess(req);
    const { start, end, key } = dayBounds(user.timezone);
  const [workouts, race, connectors, checkin, supplementPrefs] = await Promise.all([
    prisma.workout.findMany({
      where: {
        userId: user.id,
        date: { gte: start, lt: end },
        planned: true,
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
    prisma.supplementProfile.findUnique({ where: { userId: user.id } }),
  ]);

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

    // Caffeine opt-out must reach every fuel recommendation (review finding F).
    const caffeineOk = caffeineAllowedFromPrefs({
      enabled: supplementPrefs?.enabled,
      likes: supplementPrefs?.likes,
      dislikes: supplementPrefs?.dislikes,
      optsOut: supplementPrefs?.optsOut,
    });

    // "Training is always generated": an athlete with no sessions today and
    // no active plan (onboarding skipped, plan archived, fresh device login)
    // gets a starter plan for their sport immediately — defaults cover any
    // missing profile data. Never duplicates an existing program.
    let todaysWorkouts = workouts;
    if (!workouts.length) {
      const activePlan = await prisma.trainingPlan.findFirst({
        where: { userId: user.id, status: "active" },
        select: { id: true },
      });
      if (!activePlan) {
        try {
          await autoGenerateStarterPlan(user.id);
          todaysWorkouts = await prisma.workout.findMany({
            where: {
              userId: user.id,
              date: { gte: start, lt: end },
              planned: true,
            },
            include: { planDay: { select: { notes: true, dayOff: true } } },
            orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
          });
        } catch (e) {
          console.error("today: starter plan generation failed:", e);
        }
      }
    }

    const sessions = todaysWorkouts.map((w) => {
      let p = null;
      try {
        p = w.prescription ? JSON.parse(w.prescription) : null;
      } catch {}
      if (!p || w.planDay?.dayOff || user.profile?.injured)
        p = prescribeToday({
          session: baseWorkout(w),
          adaptation:
            w.planDay?.dayOff || user.profile?.injured
              ? { verdict: "rest", durationFactor: 0, intensityCap: "z1" }
              : { verdict: "full", durationFactor: 1, intensityCap: "z7" },
          profile: user.profile,
        });
      // V2 fueling: personalized (weight, sweat rate, sweat sodium, gut
      // training) with the scrollable session timeline + target curve.
      const fuel = buildFuelingPlan({
        durationMin: p.durationMin,
        intensity: p.intensity,
        weightKg: user.profile?.weightKg,
        sweatRateMlH: user.profile?.sweatRateMlH,
        sodiumMgPerL: user.profile?.sodiumMgPerL,
        gutTrained: user.profile?.gutTrained,
        verdict: p.verdict,
        ergosIncludeCaffeine: !caffeineOk ? true : undefined,
      });
      // Explicit suppression: when caffeine is opted out, drop the field
      // entirely rather than relying on the flag's fallback suggestion.
      if (!caffeineOk) delete (fuel as { caffeineMg?: number }).caffeineMg;
      const postBase = p.durationMin
        ? postWorkoutFuel(p)
        : null;
      // Personalized numbers are the source of truth; the generic builder
      // only contributes its food examples (old mixed amounts removed).
      const postPers = p.durationMin
        ? postFuelPersonalized({
            durationMin: p.durationMin,
            intensity: p.intensity,
            sport: p.sport,
            weightKg: user.profile?.weightKg,
          })
        : null;
      const post = postPers
        ? {
            carbsG: postPers.carbsG,
            proteinG: postPers.proteinG,
            ratio: postPers.ratio,
            note: postPers.note,
            examples: postBase?.examples,
          }
        : null;
      // TrainingPeaks-style summary: load (TSS), intensity factor, distance.
      const tss = estimateTss({
        durationMin: p.durationMin,
        intensity: p.intensity || undefined,
        ftp: user.profile?.ftp || undefined,
        lthr: user.profile?.lthr || undefined,
      });
      const ifFactor = estimateIf(p.intensity || "z2", tss, p.durationMin);
      const distanceKm = estimateDistanceKm(
        p.sport,
        p.intensity || "z2",
        p.durationMin,
        user.profile,
      );
      return {
        id: w.id,
        title: p.title,
        sport: p.sport,
        type: p.type,
        durationMin: p.durationMin,
        intensity: p.intensity,
        tss,
        if: ifFactor,
        distanceKm,
        startTime: w.startTime,
        completed: w.completed,
        feedbackStatus: w.feedbackStatus,
        actualDurationMin: w.actualDurationMin,
        rpe: w.rpe,
        regenCount: w.regenCount,
        approved: w.approved,
        dayOff: !!w.planDay?.dayOff,
        prescription: p,
        fuel,
        fuelCurve: fuelCurveReference(!!user.profile?.gutTrained),
        post,
        coachNotes: baseWorkout(w).description || null,
      };
    });
    return Response.json({
      motivation: personalizedDailyMotivation({date:key,name:user.name,goal:user.profile?.goal,sessionTitle:sessions[0]?.title,rest:!!user.profile?.injured || (!!sessions.length && sessions.every(s=>s.durationMin===0)) || (!!todaysWorkouts.length && todaysWorkouts.every(w=>w.planDay?.dayOff)),checkinComplete:!!checkin,enabled:user.motivation?.dailyQuote !== false,style:user.motivation?.style,lang:user.language}),
      date: key,
      timezone: user.timezone,
      units: user.profile?.units === "imperial" ? "imperial" : "metric",
      needsTesting: {
        vo2max: !user.profile?.vo2max,
        lthr: !user.profile?.lthr,
      },
      vo2maxSource: user.profile?.vo2max
        ? "measured"
        : user.profile?.restingHr
          ? "rhr-formula (Uth–Sørensen 2004)"
          : null,
      deviceSummary: {
        connected: connectors.filter((c: any) => c.status === "connected").length,
        stale: connectors.some((c: any) => c.status === "connected" && c.lastSyncAt && Date.now() - new Date(c.lastSyncAt).getTime() > 12 * 3600000),
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
      connectors,
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
