# Release notes, owner actions, deployment and rollback

Branch `feat/jmm-connectivity-smart-coach` (stacked on `fix/jmm-p1-onboarding-diagnostics`), 2026-10-20, verified against
base commit `5462742`. **Nothing here is deployed.** No OAuth/security setting was changed, no credential was created or
tested, no real athlete message was sent, no database migration was applied. Details: `docs/strava-and-provider-limits.md`
(providers, importers, Strava) and `docs/smart-coach-pilot.md` (coach pilot, analysis, stream policy).

## What changed for athletes

1. **One setup screen, two independent sections** ("Import my training" / "Receive my plan") on `/connectors`. Every
   source shows four separate statuses: authorization, import, publication, device delivery. Nothing is mandatory.
   Unknown (could not load) is shown as unknown, never as "none" or 0.
2. **File import.** TCX (real XML parser), Garmin `Activities.csv` (English headers) and FIT activity files (Garmin's
   SDK). ZIP is refused with an explanation. Streams (second-by-second data) are stored **only** if the operator enabled
   the flag **and** the athlete ticks consent on that upload.
3. **Strava-origin data is kept out of JMM's AI and derived analytics**, including when it arrives through Intervals.icu
   or a Strava-exported file. Unknown origin is treated like Strava.
4. **Interval edits in chat** on the day's workout (run/bike, time-based steps): preview, then save; saving clears the
   approval; an increase needs a second explicit confirmation; the latest edit can be undone.
5. **Activity analysis and a next-workout proposal** from stored streams (NP/IF/TSS, hard efforts, decoupling), shown
   inside the day's editor; never applied automatically.

### Behavior changes athletes will notice (importers)

| Before | Now |
|---|---|
| Walking and hiking rows in `Activities.csv` were stored as running | Not imported; listed in the result as unsupported types |
| TCX duration of a one-point file was an invented 1 minute; only the first lap's calories were counted | Duration = lap timer time; all laps' calories summed |
| Non-English `Activities.csv` silently imported 0 rows | Refused with instructions to export with English column names |
| `54,09` (decimal comma) was read as 5409 | Stored as unknown |
| Dates were interpreted in the server's timezone (early-morning rides could land on the previous day) | Athlete's timezone |
| Wrong calories, duration or dates in already-stored rows stayed wrong | Re-importing the same file corrects them: same `externalId`, so it updates in place and does not duplicate |
| A file exported from Strava was recorded as "garmin" | Recorded as `tcx`/`fit` with a Strava-origin note and restricted |

## Verification summary (PASS / FAIL / BLOCKED)

| Area | Result | Evidence |
|---|---|---|
| Unit suite (with an out-of-repo Prisma stub) | **PASS** | 213 files pass (200 baseline + 13 new, 158 new tests). The same 9 files / 80 tests fail as before any change; all need a real database |
| Route-level smoke, two athletes, in-memory fake DB | **PASS** | `smart-coach-route-smoke.test.ts` 16/16: isolation, consent/flag/provenance gates, deletion, expiry, error tolerance |
| Chromium UI smoke (real Next dev server, real components, synthetic API responses) | **PASS** | 32/32 checks, 0 page errors; desktop EN, mobile 390x844 ES; no horizontal overflow; consent box unchecked by default; `streamConsent` sent only when ticked; edits bind to the card's revision and never send client-side steps |
| Migration SQL on a throwaway local PostgreSQL 16 | **PASS** (SQL only) | applies; unique(workoutId), FK to User/Workout, cascade deletes, RLS on, `DROP TABLE` rollback |
| Differential `tsc` vs the P1 head | **PASS with note** | one extra TS7006 in `api/onboard/import-review/route.ts` (`bySource.map(s => ...)`), same class as the 196 existing errors caused by the missing generated Prisma client |
| `npm run lint` | **PASS** | identical to baseline (two existing warnings in files not touched) |
| Prisma `validate` / `generate` | **BLOCKED** | engine download returns 403 in this environment; schema and migration validated by inspection and the SQL check above only |
| Real-database behavior (serializable transactions, advisory locks, `effectivePrescription` routes, email/Telegram orchestration, Coach flow, two-athlete end to end) | **BLOCKED** | needs a database; pure cores are unit-tested; orchestration was never run |
| COROS adapter completion | **BLOCKED** | needs provider registration/credentials (not created); see owner actions |
| Live provider behavior (Google, Strava, Intervals, COROS, Garmin, real devices) | **NOT TESTED** | no credentials used; authorization or a local build alone is not end-to-end proof |
| Safari crash | **Not reproduced** | unchanged since Priority 1; the error boundary only improves diagnostics |

