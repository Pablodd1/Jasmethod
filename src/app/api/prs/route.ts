import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/prs — personal records computed from completed imported/manual workouts.
// PRs drive goal-setting: the coach uses these to set realistic race targets.
export async function GET() {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workouts = await prisma.workout.findMany({
    where: { userId: user.id, completed: true, source: { not: "plan" } }, // imported + manual, skip plan seeds
    orderBy: { date: "desc" },
    select: {
      date: true,
      sport: true,
      title: true,
      durationMin: true,
      distanceKm: true,
      avgHr: true,
      avgPower: true,
      maxHr: true,
      source: true,
    },
  });

  if (workouts.length === 0) {
    return NextResponse.json({
      prs: [],
      races: [],
      message:
        "No completed workouts yet. Connect a device (Strava/Garmin) and sync to compute PRs.",
    });
  }

  // ---- Distance-based PRs (running + cycling + swimming) ----
  const RUN_DISTANCES = [1, 5, 10, 21.0975, 42.195];
  const BIKE_DISTANCES = [10, 40, 90, 180];
  const SWIM_DISTANCES = [0.75, 1.5, 3.8];

  function bestTimeFor(
    sport: string,
    targetKm: number,
  ): { date: Date; minutes: number; title: string; paceSecKm: number } | null {
    let best: {
      date: Date;
      minutes: number;
      title: string;
      paceSecKm: number;
    } | null = null;
    for (const w of workouts) {
      if (
        w.sport !== sport ||
        !w.distanceKm ||
        w.distanceKm < targetKm ||
        w.distanceKm > targetKm * 1.01
      )
        continue;
      // extrapolate time to exact distance only if duration is plausible
      const minutes = w.durationMin; // actual total for an activity covering this distance
      const paceSecKm = (w.durationMin * 60) / w.distanceKm;
      if (!best || minutes < best.minutes)
        best = { date: w.date, minutes, title: w.title, paceSecKm };
    }
    return best;
  }

  const prs: any[] = [];
  for (const d of RUN_DISTANCES) {
    const b = bestTimeFor("run", d);
    if (b)
      prs.push({
        sport: "run",
        label: `${d === 21.0975 ? "Half" : d === 42.195 ? "Marathon" : `${d}K`} Run best recorded time`,
        minutes: b.minutes,
        paceSecKm: Math.round(b.paceSecKm),
        date: b.date,
        title: b.title,
      });
  }
  for (const d of BIKE_DISTANCES) {
    const b = bestTimeFor("bike", d);
    if (b)
      prs.push({
        sport: "bike",
        label: `${d}K Bike best recorded time`,
        minutes: b.minutes,
        avgSpeedKmh: Math.round((d / (b.minutes / 60)) * 10) / 10,
        date: b.date,
        title: b.title,
      });
  }
  for (const d of SWIM_DISTANCES) {
    const b = bestTimeFor("swim", d);
    if (b)
      prs.push({
        sport: "swim",
        label: `${d === 0.75 ? "750m" : d === 1.5 ? "1500m" : "3.8km"} Swim best recorded time`,
        minutes: b.minutes,
        paceSec100m: Math.round((b.minutes * 60) / (d * 10)),
        date: b.date,
        title: b.title,
      });
  }

  // ---- Best power output (bike) ----
  const bestPower = workouts
    .filter((w) => w.sport === "bike" && w.avgPower)
    .sort((a, b) => (b.avgPower || 0) - (a.avgPower || 0))[0];
  if (bestPower)
    prs.push({
      sport: "bike",
      label: "Best Avg Power",
      watts: bestPower.avgPower,
      date: bestPower.date,
      title: bestPower.title,
    });

  // ---- Max distance in one session ----
  const longest = workouts
    .filter((w) => w.distanceKm)
    .sort((a, b) => (b.distanceKm || 0) - (a.distanceKm || 0))[0];
  if (longest)
    prs.push({
      sport: longest.sport,
      label: "Longest Session",
      km: Math.round((longest.distanceKm || 0) * 10) / 10,
      date: longest.date,
      title: longest.title,
    });

  // ---- Races: workouts whose title/type looks like a race ----
  const raceKw =
    /race|marathon|70\.3|tri|ironman|5k|10k|half|sprint|olympic|duathlon/i;
  const races = workouts
    .filter((w) => raceKw.test(w.title) || raceKw.test(w.sport))
    .slice(0, 20)
    .map((w) => ({
      date: w.date,
      sport: w.sport,
      title: w.title,
      durationMin: w.durationMin,
      distanceKm: w.distanceKm,
      avgHr: w.avgHr,
      avgPower: w.avgPower,
    }));

  return NextResponse.json({ prs, races, total: prs.length });
}
