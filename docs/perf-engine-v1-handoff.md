# perf-engine-v1 — handoff (2026-11-02)

Branch: `feat/perf-engine-v1`. Author: Claude (session with Dr. Jeffrey Draesel Jr.). To be completed by Codex.

## What was done

| Area | File | Change |
|---|---|---|
| Engine (new, pure) | `src/lib/performance-engine.ts` | Wearable normalization, central/peripheral split, sRPE ACWR, verdict + PUSH gates, sport gating, T_avail density builder, est. TSS, plan spacing helper |
| Tests (new) | `src/lib/performance-engine.test.ts` | 19 tests: gates, floors, pivots, exact time fit across sports × kinds × windows, coach contract, provider gating |
| Adaptation | `src/lib/adaptive.ts` | `Adaptation.performance?`, `adaptSessionWithBiometrics()`, `applyPerformance()`, `prescribeToday({ performance })` → `engineOverride()`. Without `performance` the legacy path is byte-for-byte unchanged |
| Check-in | `src/app/api/checkin/route.ts` | Engine runs **after** every existing hold (safety, setup, provenance, reconciliation, daily budget, starter). Skips coach-authored `sportStructure`, protocols, starter sessions. Wrapped in try/catch → legacy on failure |
| Coach | `src/lib/coach.ts` | `CoachTelemetry`, `buildCompactTelemetryDigest` (~130 chars), `SCIENCE_COACH_SKILL` (~190 tokens), `parseScienceReply` (exact keys, ≤180 chars, grounded numbers, banned claims), `localScienceBriefing` (en/es), `getScienceBriefing` (300 output tokens, model allowlist), `carbTargetGPerH`, `COACH_FALLBACK_LANGUAGE` |
| Coach API | `src/app/api/coach/route.ts` | Returns `science` alongside the legacy `briefing`. Reads the decision saved by the check-in; never recomputes |
| Regen | `src/lib/regen.ts` | `alternateFor(..., ctx?)` pivots a hard run to bike/swim when legs are loaded and central is stable |
| HYROX | `src/lib/hyrox.ts` | `compromisedRunSession()` — run/erg + station + flush, gated at readiness ≥70 |
| Plan | `src/lib/plan-auto.ts` | `spaceHighEccentricSessions()` — ≥48 h between high-eccentric sessions |
| Env | `.env.example` | `ADAPTIVE_PUSH_ENABLED="false"` |

### Engine rules (single source of truth: constants in `performance-engine.ts`)
- **Central:** lnRMSSD 7-day rolling (≥4 readings) vs days −60…−8 baseline (≥14 readings), SWC = 0.5 × SD. Same source + RMSSD only. Priority whoop → oura (`aura` normalized) → garmin → apple → manual. Strava never supplies autonomic data. Suppressed if below SWC, acute day ≤ −1.5 SD, or HRV up with RHR > +5.
- **Fallback:** no qualifying baseline → check-in (sleep/energy/stress/mood). Subjective-only central never lowers the verdict (already in the check-in score).
- **Peripheral:** soreness (1–5) + eccentric units over 48 h, linear decay over 72 h. Weights: run/plyo 1, hyrox 0.9, strength 0.7, bike 0.15, swim 0.05.
- **ACWR:** sRPE (minutes × RPE, or zone RPE). `null` if <21 days of history or any unknown duration. **Never defaults to 1.0.**
- **PUSH:** flag on AND check-in `full` AND readiness ≥75 AND ACWR known <1.3 AND central not suppressed AND RPE delta <1.5 AND RHR ≤ +5 AND no pain/illness. Rest/easy/holds are floors.
- **Gating:** run Z4+ needs ≥48 h since high-eccentric work and non-high peripheral load, else bike → swim → run Z2 (never invents a modality). Bike is the metabolic vehicle under moderate soreness. Swim intensity is not gated by leg fatigue. Strength neuromuscular work needs readiness ≥70. HYROX gets compromised intervals (erg instead of run on loaded legs).
- **Density:** steps sum exactly to T_avail. <45 min → Rønnestad 30/15 or over-unders; 45–90 → 4-min VO2 / 10-min threshold / 12-min sweet spot; >90 → Z2 volume + 2×10 min late threshold.

