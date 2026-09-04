import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { computePmc } from "@/lib/fitness";
import { forecastRace, classifyDistance } from "@/lib/raceforecast";
import { getRaceWeather, windFactor, heatFactor, heatPowerFactor } from "@/lib/weather";

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
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.athleteProfile.findUnique({ where: { userId: user.id } });

  // PMC from 90 days of completed training
  const since90 = new Date(Date.now() - 90 * 86400000);
  const completed = await prisma.workout.findMany({
    where: { userId: user.id, completed: true, date: { gte: since90 } },
    orderBy: { date: "asc" },
  });
  const ftp = profile?.ftp ?? null;
  const lthr = profile?.lthr ?? null;
  const pmc = computePmc(
    completed.map((w) => ({
      date: w.date,
      tssInput: {
        durationMin: w.durationMin, avgPower: w.avgPower, avgHr: w.avgHr,
        rpe: w.rpe, intensity: w.intensity, tss: w.tss, ftp, lthr,
      },
    })),
  );

  const url = new URL(req.url);
  const raceId = url.searchParams.get("id");
  const distanceParam = url.searchParams.get("distance");

  let race: any = null;
  if (raceId) {
    race = await prisma.race.findFirst({ where: { id: raceId, userId: user.id } });
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

  const forecast = forecastRace({
    athlete,
    fitness: pmc,
    distance: distance as string,
    venue: {
      targetTempC: race?.targetTempC ?? undefined,
      humidity: race?.humidity ?? undefined,
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

  // ---- Live race-day weather (Open-Meteo, hourly at the venue) ----
  // Overrides any manual temperature with the real feels-like forecast and
  // applies the wind penalty to the bike leg. Only within the 16-day window.
  let weather: any = null;
  if (forecast && race?.lat != null && race?.lng != null) {
    const raceDate = new Date(race.date);
    const daysAway = (raceDate.getTime() - Date.now()) / 86400000;
    if (daysAway <= 16) {
      const startHour = race.startTime ? Number(String(race.startTime).slice(0, 2)) : 7;
      const w = await getRaceWeather(race.lat, race.lng, raceDate, isNaN(startHour) ? 7 : startHour);
      if (w) {
        weather = w;
        // Heat: adjust each land segment (swim is water-temp driven).
        for (const seg of forecast.segments) {
          if (seg.sport === "run") seg.timeMin = Math.round(seg.timeMin * heatFactor(w.feelsLikeC) * 10) / 10;
          if (seg.sport === "bike") seg.timeMin = Math.round(seg.timeMin * windFactor(w.windKph) * heatPowerFactor(w.feelsLikeC) * 10) / 10;
        }
        const transitions = forecast.transitionsMin || 0;
        forecast.totalMin = Math.round((forecast.segments.reduce((a, seg) => a + seg.timeMin, 0) + transitions) * 10) / 10;
        if (forecast.goalTimeMin != null) forecast.goalDeltaMin = Math.round((forecast.totalMin - forecast.goalTimeMin) * 10) / 10;
        forecast.note = ((forecast.note ? forecast.note + " " : "") + `Live weather ${w.hourlyMatched.slice(0, 16).replace("T", " ")}: ${w.tempC}°C (feels ${w.feelsLikeC}°C), wind ${w.windKph}km/h, ${w.condition} — heat and wind adjustments applied (TrainingPeaks / J Appl Physiol 2024).`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    forecast,
    weather,
    distance,
    race: race ? { id: race.id, name: race.name, distance: race.distance, date: race.date, priority: race.priority, goalTimeMin: race.goalTimeMin ?? null, resultMin: race.resultMin ?? null, predictionErrorPct: (race.resultMin != null && forecast?.totalMin) ? Math.round(((forecast.totalMin - race.resultMin) / race.resultMin) * 1000) / 10 : null } : null,
    pmc: pmc ? { ctl: pmc.current.ctl, atl: pmc.current.atl, tsb: pmc.current.tsb, formZone: pmc.formZone, rampRate7d: pmc.rampRate7d } : null,
    physiology: { ftp, lthr, runPaceBase: profile?.runPaceBase ?? null, swimPaceBase: profile?.swimPaceBase ?? null },
  });
}
