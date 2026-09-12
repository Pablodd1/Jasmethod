import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { buildForecastBundle } from "@/lib/race-forecast-service";
import { buildRaceBrief, briefWriterSystemPrompt, briefWriterUserPrompt } from "@/lib/race-brief";
import { geminiAnswer, geminiGenerationConfig } from "@/lib/gemini-response";

// GET /api/race-forecast/brief — the full race-plan narrative.
//
// The deterministic engine produces every number; this endpoint turns the
// forecast JSON into the coach-voice brief. With GEMINI_API_KEY set, Gemini
// rewrites the template under a strict contract (no new numbers — see
// race-brief.ts); without a key the deterministic template is returned, so
// the feature never depends on an external service.
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
    return NextResponse.json({ ok: false, reason: "not_forecastable", distance: bundle.distance }, { status: 200 });

  const ctx = {
    raceName: bundle.race?.name ?? null,
    dateISO: bundle.race?.date?.toISOString?.() ?? null,
    daysAway: bundle.race?.date ? (bundle.race.date.getTime() - Date.now()) / 86400000 : null,
    weather: bundle.weather,
  };

  const template = buildRaceBrief(bundle.forecast, ctx);
  const key = process.env.GEMINI_API_KEY;
  let narrative = template;
  let source: "gemini" | "template" = "template";

  if (key) {
    try {
      const model = process.env.GEMINI_MODEL || "gemini-3.6-flash";
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: briefWriterSystemPrompt() }] },
            contents: [{ role: "user", parts: [{ text: briefWriterUserPrompt(bundle.forecast, ctx) }] }],
            generationConfig: geminiGenerationConfig(model),
          }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        const answer = geminiAnswer(data);
        if (answer) {
          narrative = answer;
          source = "gemini";
        }
      }
    } catch {
      // fall through to the deterministic template
    }
  }

  return NextResponse.json({
    ok: true,
    source,
    brief: narrative,
    template, // always include the deterministic version for auditability
    forecast: bundle.forecast,
    race: bundle.race,
    weather: bundle.weather,
  });
}