## Verification status
- `npx tsc --noEmit` clean.
- `npm test`: 2,237/2,238 pass. The one failure (`sync-pilot-isolation.test.ts` "50 synthetic athletes … WHOOP lifecycle") **fails on the untouched baseline too** in this sandbox (prisma engine binary unavailable). Not caused by this change.
- **NOT done:** `npm run build`, preview deploy, live probe (AGENTS.md §3 ladder). Prisma client was generated with `--no-engine` here.

## Open tasks for Codex (in priority order)
1. **Build + preview deploy** with `ADAPTIVE_PUSH_ENABLED=true` on preview only. Run a check-in for one athlete with ≥21 days of logged load and a Whoop/Oura baseline; confirm `adaptation.performance` is saved and `prescription.scaled.reason` starts with `Engine`.
2. **UI:** render `science` from `GET /api/coach` (headline, briefing, adaptation, rx_intervals, fuel) in the Today/coach card. Show the AI badge only when `mode === "ai"`. Missing values render as `—` (honest-data doctrine).
3. **Consent wiring:** the client must send `GET /api/coach?aiConsent=openai` only after the athlete's named OpenAI consent (same consent copy as coach conversation). Update `docs/ai-consent-review-*.md` to list the telemetry fields sent.
4. **Plan generator:** call `spaceHighEccentricSessions()` on each generated week in `src/app/api/plan/generate/route.ts` (after `shapeTrainingCycle`, before preview). Check `coaching` metadata still matches the moved sport, and update `generated-cycle-execution` / `training-cycle` tests.
5. **Regen:** `src/lib/regen.ts` has no importers right now. Either wire `alternateFor(..., ctx)` into `src/app/api/workout/regenerate/route.ts` (ctx comes from today's `adaptation.performance`) or delete the dead module.
6. **T_avail from Google Calendar:** today T_avail = min(athlete-reported minutes, daily budget), plus the existing busy ≥6 h → 25 min cap. Compute the largest free window inside the training window from `calendarEvent` busy blocks and pass the min as `timeBudgetMin`.
7. **Model switch:** set `OPENAI_COACH_MODEL=gpt-6-luna` (see below). Verify the `max_completion_tokens` / JSON-mode behavior against OpenAI's live docs before enabling. If OpenAI requires a reasoning-effort setting for structured output, set it to the lowest value in `scienceRequestBody()`.
8. **Coach review:** a coach should sign off on the PUSH thresholds (`PUSH_READINESS`, `PUSH_ACWR_MAX`, `NEUROMUSCULAR_READINESS`, `ECCENTRIC_SPACING_H`) and the neuromuscular step copy before the flag goes on in production.

## AI model recommendation
**Primary: OpenAI `gpt-6-luna`** via the existing direct-OpenAI path (`OPENAI_COACH_MODEL=gpt-6-luna`).
- List price $0.10 / 1M input, $0.50 / 1M output, $0.01 cached input (OpenAI pricing, Sept 2026). Supports structured output.
- Per briefing: ~250 input + ≤300 output tokens ≈ **$0.0002**, so about $0.18/day for 1,000 athletes. The system skill is a byte-identical prefix, so caching applies once prompts pass the provider's cache minimum.
- The repo, consent copy and AI-data policy already name OpenAI as the only external provider, so this needs no new data-processing review.

**Alternative: Anthropic `claude-haiku-5-5`**: same list price ($0.10 / $0.50 for prompts ≤100K tokens). Only adopt it after adding a separate provider module, named consent copy and an `ai-data-policy` test; the current policy rejects non-OpenAI providers by design.

**Do not use:** Gemini or DeepSeek (retired in `ai-data-policy.test.ts`), or any flagship model (no quality gain for a 4-field narration of a deterministic plan).

**Regardless of model:** Strava-derived context must never be sent (Strava API Agreement). `getScienceBriefing` enforces this together with the route-level `eligible` check.
