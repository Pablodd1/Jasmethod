// Run: npx tsx --test src/lib/raceforecast.test.ts
// Adjudicated engine checks (2026-09-08 report) — every test traces to a
// conflict or a safe-constant from the adjudication.
import assert from "node:assert";
import {
  forecastRace, classifyDistance, bikePhysicsSpeedKmh, riegelPace, fmtTime,
} from "./raceforecast";
import { buildRaceBrief, briefWriterSystemPrompt } from "./race-brief";
import { raceFuelPlan, kcalFromBikeKj, fuelTimeline } from "./race-fuel";
import { wetsuitVerdict } from "./wetsuit";
import { wbgtC, wbgtCategory, runHeatPaceFactor, bikeHeatPowerFactorFromWbgt, dewPointC, wetBulbC, airDensity } from "./weather";
import { REJECTED_CLAIMS, allConstants } from "./forecast-constants";

// --- WBGT model (Conflict 2: WBGT, not linear °F+%RH) ---
{
  const w = wbgtC({ tempC: 30, humidity: 70, solarWm2: 800, windKph: 10 });
  assert.ok(w.wbgtC > 26 && w.wbgtC < 33, `hot humid sunny WBGT elevated (got ${w.wbgtC})`);
  const brutal = wbgtC({ tempC: 32, humidity: 80, solarWm2: 900, windKph: 5 });
  assert.ok(brutal.wbgtC > 28, `extreme conditions cross the black-flag line (got ${brutal.wbgtC})`);
  const cool = wbgtC({ tempC: 15, humidity: 50 });
  assert.ok(cool.wbgtC < 17, `cool conditions stay low (got ${cool.wbgtC})`);
  assert.ok(w.wbgtC > cool.wbgtC, "WBGT ordering");
  assert.ok(dewPointC(30, 70) < 30 && dewPointC(30, 70) > 20, "dew point below air temp, above 20 in humid heat");
  assert.ok(Math.abs(wetBulbC(30, 70) - 26.8) < 1.5, `Stull wet-bulb sanity (got ${wetBulbC(30, 70)})`);
  assert.equal(wbgtCategory(28.5).zone, "black_flag");
  assert.equal(wbgtCategory(24).zone, "red_flag");
  assert.equal(wbgtCategory(18).zone, "ok");
  assert.ok(wbgtCategory(27).verify, "ACSM-style bands carry the verify flag");
}

// --- heat curves: monotone, capped, tunable (no universal linear slope) ---
{
  assert.ok(runHeatPaceFactor(15) === 1);
  assert.ok(runHeatPaceFactor(25) > runHeatPaceFactor(20));
  assert.ok(runHeatPaceFactor(31) > runHeatPaceFactor(27));
  assert.ok(runHeatPaceFactor(40) <= 1.18, "run penalty capped at 18%");
  assert.ok(bikeHeatPowerFactorFromWbgt(25) < bikeHeatPowerFactorFromWbgt(20));
  assert.ok(bikeHeatPowerFactorFromWbgt(25) > bikeHeatPowerFactorFromWbgt(31), "bike factor decreases with WBGT");
  assert.ok(bikeHeatPowerFactorFromWbgt(40) >= 0.85, "bike derate capped at 15%");
}

// --- altitude (Conflict 1: Wehrlin-linear ≈4.4%/1000ft, tunable) ---
{
  const alt = forecastRace(
    { athlete: { ftp: 250, runPaceBase: 300 }, fitness: null, distance: "10k", venue: { targetTempC: 18, baseElevM: 1524 } },
  )!;
  const sea = forecastRace(
    { athlete: { ftp: 250, runPaceBase: 300 }, fitness: null, distance: "10k", venue: { targetTempC: 18, baseElevM: 0 } },
  )!;
  assert.ok(alt.totalMin > sea.totalMin, `5,000 ft must be slower than sea level (${alt.totalMin} vs ${sea.totalMin})`);
  assert.ok(alt.factors.some((f) => f.includes("Wehrlin-linear")), "altitude factor cites the model");
}

