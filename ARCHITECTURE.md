# JasMiamiMethod — Architecture

One Next.js 14 app (App Router) + Postgres/Supabase (Prisma) + Gemini. No
microservices. This file is the map for any developer (or agent) taking over.

## The daily loop (the product in one line)

login → **/today** (the prescribed session pops, full pre/during/post arc) →
optional **check-in** rewrites the session from biometrics → execute →
calendar. Around it: 5 AM cron syncs devices; evening cron sends tomorrow's
plan via email/Telegram.

## Module map (src/lib — pure functions, no DB unless named)

| Module | Owns |
|---|---|
| `science.ts` | Zones (HR/power/pace), VO2max/HRmax math, periodized plan generators (tri/single/HYROX/boxing), review-dependent optional power slots. Re-exports `reference.ts`. |
| `reference.ts` | DATA, not logic: blood ranges, DNA traits, nutrition consensus, motivation library. |
| `adaptive.ts` | Daily adaptation (check-in → verdict), fuel/ergogenics, temperature/venue adjustments, prescribeToday, progression. |
| `regen.ts` | Workout regeneration: same-sport variants + cross-modality options with a different stimulus (3 max). |
| `hyrox.ts` | 16-segment split planner + weak-station analysis. |
| `raceforecast.ts` | AdvanzedRacing engine (thresholds + PMC + course). |
| `weather.ts` | Open-Meteo race-day forecast + geocoding + heat/wind factors (no API key). |
| `sync.ts` | Per-athlete device sync (shared by button + cron) + admin failure alerts. |
| `coach.ts` / `assistant` API | JASAI daily briefing + Q&A (Gemini, athlete-grounded, localized fallback). |
| `importers.ts` | Strava OAuth + Garmin CSV/TCX + Apple Health + Whoop parsers. |
| `fitness.ts` | TSS estimation, PMC (CTL/ATL/TSB), execution score. |

## API surface (47 routes — the money paths)

`/api/today` · `/api/checkin` · `/api/plan/generate` · `/api/workout/regenerate`
· `/api/race-forecast` · `/api/hyrox/split-planner` · `/api/assistant` ·
`/api/connectors/sync` · `/api/cron/sync` (5 AM) · `/api/cron/reminders` (hourly)
· `/api/auth/*` (incl. self-provisioning `/api/auth/demo` for one-tap testers)

## Invariants — never break these

1. Every query filters by the session's `userId` (per-athlete isolation).
2. Regeneration preserves the session GOAL (zone/duration) — max 3.
3. Plyometrics 1-2×/week in every generated plan.
4. RLS stays ON for all public tables (app connects as table owner).
5. i18n: user language first, es fallback (Miami default), then en.

## Testing

- Unit (pure libs): `npx tsx src/lib/*.test.ts` (adaptive, fitness, i18n, regen, hyrox)
- Money-path API smoke (needs app running): `node scripts/api-smoke.cjs [base] [email] [pw]`

## Scripts (pruned set)

| Script | Purpose |
|---|---|
| `api-smoke.cjs` | 14-check money-path smoke test |
| `import-garmin-csv.cjs` | Bulk-load a Garmin Activities.csv for one athlete |
| `geocode-races.ts` | Backfill venue lat/lng for weather |
| `fix-duplicate-plan-days.cjs` | One-time repair for pre-fix plans (dry-run default) |
| `plyo-check.ts` | Legacy schedule diagnostic; slot/keyword counts do not verify movement eligibility |
| `setup-supabase.ts` | One-shot DB wiring |

## Known deferred debts (documented, deliberate)

- OAuth tokens stored plaintext (MVP testers only — must encrypt pre-launch)
- Login rate limiting missing (same constraint)
- AI briefing cache is in-memory (per-instance)
- Garmin direct push blocked on Garmin's paused developer program (Strava
  bridge + .FIT export are the live paths)
