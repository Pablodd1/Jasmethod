import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse } from "@/lib/access";
import { dayBounds, dateKey } from "@/lib/dates";
import { prescribeToday, recommendFuel, postWorkoutFuel } from "@/lib/adaptive";
import { baseWorkout } from "@/lib/prescription";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const { athlete: user } = await trainingAccess(req);
    const { start, end, key } = dayBounds(user.timezone);
    const [workouts, race, connectors, checkin] = await Promise.all([
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
    ]);
    const sessions = workouts.map((w) => {
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
      return {
        id: w.id,
        title: p.title,
        sport: p.sport,
        type: p.type,
        durationMin: p.durationMin,
        intensity: p.intensity,
        startTime: w.startTime,
        completed: w.completed,
        feedbackStatus: w.feedbackStatus,
        actualDurationMin: w.actualDurationMin,
        rpe: w.rpe,
        regenCount: w.regenCount,
        approved: w.approved,
        dayOff: !!w.planDay?.dayOff,
        prescription: p,
        fuel: recommendFuel(p),
        post: p.durationMin ? postWorkoutFuel(p) : null,
        coachNotes: baseWorkout(w).description || null,
      };
    });
    return Response.json({
      date: key,
      timezone: user.timezone,
      sessions,
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
