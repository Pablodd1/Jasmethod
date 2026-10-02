import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildForecastBundle } from "@/lib/race-forecast-service";
import { buildRaceBrief } from "@/lib/race-brief";

// GET /api/race-forecast/brief — the full race-plan narrative.
//
// The deterministic engine produces every number; this endpoint turns the
// forecast JSON into a local template. External rewriting is disabled until
// source-level data eligibility is implemented.
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

  if (!bundle.forecast)
    return NextResponse.json({ ok: false, reason: bundle.reason ?? "not_forecastable", message: bundle.message, distance: bundle.distance }, { status: 200 });

  const ctx = {
    raceName: bundle.race?.name ?? null,
    dateISO: bundle.race?.date?.toISOString?.() ?? null,
    daysAway: bundle.race?.date ? (bundle.race.date.getTime() - Date.now()) / 86400000 : null,
    weather: bundle.weather,
  };

  const template = buildRaceBrief(bundle.forecast, ctx);
  // Forecasts can contain restricted provider-derived data. Keep this local
  // until a source-level eligibility boundary exists; operator AI flags alone
  // do not authorize sending these values to an external model.
  const narrative = template;
  const source = "template";

  return NextResponse.json({
    ok: true,
    source,
    externalAI: false,
    brief: narrative,
    template, // always include the deterministic version for auditability
    forecast: bundle.forecast,
    race: bundle.race,
    weather: bundle.weather,
  });
}