The UI smoke replaced server answers with synthetic ones, so it proves rendering and request wiring, not server logic.
Server logic is covered by the unit and route-level tests above.

## Feature flags and defaults

| Flag | Default | Effect |
|---|---|---|
| `ENABLE_ACTIVITY_STREAMS` | off | Without it nothing second-by-second is stored, no consent box appears, analysis/proposal routes return "nothing to analyse". Deleting stored streams works either way |
| `ACTIVITY_STREAM_RETENTION_DAYS` | 180 (max 365) | Expiry applied at read time; deletion by `purgeExpired` (not scheduled) |

With the flag off, the only behavior change is the importer corrections in the table above and the new setup screen.

## Owner actions (exact, in order)

1. **Review the branch** and decide whether to merge `fix/jmm-p1-onboarding-diagnostics` first, then
   `feat/jmm-connectivity-smart-coach` (it contains the P1 commits).
2. **Google Cloud Console (still pending from Priority 1):** register the production redirect URI exactly as printed by
   `scripts/check-google-calendar-redirect.ts` (offline checker), save it, then retest the real sign-in. Not changed by
   this work.
3. **Vercel:** set the build-SHA environment variable the diagnostics page reads so the live commit can be confirmed
   (see Priority 1 notes). Preview deployments for the two review branches are **off** in `vercel.json`
   (`git.deploymentEnabled`); remove those entries only when you want a preview.
4. **Credentials file:** a file in the repository was flagged earlier; the decision whether to rotate or purge history
   is yours. Nothing was tested, rotated or rewritten.
5. **Database (only if you want streams):** review and apply
   `prisma/migrations/20261020120000_activity_streams/migration.sql` through your normal migration process, confirm the
   deployed Prisma role can read/write the table, then run `prisma generate` in CI.
6. **Consent and retention text** for second-by-second health data, with counsel; then set
   `ENABLE_ACTIVITY_STREAMS=1`. Schedule `purgeExpired` (for example in the existing worker cron).
7. **Coach sign-off** on the proposal thresholds (`next-workout-suggestion.ts` `THRESHOLDS`) and on the LTHR policy
   (heart-rate zones are not computed in production today because LTHR is never treated as validated).
8. **Legal decision on Strava rows** that still appear in older local load analytics (AI paths already exclude them).
9. **COROS:** choose MCP (OAuth, no approval) or the Partner API (email api@coros.com); registration/credentials are
   yours to create. Until then COROS athletes use TCX/FIT file import.
10. **Request-size check:** the UI allows 40 MB uploads; Vercel serverless request bodies are documented at 4.5 MB.
    Lower the cap or move to direct-to-storage upload after testing a large real file.
11. **Real samples:** a Spanish-language `Activities.csv` and a real Garmin FIT/TCX export are needed to add header
    aliases and confirm device dialects.

## Deployment (when you decide to)

This work does not deploy itself and nothing in the repository was run against production.

1. Merge the reviewed PR(s) to `main` through your normal process (the repo notes mention `npx vercel --prod`; that was
   **not** run).
2. If using streams: apply the migration first (additive, one table), then deploy code, then set the flag last.
3. Smoke on production with a **test athlete account**: open `/connectors` (two sections, statuses), import a small TCX
   with consent unticked (nothing stored), import with consent ticked only after the flag is on, open the day's workout,
   preview a one-interval change, confirm approval was cleared, undo. Send no real athlete messages.

## Rollback

| Layer | How |
|---|---|
| Code | Revert the merge commit (or redeploy the previous Vercel deployment). Importers, setup screen and routes disappear together; no data written by them blocks the old code |
| Streams | Set `ENABLE_ACTIVITY_STREAMS` off (stops storing and reading immediately). Athletes can still delete their data from `/connectors`; remaining rows are inert |
| Migration | `DROP TABLE "ActivityStream";` (data is a derived copy of files the athlete uploaded; nothing else references it). Run only after the code is reverted or the flag is off |
| Re-imported activities | Importer corrections update existing rows in place by `externalId`; the pre-change values are not kept. Restore from your database backup if an exact earlier state is required |
