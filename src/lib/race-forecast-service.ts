// JasMiamiMethod — Race Forecast Service
// Shared assembly (profile + PMC + race + live weather → engine input) used
// by both /api/race-forecast and /api/race-forecast/brief.

import { prisma } from "@/lib/db";
import { computePmc } from "@/lib/fitness";
import { forecastRace, classifyDistance, type ForecastResult } from "@/lib/raceforecast";
import { getRaceWeather, type RaceWeather } from "@/lib/weather";

export interface ForecastRequestOpts {
  distance?: string | null;
  raceId?: string | null;
  timezone?: string | null;
  // Athlete measurement overrides (query params until they live on the profile)
  federation?: string | null;
  category?: string | null;
  sweatRateMlH?: number | null;
  sodiumMgPerL?: number | null;
  gutTrained?: boolean | null;
  draftSkill?: string | null;
  age?: number | null;
}

export interface ForecastBundle {
  ok: true;
  forecast: ForecastResult | null;
  weather: RaceWeather | null;
  distance: string | null;
  race: {
    id: string; name: string; distance: string; date: Date;
    priority: number; goalTimeMin: number | null; resultMin: number | null;
    courseKm: number | null; courseElevM: number | null;
    predictionErrorPct: number | null;
  } | null;
  predictionSnapshot: {
    capturedAt: Date;
    predictedMin: number;
    errorPct: number | null;
    snapshotCount: number;
  } | null;
  pmc: { ctl: number; atl: number; tsb: number; formZone: string; rampRate7d: number } | null;
  physiology: { ftp: number | null; lthr: number | null; runPaceBase: number | null; swimPaceBase: number | null };
}

