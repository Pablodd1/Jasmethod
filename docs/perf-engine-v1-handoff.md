# perf-engine v1 + v2 — handoff (2026-11-02)

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
- `npm test` (after v2): 2,244/2,245 pass. The one failure (`sync-pilot-isolation.test.ts` "50 synthetic athletes … WHOOP lifecycle") **fails on the untouched baseline too** in this sandbox (prisma engine binary unavailable). Not caused by this change.
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

## v2 — goal × phase periodization, quality caps, structured detail, chat (commit 3)

**Principle: quality over quantity.** The engine decides *which* stimulus fits the athlete's race, sport, cycle phase and level, and *how much* of it (dose). Unused time is not filled with more intervals: a key session ends early instead.

| Area | File | Change |
|---|---|---|
| Periodization (new, pure) | `src/lib/periodization.ts` | `goalFamily` (short/middle/long/ultra/hyrox), `resolvePhase` (base/build/specific/taper/race/recovery from coaching phase, race date, week index), `qualityFor` (goal × phase matrix, rotation, time window, level), `doseScale`/`repsFor` (level × within-phase progression × phase), `taperVolumeFactor`, `narrativeFor` (purpose/science/cues/stop rule, en+es), `trainingIdeas` |
| Engine | `src/lib/performance-engine.ts` | New kinds `vo2-long`, `race-pace`, `taper-primer`. `selectStimulus({ plan })` applies goal/phase/level on PUSH days; in taper/race week a planned key session becomes a **taper primer** (keep intensity, cut volume). Builder honors `reps`, ends early (pads at most 10 min), and never pads taper primers. `decidePerformance({ quality })` adds the polarized guard |
| Prescription | `src/lib/adaptive.ts` | `DailyPrescription.engine` = kind, phase, family, readiness, ACWR, HRV Z, pivot, est. TSS, purpose, science, cues, stop rule (+ `es`). Step `note` carries the cue for each set |
| Check-in | `src/app/api/checkin/route.ts` | Reads plan `distance`/`level`/`startDate`/`raceDate` (falls back to profile). Builds `PlanContext` per session. Looks one day ahead for planned key sessions. Ergogenics: race-pace in the specific phase = race rehearsal (opted-in aids only); none on aerobic or taper engine sessions |
| Today UI | `src/app/today/page.tsx` | "Why this session" panel (phase, goal family, readiness/ACWR/HRV/TSS/pivot chips, cues, stop rule, citation) above the existing sparkline and step cards. Unknown values render `—`. Hidden on held/rest days |
| Coach route | `src/app/api/coach/route.ts` | Fuel g/h now uses the canonical `fueling.carbsPerHourFor` (single source of truth); pivot read from `prescription.engine` |
| Chat | `src/lib/coach-conversation.ts`, `coach-conversation-service.ts` | New local intents: `training-ideas` (goal + phase from the message), `training-ideas-clarify`, `engine-explain` (generic rules, points to Today for personal numbers). New profile settings via the existing propose → confirm flow: `hasSmartTrainer`, `bikeType` (enable bike pivots). All after the safety rules |
| Tests | `src/lib/periodization.test.ts` | 7 tests: families/phases, matrix choices, dose/progression/taper factor, quality-over-quantity, polarized guard, taper primer, chat intents + equipment proposals |

### Goal × phase matrix (PUSH / key-session stimulus; rotates by day)
| Family (goals) | Base | Build | Specific | Taper / race week |
|---|---|---|---|---|
| short (5k, sprint tri, track) | threshold, slow VO2 | **fast VO2 (30/15)**, slow VO2, threshold | race pace (1 km @ 5k), fast VO2 | taper primer |
| middle (10k, Olympic, half marathon, run/bike/swim-only) | sweet spot, threshold | threshold, slow VO2 | race pace (8 min @ 10k/Olympic), threshold, fast VO2 | taper primer |
| long (70.3, marathon) | durability, sweet spot | threshold, sweet spot, slow VO2 | race pace (15 min blocks), durability | taper primer |
| ultra (Ironman) | durability | sweet spot, durability, threshold | race pace (30 min blocks), durability | taper primer |
| hyrox | threshold, neuromuscular | compromised, slow VO2, neuromuscular | compromised, race pace | taper primer |

