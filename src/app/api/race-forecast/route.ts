import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { computePmc } from "@/lib/fitness";
import { forecastRace, classifyDistance } from "@/lib/raceforecast";
import {
  getRaceWeather,
  windFactor,
  heatFactor,
  heatPowerFactor,
} from "@/lib/weather";

// GET /api/race-forecast?distance=half&id=<raceId>
// Approach-B race prediction: baseline thresholds + PMC fitness (CTL/TSB) +
// course conditions (temperature / humidity / altitude / terrain / water).
//
// - ?distance=...  forecast any forecastable distance on the fly (uses the
//                  first matching A-race's venue fields if present)
// - ?id=<raceId>   forecast a specific saved race (uses its venue + goal time)
// Returns null body if the distance isn't forecastable.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.athleteProfile.findUnique({
    where: { userId: user.id },
  });

  // PMC from 90 days of completed training
  const since90 = new Date(Date.now() - 90 * 86400000);
  const completed = await prisma.workout.findMany({
    where: {
      userId: user.id,
      completed: true,
      matchedPlanId: null,
      date: { gte: since90, lte: new Date() },
    },
    orderBy: { date: "asc" },
  });
  const ftp = profile?.ftp ?? null;
  const lthr = profile?.lthr ?? null;
  const pmc = computePmc(
    completed.map((w) => ({
      date: w.date,
      tssInput: {
        durationMin: w.actualDurationMin ?? w.durationMin,
        avgPower: w.np ?? w.avgPower,
        avgHr: w.avgHr,
        rpe: w.rpe,
        intensity: w.intensity,
        tss: w.tss,
        ftp,
        lthr,
      },
    })),
    new Date(),
    user.timezone,
  );

  const url = new URL(req.url);
  const raceId = url.searchParams.get("id");
  const distanceParam = url.searchParams.get("distance");

  let race: any = null;
  if (raceId) {
    race = await prisma.race.findFirst({
      where: { id: raceId, userId: user.id },
    });
  } else if (distanceParam) {
    // Prefer the A-race (priority 1) matching the distance, else nearest future race.
    const races = await prisma.race.findMany({
      where: { userId: user.id, distance: distanceParam },
      orderBy: [{ priority: "asc" }, { date: "asc" }],
    });
    const future = races.filter((r) => r.date.getTime() >= Date.now());
    race = future[0] || races[0] || null;
  }

  const distance = race?.distance ?? distanceParam ?? profile?.goal ?? null;
  if (!distance || !classifyDistance(distance)) {
    return NextResponse.json({
      ok: true,
      forecast: null,
      reason: "not_forecastable",
      distance,
      pmc,
    });
  }

  const athlete = {
    ftp,
    runPaceBase: profile?.runPaceBase ?? null,
    swimPaceBase: profile?.swimPaceBase ?? null,
    weightKg: profile?.weightKg ?? null,
    heightCm: profile?.heightCm ?? null,
    lthr,
    vo2max: profile?.vo2max ?? null,
  };

  let liveWeather = null;
  if (race?.lat != null && race?.lng != null) {
    const daysAway = (new Date(race.date).getTime() - Date.now()) / 86400000;
    if (daysAway >= 0 && daysAway <= 16)
      liveWeather = await getRaceWeather(
        race.lat,
        race.lng,
        new Date(race.date),
        Number((race.startTime || "07").slice(0, 2)),
      ).catch(() => null);
  }
  const forecast = forecastRace({
    athlete,
    fitness: pmc,
    distance: distance as string,
    venue: {
      targetTempC: liveWeather?.feelsLikeC ?? race?.targetTempC ?? undefined,
      humidity: liveWeather ? undefined : (race?.humidity ?? undefined),
      baseElevM: race?.baseElevM ?? undefined,
      bikeElevM: race?.bikeElevM ?? undefined,
      bikeTerrain: race?.bikeTerrain ?? undefined,
      runElevM: race?.runElevM ?? undefined,
      runTerrain: race?.runTerrain ?? undefined,
      swimVenue: race?.swimVenue ?? undefined,
      waterTempC: race?.waterTempC ?? undefined,
      swimCurrent: race?.swimCurrent ?? undefined,
    },
    goalTimeMin: race?.goalTimeMin ?? undefined,
  });

  const weather = liveWeather;

  return NextResponse.json({
    ok: true,
    forecast,
    weather,
    distance,
    race: race
      ? {
          id: race.id,
          name: race.name,
          distance: race.distance,
          date: race.date,
          priority: race.priority,
          goalTimeMin: race.goalTimeMin ?? null,
          resultMin: race.resultMin ?? null,
          predictionErrorPct:
            race.resultMin != null && forecast?.totalMin
              ? Math.round(
                  ((forecast.totalMin - race.resultMin) / race.resultMin) *
                    1000,
                ) / 10
              : null,
        }
      : null,
    pmc: pmc
      ? {
          ctl: pmc.current.ctl,
          atl: pmc.current.atl,
          tsb: pmc.current.tsb,
          formZone: pmc.formZone,
          rampRate7d: pmc.rampRate7d,
        }
      : null,
    physiology: {
      ftp,
      lthr,
      runPaceBase: profile?.runPaceBase ?? null,
      swimPaceBase: profile?.swimPaceBase ?? null,
    },
  });
}
