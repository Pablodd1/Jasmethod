import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generatePlan, generateHyroxPlan, generateBoxingCamp, generateSingleSport, estimateVo2max, maxHrFromAge, estimateLthr, buildZoneTable, type ZoneTable, type PlanSession } from "@/lib/science";
import { recoveryFor, scheduleTests, venueAdjustment, defaultStartTime } from "@/lib/adaptive";

// POST /api/plan/generate — generate a periodized plan for the user
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { distance, weeks, startDate, raceDate, targetTempC, easyPct, trainingWindow } = body || {};
    const splitTarget = easyPct === undefined || easyPct === null ? 70 : Math.max(45, Math.min(90, parseInt(String(easyPct), 10) || 70));
    const profile = user.profile ?? (await prisma.athleteProfile.create({ data: { userId: user.id } }));
    const level = profile.experience || "amateur";

    // Preferred training window: an explicit request wins, else the saved
    // profile preference, else "any" (no fixed time).
    const window = String(trainingWindow || profile.trainingWindow || "any");
    if (trainingWindow && trainingWindow !== profile.trainingWindow) {
      await prisma.athleteProfile.update({ where: { userId: user.id }, data: { trainingWindow: window } });
    }
    const sessionStartTime = defaultStartTime(window);

    // Estimate physiology if missing
    let vo2max = profile.vo2max;
    let lthr = profile.lthr;
    if (!vo2max && profile.birthYear && profile.sex && profile.weightKg) {
      const age = new Date().getFullYear() - profile.birthYear;
      const heightM = profile.heightCm ? profile.heightCm / 100 : 1.75;
      const bmi = profile.weightKg / (heightM * heightM);
      const activityLevel = level === "pro" ? 5 : level === "advanced" ? 4 : level === "amateur" ? 3 : 2;
      vo2max = estimateVo2max({ sex: profile.sex as "male" | "female", age, bmi, activityLevel: activityLevel as 1 | 2 | 3 | 4 | 5 }).vo2max;
      await prisma.athleteProfile.update({ where: { userId: user.id }, data: { vo2max } });
    }
    if (!lthr) {
      const age = profile.birthYear ? new Date().getFullYear() - profile.birthYear : 35;
      const hrMax = profile.maxHr ?? maxHrFromAge(age);
      lthr = profile.lthr ?? estimateLthr(hrMax, level);
      await prisma.athleteProfile.update({ where: { userId: user.id }, data: { lthr } });
    }

    const weeksCount = Math.max(4, Math.min(30, parseInt(weeks || "12", 10)));
    // Parse date-only strings as LOCAL midnight (new Date("YYYY-MM-DD") is UTC,
    // which shifts every session a day off in EDT and breaks "today" lookups).
    const toLocalMidnight = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
    const start = startDate ? toLocalMidnight(String(startDate)) : new Date(new Date().setHours(0, 0, 0, 0));
    const race = raceDate ? toLocalMidnight(String(raceDate)) : new Date(start.getTime() + weeksCount * 7 * 86400000);

    const dist = String(distance || "olympic");
    const isHyrox = dist === "hyrox";
    const isBoxing = dist === "boxing";
    const isSingleSport = dist === "cycle" || dist === "swim-only" || dist === "run-only" || dist === "lifting";
    const generated = isSingleSport
      ? generateSingleSport({
          sport: dist === "cycle" ? "bike" : dist === "swim-only" ? "swim" : dist === "run-only" ? "run" : "strength",
          level, weeks: weeksCount, startDate: start,
          weeklyHours: profile.weeklyHours || undefined,
          hasRace: Boolean(raceDate),
        })
      : isBoxing
      ? generateBoxingCamp({ level, weeks: weeksCount, startDate: start, weeklyHours: profile.weeklyHours || undefined })
      : isHyrox
      ? generateHyroxPlan({ level, weeks: weeksCount, startDate: start, weeklyHours: profile.weeklyHours || undefined })
      : generatePlan({ level, distance: dist, weeks: weeksCount, startDate: start, weeklyHours: profile.weeklyHours || undefined, easyPct: splitTarget, raceDate: raceDate ? race : undefined });

    // Persist plan + plan days + planned workouts
    // One active plan per athlete: archive any previous active plan and remove
    // its future planned-but-uncompleted workouts so calendars don't double-book.
    const oldPlans = await prisma.trainingPlan.findMany({ where: { userId: user.id, status: "active" }, select: { id: true } });
    if (oldPlans.length) {
      await prisma.workout.deleteMany({
        where: { userId: user.id, planned: true, completed: false, planDay: { planId: { in: oldPlans.map((p) => p.id) } } },
      });
      await prisma.trainingPlan.updateMany({ where: { id: { in: oldPlans.map((p) => p.id) } }, data: { status: "archived" } });
    }
    const plan = await prisma.trainingPlan.create({
      data: {
        userId: user.id,
        name: `JMM ${dist} ${weeksCount}-week plan (${level})`,
        level,
        distance: dist,
        weeks: weeksCount,
        startDate: start,
        raceDate: race,
        easyPct: splitTarget,
        days: {
          create: generated.flatMap((week, wi) => {
            // Group the week's sessions onto 7 day-slots; sessions sharing a slot
            // (e.g. swim + recovery on Monday) join ONE PlanDay so dates never
            // duplicate and "Day off" applies to the whole day.
            const bySlot = new Map<number, PlanSession[]>();
            week.sessions.forEach((s: PlanSession, si: number) => {
              const slot = si % 7;
              if (!bySlot.has(slot)) bySlot.set(slot, []);
              bySlot.get(slot)!.push(s);
            });
            return Array.from(bySlot.entries()).map(([slot, slotSessions]) => {
              const date = new Date(start);
              date.setDate(date.getDate() + (wi * 7) + slot);
              return {
                date,
                week: week.week,
                dayOfWeek: date.getDay(),
                focus: slotSessions[0].sport,
                notes: slotSessions[0].description,
                sessions: {
                  create: slotSessions.map((s) => ({
                    userId: user.id,
                    date,
                    startTime: sessionStartTime,
                    sport: s.sport,
                    title: s.title,
                    type: s.type,
                    durationMin: s.minutes,
                    intensity: s.zone,
                    notes: s.description,
                    rpe: s.zone === "z1" || s.zone === "z2" ? 3 : s.zone === "z3" ? 5 : s.zone === "z4" ? 7 : 9,
                    planned: true,
                    completed: false,
                    source: "plan",
                    recovery: recoveryFor(date).cooldownNote,
                  })),
                },
              };
            });
          }),
        },
      },
      include: { days: { include: { sessions: true } } },
    });

    // Also build the zone table for the user to see
    const zones: ZoneTable = buildZoneTable({
      maxHr: profile.maxHr ?? undefined,
      lthr,
      ftp: profile.ftp || undefined,
      thresholdPaceSecPerKm: profile.runPaceBase || undefined,
      thresholdPaceSecPer100m: profile.swimPaceBase || undefined,
      restingHr: profile.restingHr || undefined,
    });

    // Schedule benchmark tests every ~2 months, race-aware
    const races = await prisma.race.findMany({ where: { userId: user.id, date: { gte: start } } });
    const scheduledTests = scheduleTests(start, weeksCount, races.map((r) => ({ date: r.date })), { hyrox: isHyrox, boxing: isBoxing });
    await prisma.benchmarkTest.deleteMany({ where: { userId: user.id, completed: false } });
    if (scheduledTests.length) {
      await prisma.benchmarkTest.createMany({
        data: scheduledTests.map((t) => ({
          userId: user.id,
          date: t.date,
          type: t.type,
          name: t.name,
          skipped: t.skipped,
          reason: t.reason || null,
        })),
      });
    }

    // Race venue adjustment (temperature + elevation + terrain + water) from the A-race
    let venuePlan = null;
    const anchorRace = races.find((r) => r.priority === 1) || races[0];
    const temp = targetTempC !== undefined ? parseFloat(targetTempC) : anchorRace?.targetTempC ?? undefined;
    if (anchorRace || temp !== undefined) {
      venuePlan = venueAdjustment({
        targetTempC: temp,
        humidity: anchorRace?.humidity ?? undefined,
        baseElevM: anchorRace?.baseElevM ?? undefined,
        bikeElevM: anchorRace?.bikeElevM ?? undefined,
        bikeTerrain: anchorRace?.bikeTerrain ?? undefined,
        runElevM: anchorRace?.runElevM ?? undefined,
        runTerrain: anchorRace?.runTerrain ?? undefined,
        swimVenue: anchorRace?.swimVenue ?? undefined,
        waterTempC: anchorRace?.waterTempC ?? undefined,
        swimCurrent: anchorRace?.swimCurrent ?? undefined,
      });
    }

    return NextResponse.json({
      ok: true,
      plan: {
        id: plan.id,
        name: plan.name,
        level,
        distance: dist,
        weeks: weeksCount,
        startDate: start,
        raceDate: race,
        sessions: plan.days.flatMap((d) => d.sessions),
      },
      zones,
      physiology: { vo2max, lthr },
      benchmarks: scheduledTests,
      venuePlan,
    });
  } catch (e: any) {
    console.error("plan generate error:", e);
    return NextResponse.json({ error: e.message || "Generation failed" }, { status: 500 });
  }
}