// --- wetsuit legality by federation (Conflict 5: CRITICAL SAFETY) ---
{
  assert.equal(wetsuitVerdict(30, { federation: "USAT" }).verdict, "forbidden", "USAT ≥28.9°C forbidden");
  assert.equal(wetsuitVerdict(27, { federation: "USAT" }).verdict, "permitted_no_awards", "USAT 78.1–83.9°F no-awards band");
  assert.equal(wetsuitVerdict(20, { federation: "USAT" }).verdict, "permitted");
  assert.equal(wetsuitVerdict(10, { federation: "USAT" }).verdict, "mandatory", "USAT <15.6°C mandatory");
  assert.equal(wetsuitVerdict(20.5, { federation: "WORLD_TRIATHLON", category: "elite" }).verdict, "forbidden", "WT elite >20°C forbidden");
  assert.equal(wetsuitVerdict(23.5, { federation: "BRITISH_TRIATHLON", category: "age_group" }).verdict, "forbidden", "British >22°C forbidden");
  assert.equal(wetsuitVerdict(23.5, { federation: "BRITISH_TRIATHLON", category: "age_group", age: 62 }).verdict, "permitted", "British 60+ band extends to 24.6°C");
  assert.equal(wetsuitVerdict(23.5, { federation: "BRITISH_TRIATHLON", category: "age_group", swimM: 1900 }).verdict, "permitted", "British >1500m swims use 24.6°C");
  const unknown = wetsuitVerdict(23, { federation: "USAT", category: "elite" });
  assert.equal(unknown.verdict, "unknown", "missing federation/category combos never guess");
  assert.ok(unknown.mustVerify, "unknowns carry verify flag");
  const wd = wetsuitVerdict(25, {});
  assert.equal(wd.federation, "USAT", "defaults to USAT");
  assert.ok(wd.mustVerify, "all verdicts carry verify flag");
}

// --- swim drafting (Conflict 6: 0–15%, NOT 20–38%) ---
{
  const good = forecastRace(
    {
      athlete: { ftp: 250, runPaceBase: 300, swimPaceBase: 100, draftSkill: "good" },
      fitness: null, distance: "olympic",
      venue: { targetTempC: 20, humidity: 60, swimVenue: "ocean", waterTempC: 22 },
    },
  )!;
  const none = forecastRace(
    {
      athlete: { ftp: 250, runPaceBase: 300, swimPaceBase: 100, draftSkill: "none" },
      fitness: null, distance: "olympic",
      venue: { targetTempC: 20, humidity: 60, swimVenue: "ocean", waterTempC: 22 },
    },
  )!;
  assert.ok(good.segments[0].timeMin < none.segments[0].timeMin, "drafting is faster");
  const swimGainPct = (none.segments[0].timeMin - good.segments[0].timeMin) / none.segments[0].timeMin;
  assert.ok(swimGainPct > 0.01 && swimGainPct < 0.07, `conservative swim gain ≤ ~6% (got ${(swimGainPct * 100).toFixed(1)}%)`);
}

// --- bike physics: wind + air density inside the solve ---
{
  const calm = bikePhysicsSpeedKmh({ ftp: 250, distanceKm: 40, sustainableW: 200, windKph: 0, tempC: 20 });
  const windy = bikePhysicsSpeedKmh({ ftp: 250, distanceKm: 40, sustainableW: 200, windKph: 30, tempC: 20 });
  assert.ok(windy.speedKmh < calm.speedKmh, `headwind slows (${windy.speedKmh} < ${calm.speedKmh})`);
  const cold = bikePhysicsSpeedKmh({ ftp: 250, distanceKm: 40, sustainableW: 200, windKph: 0, tempC: 5 });
  assert.ok(cold.rho > calm.rho, "cold air is denser");
  assert.ok(calm.rho < 1.225 + 0.02 && calm.rho > 1.15, `sea-level 20°C ρ sane (got ${calm.rho})`);
  assert.ok(airDensity(1500, 20) < airDensity(0, 20), "altitude thins air");
  // 200W, flat, no wind, standard athlete → ~34-37 km/h sanity
  assert.ok(calm.speedKmh > 32 && calm.speedKmh < 39, `physics sanity at 200W (got ${calm.speedKmh})`);
}

// --- scenarios + full triathlon forecast coherence ---
{
  const f = forecastRace(
    {
      athlete: { ftp: 250, runPaceBase: 290, swimPaceBase: 95, weightKg: 75, gutTrained: true, draftSkill: "mixed" },
      fitness: { current: { ctl: 55, atl: 60, tsb: -5 }, formZone: "neutral", rampRate7d: 3, rampWarning: null },
      distance: "half",
      venue: {
        targetTempC: 29, humidity: 78, solarWm2: 750, windKph: 18,
        baseElevM: 5, bikeElevM: 400, bikeTerrain: "rolling",
        runElevM: 60, runTerrain: "flat", swimVenue: "ocean", waterTempC: 27,
        federation: "USAT", category: "age_group",
      },
      goalTimeMin: 285,
    },
  )!;
  assert.ok(f, "half is forecastable");
  const best = f.scenarios!.find((s) => s.label === "best")!;
  const worst = f.scenarios!.find((s) => s.label === "worst")!;
  assert.ok(best.totalMin < f.totalMin, "best beats expected");
  assert.ok(worst.totalMin > f.totalMin, "worst beats expected");
  assert.ok(f.wbgt && f.wbgt.value > 25, "hot humid race → high WBGT");
  assert.equal(f.wetsuit!.verdict, "permitted_no_awards");
  assert.ok(f.factors.some((x) => x.includes("WBGT")), "factors narrate WBGT");
  assert.ok(f.fuelTotal!.carbsGPerHour >= 90 && f.fuelTotal!.carbsGPerHour <= 120, "gut-trained long-course carbs 90–120");
  assert.ok(f.fuelTotal!.totalKcalIntake > 800, "calories computed");
  assert.ok(f.fuelTotal!.estimatedKcalBurned! > 3000, "half burn > 3000 kcal");
  assert.ok(f.fuelTotal!.slots.length >= 5, "fuel timeline concrete");
  assert.ok(f.provenance!.every((p) => p.provenance), "every provenance row has a flag");
  assert.ok(f.measurementGaps.some((g) => g.toLowerCase().includes("sweat")), "sweat-rate default surfaced");
  assert.ok(f.note.includes("slower than your goal"), "goal-gap narrated");
}

