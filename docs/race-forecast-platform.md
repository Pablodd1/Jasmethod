> Historical design proposal, superseded for current runtime behavior. Personalized forecasts described below remain disabled. See [current race scenario workspace](race-scenario-workspace.md) for the implemented experimental execution tool and explicit limits. Do not treat this old roadmap as release approval.

# Race Forecast Platform — Architecture & Roadmap

_Adjudicated build — September 8, 2026. Every model constant in the engine
follows the adjudication report's Safe Constants table, and the production
directive is enforced in code: no unsourced number ships without a
`TUNED_DEFAULT` / `UNVERIFIED` flag._

---

## 1. What the platform is

A race-prediction and strategy engine for triathlon (and single-sport swim /
bike / run / HYROX) that answers, for your next race:

- **Power & speed** — physics-solved bike speed from your sustainable watts
  against gravity, rolling resistance, aerodynamic drag (altitude- and
  temperature-corrected air density), and wind.
- **Threshold & duration** — how much of your FTP/threshold pace you can hold
  for how long (IF bands by distance, Riegel fatigue, transition penalty).
- **Environment** — WBGT heat model, Wehrlin altitude loss, dew-point
  advisories, wind, water temperature, open-water penalties.
- **Fueling & calories** — carbs/fluid/sodium per hour, total intake calories
  vs estimated total burn, caffeine dosing, a concrete minute-by-minute
  fueling timeline.
- **Compliance & safety** — federation-specific wetsuit legality with
  citations and a standing "verify the current rulebook" warning.
- **Scenarios** — best / expected / worst weather band, not a single number.
- **Provenance** — every constant carries its source and flag; the UI and the
  AI brief surface it.

## 2. Engine modules (this codebase)

| Module | Role |
| --- | --- |
| `src/lib/forecast-constants.ts` | Provenance-flagged constants registry + the 7 REJECTED_CLAIMS (fabricated numbers that must never return) |
| `src/lib/weather.ts` | Open-Meteo fetch (temp/RH/wind/solar/cloud), WBGT (`0.7·Tw + 0.2·Tg + 0.1·Td`), heat penalty curves, air density |
| `src/lib/fitness.ts` | PMC (CTL/ATL/TSB), Wehrlin-linear altitude factor, TSS estimation |
| `src/lib/wetsuit.ts` | USAT / World Triathlon / British Triathlon / Ironman legality bands (age-group vs elite) |
| `src/lib/race-fuel.ts` | Carb/fluid/sodium bands, kcal, caffeine, fueling timeline |
| `src/lib/raceforecast.ts` | Orchestrator: physics solve, Riegel, drafting, scenarios, provenance surfacing |
| `src/lib/race-forecast-service.ts` | DB + profile + live weather → engine input (shared by API + brief) |
| `src/lib/race-brief.ts` | Deterministic race-plan brief + the LLM writer contract |
| `src/app/api/race-forecast` | Forecast JSON API |
| `src/app/api/race-forecast/brief` | Narrative brief (Gemini when `GEMINI_API_KEY` set; deterministic template otherwise) |
| `src/app/races/forecast` | UI: headline, scenarios, conditions, wetsuit verdict, calories, timeline |

## 3. The AI architecture (the part that was missing)

The adjudication's core lesson: **fluency is not fact**. So AI never supplies
numbers — it supplies language and cross-checks:

1. **Engine writes numbers, LLM writes prose.** `/api/race-forecast/brief`
   sends the forecast JSON to the model with a hard contract
   (`briefWriterSystemPrompt`): use only JSON numbers, never invent values,
   keep every "verify" warning, and never emit any of the REJECTED_CLAIMS.
   No API key? The deterministic template brief ships instead — the feature
   never depends on an external service.
2. **Multi-model adjudication pipeline (roadmap, see §5).** When other models
   propose numbers ("1% per 1000 ft", "38% drafting savings"), they are
   diffed against the constants registry and auto-flagged against
   REJECTED_CLAIMS. Adjudicated winners become new `TUNED_DEFAULT` rows with
   citations — the registry is the institution's memory.

## 4. What to do next (in order)

**Phase 1 — this week (no new infra):**
1. Set `GEMINI_API_KEY` (+ optional `GEMINI_MODEL`) in `.env` so the brief
   uses AI prose; without it the template brief still works.
