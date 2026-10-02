import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildForecastBundle } from "@/lib/race-forecast-service";
import { classifyDistance } from "@/lib/raceforecast";

// GET /api/race-forecast?distance=half&id=<raceId>
//                       &federation=USAT&category=age_group
//                       &sweatRateMlH=900&sodiumMgPerL=800&gutTrained=1
//                       &draftSkill=mixed
//
// Adjudicated race prediction (2026-09-08): baseline thresholds + PMC fitness
// (CTL/TSB) + WBGT heat model + Wehrlin altitude + federation wetsuit rules +
// wind-aware bike physics + fueling/calories + best/expected/worst scenarios.
// Every model constant ships with a provenance flag (see forecast-constants).
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const num = (k: string) => {
    const v = url.searchParams.get(k);
    return v != null && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null;
  };

  const bundle = await buildForecastBundle(user.id, {
    distance: url.searchParams.get("distance"),
    raceId: url.searchParams.get("id"),
    timezone: user.timezone,
    federation: url.searchParams.get("federation"),
    category: url.searchParams.get("category"),
    sweatRateMlH: num("sweatRateMlH"),
    sodiumMgPerL: num("sodiumMgPerL"),
    gutTrained: url.searchParams.get("gutTrained") == null ? null : url.searchParams.get("gutTrained") === "1",
    draftSkill: url.searchParams.get("draftSkill"),
    age: num("age"),
  });

  if (bundle.reason) return NextResponse.json(bundle);

  if (!bundle.distance || !classifyDistance(bundle.distance)) {
    return NextResponse.json({
      ok: true,
      forecast: null,
      reason: "not_forecastable",
      distance: bundle.distance,
      pmc: bundle.pmc,
    });
  }

  return NextResponse.json({
    ok: true,
    forecast: bundle.forecast,
    weather: bundle.weather,
    distance: bundle.distance,
    race: bundle.race,
    pmc: bundle.pmc,
    physiology: bundle.physiology,
  });
}