// --- Riegel (Conflict 8: b tunable, accuracy labeled) ---
{
  assert.ok(Math.abs(riegelPace(300, 21.1) - 300 * Math.pow(21.1 / 10, 0.06)) < 0.01);
  const half = forecastRace({ athlete: { runPaceBase: 290 }, fitness: null, distance: "half-marathon", venue: { targetTempC: 15, humidity: 50 } })!;
  const fresh = forecastRace({ athlete: { runPaceBase: 290 }, fitness: null, distance: "half-marathon", venue: { targetTempC: 15, humidity: 50 } })!;
  assert.equal(half.totalMin, fresh.totalMin, "deterministic");
  assert.ok(half.totalMin > 85 && half.totalMin < 110, `1h20m 10k runner → sane half (got ${half.totalMin}min)`);
}

// --- fuel + calories (Conflict 10: labeled defaults) ---
{
  const long = raceFuelPlan({ durationMin: 340, gutTrained: false, weightKg: 70 });
  assert.ok(long.carbsGPerHour >= 60 && long.carbsGPerHour <= 90, "long-course default in the 60–90 band");
  assert.equal(long.kcalPerHour, long.carbsGPerHour * 4, "kcal = g × 4");
  assert.ok(long.fluidMlPerHour >= 500 && long.fluidMlPerHour <= 1000, "fluid default band");
  assert.ok(long.sodiumMgPerHour > 300, "sodium computed from mg/L × L/h");
  assert.ok(long.caffeineMg != null && long.caffeineMg === 210, "caffeine 3 mg/kg for 70kg");
  const measured = raceFuelPlan({ durationMin: 340, sweatRateMlH: 1400, sodiumMgPerL: 900, heatFactor: 1.1 });
  assert.equal(measured.fluidMlPerHour, 1540, "measured sweat rate scales, heat applied");
  assert.ok(measured.gaps.length < long.gaps.length, "measured inputs remove gaps");
  const short = raceFuelPlan({ durationMin: 45 });
  assert.equal(short.carbsGPerHour, 0, "under 60 min: water only");
  assert.equal(kcalFromBikeKj(1000), Math.round(1000 / 4.184 / 0.24), "kJ → kcal via gross efficiency");
  const slots = fuelTimeline(long, { discipline: "triathlon", totalMin: 340, transitionMin: 200 });
  assert.ok(slots.some((s) => s.fromMin < 0), "timeline includes pre-race");
}

// --- brief builder (narrative template; numbers only from the engine) ---
{
  const f = forecastRace(
    {
      athlete: { ftp: 250, runPaceBase: 290, swimPaceBase: 95, weightKg: 75 },
      fitness: null, distance: "olympic",
      venue: { targetTempC: 27, humidity: 70, swimVenue: "ocean", waterTempC: 24, federation: "USAT" },
    },
  )!;
  const brief = buildRaceBrief(f, { raceName: "Miami Tri", daysAway: 12 });
  assert.ok(brief.includes("Miami Tri"));
  assert.ok(brief.includes("WBGT"), "brief covers weather");
  assert.ok(brief.includes("Wetsuit call"), "brief surfaces the wetsuit verdict");
  assert.ok(brief.includes("provenance"), "brief carries the provenance footer");
  assert.ok(brief.includes("measure"), "brief lists gaps to measure");
  const sys = briefWriterSystemPrompt();
  assert.ok(sys.includes("ONLY numbers"), "writer contract forbids new numbers");
  assert.ok(sys.includes("20–38%"), "rejected claims are named in the contract");
  assert.equal(REJECTED_CLAIMS.length, 7, "all adjudicated rejections registered");
  assert.ok(allConstants().every((c) => c.provenance && c.citation), "every constant has provenance + citation");
}

// --- misc engine contract ---
{
  assert.equal(classifyDistance("half"), "triathlon");
  assert.equal(classifyDistance("boxing"), null);
  const r = forecastRace({ athlete: {}, fitness: null, distance: "750m", venue: {} })!;
  assert.ok(r.totalMin > 10 && r.totalMin < 25, `750m swim default sane (got ${r.totalMin})`);
  assert.ok(fmtTime(75.2).includes("h"), "fmtTime hours");
}
console.log("✓ raceforecast.test.ts — all assertions passed");
