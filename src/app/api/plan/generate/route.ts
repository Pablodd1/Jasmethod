import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import {
  dayBounds,
  dateKey,
  parseDate,
  addDaysKey,
  localDate,
} from "@/lib/dates";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import {
  generatePlan,
  generateHyroxPlan,
  generateBoxingCamp,
  generateSingleSport,
  estimateVo2max,
  maxHrFromAge,
  estimateLthr,
  buildZoneTable,
  type ZoneTable,
  type PlanSession,
  generateTrackSprint,
} from "@/lib/science";
import {
  recoveryFor,
  scheduleTests,
  venueAdjustment,
  defaultStartTime,
} from "@/lib/adaptive";

// POST /api/plan/generate — generate a periodized plan for the user
export async function POST(req: Request) {
  let user, actor;
  try {
    const access = await trainingAccess(req);
    user = access.athlete;
    actor = access.actor;
  } catch (e) {
    return errorResponse(e);
  }
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      distance,
      weeks,
      startDate,
      raceDate,
      targetTempC,
      easyPct,
      trainingWindow,
    } = body || {};
    const splitTarget =
      easyPct === undefined || easyPct === null
        ? 70
        : Math.max(45, Math.min(90, parseInt(String(easyPct), 10) || 70));
    const profile =
      user.profile ??
      (await prisma.athleteProfile.create({ data: { userId: user.id } }));
    const level = profile.experience || "amateur";

    // Preferred training window: an explicit request wins, else the saved
    // profile preference, else "any" (no fixed time).
    const window = String(trainingWindow || profile.trainingWindow || "any");
    if (trainingWindow && trainingWindow !== profile.trainingWindow) {
      await prisma.athleteProfile.update({
        where: { userId: user.id },
        data: { trainingWindow: window },
      });
    }
    const sessionStartTime = defaultStartTime(window);

    // Estimate physiology if missing
    let vo2max = profile.vo2max;
    let lthr = profile.lthr;
    if (!vo2max && profile.birthYear && profile.sex && profile.weightKg) {
      const age = new Date().getFullYear() - profile.birthYear;
      const heightM = profile.heightCm ? profile.heightCm / 100 : 1.75;
      const bmi = profile.weightKg / (heightM * heightM);
      const activityLevel =
        level === "pro"
          ? 5
          : level === "advanced"
            ? 4
            : level === "amateur"
              ? 3
              : 2;
      vo2max = estimateVo2max({
        sex: profile.sex as "male" | "female",
        age,
        bmi,
        activityLevel: activityLevel as 1 | 2 | 3 | 4 | 5,
      }).vo2max;
      // Estimate is returned separately; it must not overwrite a measured baseline.
    }
    if (!lthr) {
      const age = profile.birthYear
        ? new Date().getFullYear() - profile.birthYear
        : 35;
      const hrMax = profile.maxHr ?? maxHrFromAge(age);
      lthr = profile.lthr ?? estimateLthr(hrMax, level);
      // Leave the saved threshold unknown until it is measured or explicitly entered.
    }

    const weeksCount = Math.max(4, Math.min(30, parseInt(weeks || "12", 10)));
    // Parse date-only strings as LOCAL midnight (new Date("YYYY-MM-DD") is UTC,
    // which shifts every session a day off in EDT and breaks "today" lookups).
    const toLocalMidnight = (s: string) => parseDate(s, user.timezone);
    const start = startDate
      ? toLocalMidnight(String(startDate))
      : dayBounds(user.timezone).start;
    const dist = String(distance || profile.goal || "olympic");
    // All future races feed planning: the A race anchors the taper; B races
    // get train-through sharpening weeks (extraRaces below).
    const allRaces = await prisma.race.findMany({
      where: { userId: user.id, date: { gte: start } },
      orderBy: [{ priority: "asc" }, { date: "asc" }],
    });
    const anchorRaceId = (
      allRaces.find((r) => r.priority === 1) || allRaces[0]
    )?.id;
    // Taper anchor: explicit raceDate wins; else the athlete's A race; else
    // the plan-end fallback (so the taper lands on the RACE, never an
    // arbitrary week).
    const race = raceDate
      ? toLocalMidnight(String(raceDate))
      : allRaces.find((r) => r.id === anchorRaceId)?.date ??
        new Date(start.getTime() + weeksCount * 7 * 86400000);
    if (
      ![
        "sprint",
        "olympic",
        "half",
        "full",
        "hyrox",
        "boxing",
        "track-sprint",
        "cycle",
        "run-only",
        "swim-only",
        "lifting",
      ].includes(dist) ||
      !Number.isFinite(weeksCount)
    )
      throw new ApiError("Invalid plan parameters");
    const isHyrox = dist === "hyrox";
    const isBoxing = dist === "boxing";
    const isTrackSprint = dist === "track-sprint";
    const isSingleSport =
      dist === "cycle" ||
      dist === "swim-only" ||
      dist === "run-only" ||
      dist === "lifting";
    const generated = isTrackSprint
      ? generateTrackSprint({ level, event: "400m", weeks: weeksCount, startDate: start })
      : isSingleSport
      ? generateSingleSport({
          sport:
            dist === "cycle"
              ? "bike"
              : dist === "swim-only"
                ? "swim"
                : dist === "run-only"
                  ? "run"
                  : "strength",
          level,
          weeks: weeksCount,
          startDate: start,
          weeklyHours: profile.weeklyHours || undefined,
          hasRace: Boolean(raceDate),
        })
      : isBoxing
        ? generateBoxingCamp({
            level,
            weeks: weeksCount,
            startDate: start,
            weeklyHours: profile.weeklyHours || undefined,
          })
        : isHyrox
          ? generateHyroxPlan({
              level,
              weeks: weeksCount,
              startDate: start,
              weeklyHours: profile.weeklyHours || undefined,
            })
          : generatePlan({
              level,
              distance: dist,
              weeks: weeksCount,
              startDate: start,
              weeklyHours: profile.weeklyHours || undefined,
              easyPct: splitTarget,
              // `race` already prefers the explicit date, then the athlete's
              // A race, then plan-end — pass it unconditionally so the
              // taper always anchors to a real race when one exists.
              raceDate: race,
              // B/C races: B races get train-through sharpening in their week;
              // the A race (raceDate above) anchors the taper. Excludes the
              // anchor itself to avoid double-counting the same date.
              extraRaces: allRaces
                .filter((r) => r.id !== anchorRaceId && r.date > start)
                .map((r) => ({ date: r.date, priority: r.priority })),
            });

    // Persist plan + plan days + planned workouts
    // One active plan per athlete: archive any previous active plan and remove
    // its future planned-but-uncompleted workouts so calendars don't double-book.
    const plan = await prisma.$transaction(
      async (tx) => {
        const oldPlans = await tx.trainingPlan.findMany({
          where: { userId: user.id, status: "active" },
          select: { id: true },
        });
        if (oldPlans.length) {
          await tx.workout.deleteMany({
            where: {
              userId: user.id,
              planned: true,
              completed: false,
              date: { gte: dayBounds(user.timezone).start },
              planDay: { planId: { in: oldPlans.map((p) => p.id) } },
            },
          });
          await tx.trainingPlan.updateMany({
            where: { id: { in: oldPlans.map((p) => p.id) } },
            data: { status: "archived" },
          });
        }
        const plan = await tx.trainingPlan.create({
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
                return Array.from(bySlot.entries()).map(
                  ([slot, slotSessions]) => {
                    const date = localDate(
                      addDaysKey(dateKey(start, user.timezone), wi * 7 + slot),
                      user.timezone,
                    );
                    return {
                      date,
                      week: week.week,
                      dayOfWeek: new Date(
                        dateKey(date, user.timezone) + "T12:00Z",
                      ).getUTCDay(),
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
                          rpe: null,
                          planned: true,
                          completed: false,
                          source: "plan",
                          recovery: recoveryFor(date).cooldownNote,
                        })),
                      },
                    };
                  },
                );
              }),
            },
          },
          include: { days: { include: { sessions: true } } },
        });

        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            subjectId: user.id,
            action: "plan.generate",
            entityId: plan.id,
            after: JSON.stringify({
              name: plan.name,
              weeks: weeksCount,
              startDate: start,
            }),
          },
        });
        return plan;
      },
      { timeout: 30000 },
    );

    // Also build the zone table for the user to see
    const zones: ZoneTable = buildZoneTable({
      maxHr: profile.maxHr ?? undefined,
      lthr,
      ftp: profile.ftp || undefined,
      thresholdPaceSecPerKm: profile.runPaceBase || undefined,
      thresholdPaceSecPer100m: profile.swimPaceBase || undefined,
      restingHr: profile.restingHr || undefined,
    });

    // Schedule benchmark tests every ~2 months, race-aware (allRaces fetched above)
    const scheduledTests = scheduleTests(
      start,
      weeksCount,
      allRaces.map((r) => ({ date: r.date })),
      { hyrox: isHyrox, boxing: isBoxing, trackSprint: isTrackSprint },
    );
    await prisma.benchmarkTest.deleteMany({
      where: { userId: user.id, completed: false },
    });
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
    const anchorRace = allRaces.find((r) => r.priority === 1) || allRaces[0];
    const temp =
      targetTempC !== undefined
        ? parseFloat(targetTempC)
        : (anchorRace?.targetTempC ?? undefined);
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
      plannerVersion: "race-taper-v2",
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
    return errorResponse(e);
  }
}