Overrides: window under 45 min → fast VO2 (short/middle) or over-unders (long/ultra); beginners → threshold instead of VO2/neuromuscular; durability only with more than 90 min.

### Dose and progression
`doseScale = level (beginner 0.6, amateur 0.8, advanced 1.0, pro 1.15) × (1 + 0.08 × (weekInPhase − 1), max +24%) × phase (taper 0.5, race 0.35, recovery 0.6) × 0.85 if chronic sRPE < 1200/wk`. Reference reps at 1.0: fast VO2 3 sets, slow VO2 5 × 4 min, threshold 3 × 10 min, sweet spot 3 × 12–15 min, race pace 5 blocks (capped per family), durability 2 late blocks, taper primer 5 × 90 s.

### Polarized / quality guard (PUSH blocked when any is true)
- Taper, race or recovery phase.
- A key session (Z4+, interval/threshold, or RPE ≥ 7) in the last 36 h: no back-to-back hard days.
- When upgrading a planned *easy* day: already at the cap of key sessions in 7 days (beginner 2, others 3), or a key session is planned tomorrow.

### Taper science
Bosquet 2007 / Mujika: cut volume 41–60% over 8–14 days, keep intensity, keep frequency at 80% or more. **Plan volume** is already reduced by `training-cycle.ts` / `cycle-events.ts`, so the daily engine never multiplies a second taper. It only (a) blocks overload, (b) turns planned key sessions into short race-pace primers, and (c) never pads them. Taper length: short 8 d, middle 10, long 14, ultra 14, hyrox 10.

### Additional open tasks for Codex (v2)
9. **Coach-set phase:** `PlanDay` has no phase column. Phase comes from `session.coaching.phase`, then race date, then `weekIndex % 6`. Consider persisting the cycle phase per week.
10. **Per-athlete PUSH opt-in:** today only the `ADAPTIVE_PUSH_ENABLED` env flag. Add an athlete/coach setting (planning-setup JSON or profile column) plus a chat proposal field.
11. **Pool access:** there is no profile field, so swim pivots only happen when swim appears in plan history or `swimPaceBase` is set. Add `hasPoolAccess` and a chat extraction phrase.
12. **i18n:** narratives exist in en/es only. ht/fr/ru fall back to English.
13. **Canonical/FIT export:** confirm engine step names, notes and groups pass `canonical-session` validation and the FIT note limit (≤180 bytes per companion instruction) on a real device export.
14. **Weekly view:** show the key-session count and polarized split (Z1–2 vs Z3+) per week in the training-cycle overview.

## AI model recommendation
**Primary: OpenAI `gpt-6-luna`** via the existing direct-OpenAI path (`OPENAI_COACH_MODEL=gpt-6-luna`).
- List price $0.10 / 1M input, $0.50 / 1M output, $0.01 cached input (OpenAI pricing, Sept 2026). Supports structured output.
- Per briefing: ~250 input + ≤300 output tokens ≈ **$0.0002**, so about $0.18/day for 1,000 athletes. The system skill is a byte-identical prefix, so caching applies once prompts pass the provider's cache minimum.
- The repo, consent copy and AI-data policy already name OpenAI as the only external provider, so this needs no new data-processing review.

**Alternative: Anthropic `claude-haiku-5-5`**: same list price ($0.10 / $0.50 for prompts ≤100K tokens). Only adopt it after adding a separate provider module, named consent copy and an `ai-data-policy` test; the current policy rejects non-OpenAI providers by design.

**Do not use:** Gemini or DeepSeek (retired in `ai-data-policy.test.ts`), or any flagship model (no quality gain for a 4-field narration of a deterministic plan).

**Regardless of model:** Strava-derived context must never be sent (Strava API Agreement). `getScienceBriefing` enforces this together with the route-level `eligible` check.