2. Save your A-race in **Races** with venue fields (lat/lng geocode happens
   from the location string; set `waterTempC`, terrain, elevation). The
   forecast then pulls the real 16-day Open-Meteo forecast at your start hour
   and computes WBGT automatically.
3. Log benchmark results (FTP / CSS / 5k) after each test — the forecast's
   confidence and `predictionErrorPct` tracking learn from every race you log
   a `resultMin` for.

**Phase 2 — measurement (makes it YOUR plan):**
4. Measure sweat rate (weigh in/out around a hard hour) and sweat sodium
   (patch test); pass them via the `sweatRateMlH` / `sodiumMgPerL` params
   (UI fields → roadmap §5c) — the fuel plan switches from population
   defaults to your numbers.
5. Field-test CdA (two identical run-ups at different speeds, or a
   velodrome/YMF test) — it's the biggest single bike-lever; the engine
   currently assumes 0.28 m².
6. After your next race, tune the Riegel exponent `b` and the drafting skill
   from what actually happened (forecast → actual delta).

**Phase 3 — integrations (connect to everything):**
- **Garmin / Strava / COROS / Whoop / Oura** — connectors are already
  scaffolded (`src/app/api/connectors`, OAuth in `src/lib/oauth.ts`, Terra
  fallback). Complete the sync so PMC and benchmark detection are automatic.
- **Course ingestion** — GPX upload per race leg → per-segment physics solve
  (real grades, corners → the `wind_loop_headwind_fraction` heuristic gets
  replaced by bearing-aware wind), plus turn density for free-speed
  estimates.
- **Elevation + venue enrichment** — Open-Elevation/Mapbox for `baseElevM`,
  water-temp history APIs for `waterTempC` guesses before race week.
- **Persistence** — move forecast requests + snapshots into Postgres
  (Supabase) so you get forecast-vs-actual learning curves over time.

**Phase 4 — intelligence:**
7. Live re-forecast: a cron (the app already has `/api/cron`) re-runs the
   forecast 7/3/1 days out as the weather forecast sharpens, and pushes the
   delta (Telegram bot is already wired).
8. Multi-model adjudication service: N frontier models propose constants;
   the adjudicator (rubric: factual accuracy, traceability, production
   safety, uncertainty handling) scores them; winners enter
   `forecast-constants.ts` with citations. This formalizes the exact process
   that produced the report this build implements.
9. Race-day "replan" mode: live position + HR/power feed → remaining-course
   re-solve ("you're 4 min up, hold IF 0.74, not 0.78").

## 5. Known tunables (start conservative, tune from your data)

| Constant | Ships as | Where to tune |
| --- | --- | --- |
| `CdA` | 0.28 m² TUNED_DEFAULT | `raceforecast.ts` bike physics (or per-athlete field) |
| Riegel `b` | 1.06 TUNED_DEFAULT | `riegelPace()` |
| Heat curves | anchor curves HEURISTIC | `weather.ts` (`runHeatPaceFactor`, `bikeHeatPowerFactorFromWbgt`) |
| Altitude %/1000ft | 4.4 TUNED_DEFAULT (Wehrlin figure flagged UNVERIFIED-exact) | `forecast-constants.ts` |
| Drafting save | 0–15% cap, 0.4 time transmission | `forecast-constants.ts` |
| Wetsuit speed benefit | 3% | `forecast-constants.ts` |
| Carbs/fluid/sodium | labeled defaults | pass `gutTrained`, `sweatRateMlH`, `sodiumMgPerL` |

## 6. Verification

```bash
npm test                      # 26 suites incl. raceforecast.test.ts
npx tsx src/lib/raceforecast.test.ts   # engine-specific checks
npx tsc --noEmit              # clean
```

The engine tests assert the adjudication's headline corrections directly:
WBGT elevated in hot/humid sun and black-flag >28°C, 5,000 ft ≈ 20%+ power
loss, USAT wetsuit forbidden ≥28.9°C but only no-awards 25.6–28.9°C, World
Triathlon elite cutoff 20°C, British 60+/long-swim 24.6°C nuance, drafting
gain capped ≈6% time, wind slowing the physics solve, monotone heat curves,
fuel bands 60–90/90–120 g/h, kcal = g×4, and scenario ordering
(best ≤ expected ≤ worst).
