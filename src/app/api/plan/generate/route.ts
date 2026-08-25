import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { generatePlan, estimateVo2max, maxHrFromAge, estimateLthr, buildZoneTable, type ZoneTable } from "@/lib/science";

// POST /api/plan/generate — generate a periodized plan for the user
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { distance, weeks, startDate, raceDate } = body || {};
    const profile = user.profile ?? (await prisma.athleteProfile.create({ data: { userId: user.id } }));
    const level = profile.experience || "amateur";

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
    const start = startDate ? new Date(startDate) : new Date();
    const race = raceDate ? new Date(raceDate) : new Date(start.getTime() + weeksCount * 7 * 86400000);

    const generated = generatePlan({
      level,
      distance: distance || "olympic",
      weeks: weeksCount,
      startDate: start,
      weeklyHours: profile.weeklyHours || undefined,
    });

    // Persist plan + plan days + planned workouts
    const plan = await prisma.trainingPlan.create({
      data: {
        userId: user.id,
        name: `JMM ${distance || "olympic"} ${weeksCount}-week plan (${level})`,
        level,
        distance: distance || "olympic",
        weeks: weeksCount,
        startDate: start,
        raceDate: race,
        days: {
          create: generated.flatMap((week, wi) =>
            week.sessions.map((s, si) => {
              const date = new Date(start);
              date.setDate(date.getDate() + (wi * 7) + (si % 7));
              return {
                date,
                week: week.week,
                dayOfWeek: date.getDay(),
                focus: s.sport,
                notes: s.description,
                sessions: {
                  create: {
                    userId: user.id,
                    date,
                    sport: s.sport,
                    title: s.title,
                    type: s.type,
                    durationMin: s.minutes,
                    intensity: s.zone,
                    rpe: s.zone === "z1" || s.zone === "z2" ? 3 : s.zone === "z3" ? 5 : s.zone === "z4" ? 7 : 9,
                    planned: true,
                    completed: false,
                    source: "plan",
                  },
                },
              };
            })
          ),
        },
      },
      include: { days: { include: { sessions: true } } },
    });

    // Also build the zone table for the user to see
    const zones: ZoneTable = buildZoneTable({
      lthr,
      ftp: profile.ftp || undefined,
      thresholdPaceSecPerKm: profile.runPaceBase || undefined,
      thresholdPaceSecPer100m: profile.swimPaceBase || undefined,
    });

    return NextResponse.json({
      ok: true,
      plan: {
        id: plan.id,
        name: plan.name,
        level,
        distance,
        weeks: weeksCount,
        startDate: start,
        raceDate: race,
        sessions: plan.days.flatMap((d) => d.sessions),
      },
      zones,
      physiology: { vo2max, lthr },
    });
  } catch (e: any) {
    console.error("plan generate error:", e);
    return NextResponse.json({ error: e.message || "Generation failed" }, { status: 500 });
  }
}