export async function buildForecastBundle(userId: string, opts: ForecastRequestOpts): Promise<ForecastBundle> {
  const profile = await prisma.athleteProfile.findUnique({ where: { userId } });

  // PMC from 90 days of completed training
  const since90 = new Date(Date.now() - 90 * 86400000);
  const completed = await prisma.workout.findMany({
    where: {
      userId,
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
    opts.timezone ?? undefined,
  );

  let race: any = null;
  if (opts.raceId) {
    race = await prisma.race.findFirst({ where: { id: opts.raceId, userId } });
  } else if (opts.distance) {
    const races = await prisma.race.findMany({
      where: { userId, distance: opts.distance },
      orderBy: [{ priority: "asc" }, { date: "asc" }],
    });
    const future = races.filter((r) => r.date.getTime() >= Date.now());
    race = future[0] || races[0] || null;
  }

  const distance = race?.distance ?? opts.distance ?? profile?.goal ?? null;

  let weather: RaceWeather | null = null;
  if (race?.lat != null && race?.lng != null) {
    const daysAway = (new Date(race.date).getTime() - Date.now()) / 86400000;
    if (daysAway >= 0 && daysAway <= 16)
      weather = await getRaceWeather(
        race.lat,
        race.lng,
        new Date(race.date),
        Number((race.startTime || "07").slice(0, 2)),
      ).catch(() => null);
  }

  const forecast =
    distance && classifyDistance(distance)
      ? forecastRace({
          athlete: {
            ftp,
            runPaceBase: profile?.runPaceBase ?? null,
            swimPaceBase: profile?.swimPaceBase ?? null,
            weightKg: profile?.weightKg ?? null,
            heightCm: profile?.heightCm ?? null,
            lthr,
            vo2max: profile?.vo2max ?? null,
            age: opts.age ?? (profile?.birthYear ? new Date().getFullYear() - profile.birthYear : null),
            sweatRateMlH: opts.sweatRateMlH ?? profile?.sweatRateMlH ?? null,
            sodiumMgPerL: opts.sodiumMgPerL ?? profile?.sodiumMgPerL ?? null,
            gutTrained: opts.gutTrained ?? profile?.gutTrained ?? undefined,
            draftSkill: (opts.draftSkill ?? profile?.draftSkill ?? undefined) as ("none" | "mixed" | "good") | undefined,
          },
          fitness: pmc,
          distance: distance as string,
          venue: {
            targetTempC: weather?.tempC ?? race?.targetTempC ?? undefined,
            humidity: weather ? weather.humidity : (race?.humidity ?? undefined),
            solarWm2: weather?.solarWm2 ?? undefined,
            cloudCover: weather?.cloudCover ?? undefined,
            windKph: weather?.windKph ?? undefined,
            baseElevM: race?.baseElevM ?? undefined,
            bikeElevM: race?.bikeElevM ?? undefined,
            bikeTerrain: race?.bikeTerrain ?? undefined,
            runElevM: race?.runElevM ?? undefined,
            runTerrain: race?.runTerrain ?? undefined,
            swimVenue: race?.swimVenue ?? undefined,
            waterTempC: race?.waterTempC ?? undefined,
            swimCurrent: race?.swimCurrent ?? undefined,
            federation: opts.federation ?? race?.federation ?? profile?.federation ?? undefined,
            category: opts.category ?? race?.category ?? profile?.category ?? undefined,
          },
          goalTimeMin: race?.goalTimeMin ?? undefined,
        })
      : null;

  // ---- PRE-RACE SNAPSHOT (honest calibration) ----
  // Capture an immutable snapshot of the prediction the FIRST time a race is
  // forecast (and at most once per 24h while it stays in the future). Later
  // accuracy evaluation uses the OLDEST snapshot — recomputing an old race
  // with today's fitness is forbidden (review finding I).
  let predictionSnapshot: {
    capturedAt: Date;
    predictedMin: number;
    errorPct: number | null;
    snapshotCount: number;
  } | null = null;
  if (race && forecast && race.date > new Date()) {
    const existing = await prisma.raceForecastSnapshot.findMany({
      where: { userId, raceId: race.id },
      orderBy: { capturedAt: "asc" },
      select: { capturedAt: true, predictedMin: true },
    });
    const last = existing[existing.length - 1];
    const stale = !last || Date.now() - last.capturedAt.getTime() > 24 * 3600000;
    if (stale) {
      await prisma.raceForecastSnapshot.create({
        data: {
          userId,
          raceId: race.id,
          raceDate: race.date,
          predictedMin: forecast.totalMin,
          bestMin: forecast.scenarios?.find((s) => s.label === "best")?.totalMin ?? null,
          worstMin: forecast.scenarios?.find((s) => s.label === "worst")?.totalMin ?? null,
          inputs: JSON.stringify({
            ctl: pmc?.current.ctl ?? null,
            tsb: pmc?.current.tsb ?? null,
            weather: weather ? { wbgt: weather.wbgt ?? null, tempC: weather.tempC ?? null } : null,
            ftp: ftp ?? null,
            lthr: lthr ?? null,
            distance,
          }),
          engineVersion: "engine-v1",
        },
      });
      existing.push({
        capturedAt: new Date(),
        predictedMin: forecast.totalMin,
      });
    }
    const oldest = existing[0];
    if (race.resultMin != null && oldest) {
      predictionSnapshot = {
        capturedAt: oldest.capturedAt,
        predictedMin: oldest.predictedMin,
        // Honest error: the PRE-RACE prediction vs the actual result.
        errorPct:
          Math.round(((oldest.predictedMin - race.resultMin) / race.resultMin) * 1000) / 10,
        snapshotCount: existing.length,
      };
    }
  }

  return {
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
          courseKm: race.courseKm ?? null,
          courseElevM: race.courseElevM ?? null,
          predictionErrorPct:
            race.resultMin != null && forecast?.totalMin
              ? Math.round(((forecast.totalMin - race.resultMin) / race.resultMin) * 1000) / 10
              : null,
        }
      : null,
    predictionSnapshot,
    pmc: pmc
      ? {
          ctl: pmc.current.ctl,
          atl: pmc.current.atl,
          tsb: pmc.current.tsb,
          formZone: pmc.formZone,
          rampRate7d: pmc.rampRate7d,
        }
      : null,
    physiology: { ftp, lthr, runPaceBase: profile?.runPaceBase ?? null, swimPaceBase: profile?.swimPaceBase ?? null },
  };
}
