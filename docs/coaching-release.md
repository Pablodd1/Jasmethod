# Coaching workspace and reliability release

Implemented on `codex/reliable-coaching-admin`, based on `4d9032652019325560499ad5bcac1d55451d2e1d`.

## What the administrator can do

Sign in with a normal account assigned the `admin` role, then open `/admin`. The coaching desk lists all accounts, including administrators, with search and pagination. Each athlete has a dedicated workspace:

- Overview: training totals, plan fulfillment, measured-data coverage, daily training chart, connection status and explanatory decision notes.
- Training: review sessions and feedback, generate a plan, edit individual sessions, move a workout without moving its siblings, and set or restore a day off.
- Profile: update training goals, weekly hours, thresholds, equipment, training window, sex, race date, notes and injury flag.
- Recovery: record athlete-supplied measurements and review metrics and check-ins.
- Records: inspect races, benchmarks, recent nutrition and blood-panel values with supplied units/reference ranges.
- History: inspect recent changes and the account that made each change.

Coaching requests explicitly select an athlete. The administrator keeps their own session; edits use the athlete's validated update paths. Athletes cannot select another account. Both `admin` and the existing `coach` role have access to all athletes. Assignment-based permissions for separate coaching organizations are not included.

## Reliability changes

Original plan, effective prescription and reported actual duration are separate. Repeated check-ins adapt from the original plan. Undo restores unfinished sessions; completed results remain. Rest has no intervals or FIT export. Completed/partial/skipped feedback records actual minutes, effort and notes. Today's view handles multiple sessions.

Workouts use shared structured steps, exact total durations and capped targets. The FIT writer uses Garmin's SDK. Calendar, training and reminders reuse saved prescriptions. New daily records use the athlete's timezone, including DST. Imported activities are deduplicated under a database lock and matched to a planned session only when the match is unambiguous. Linked planned rows are excluded from actual load totals. Estimated training load decays on days without records, ignores future sessions and honors explicit zero load. Recorded best times no longer project a short activity into a longer-distance record. Race heat adjustment is applied once.

The dashboard loads AI commentary independently of core data and requests a bounded plan window. Authentication has one provider. Navigation separates daily work from advanced tools and makes administration reachable on mobile. The public offline reader displays the last Today snapshot on the same device, with its date and save time. It cannot save changes offline. Logout removes local training snapshots; APIs and authenticated HTML are never cached by the service worker.

## Connections and notifications

- OAuth callbacks validate a one-use, account-bound state cookie. Tokens are never returned in connector JSON. New production tokens require `TOKEN_ENCRYPTION_KEY`.
- Strava imports paginate; initial import covers 30 days. Google imports paginate and reconcile appointments. Published workouts use stable identities and update on renames; removed/rest workouts remove their linked events.
- Oura uses `sleep`, `daily_sleep` and `daily_readiness`. WHOOP v2 recovery is joined to the relevant sleep record. HRV comparisons filter by RMSSD/SDNN type.
- Syncs have a database lease, bounded network timeouts and visible failures. Safe provider reads retry transient failures once. Direct Garmin/COROS integration is not offered; supported files remain available.
- WHOOP webhooks verify their signed body and timestamp. Strava callbacks require a configured secret in the registered callback URL; an optional subscription ID further limits requests.
- Cron routes fail closed without `CRON_SECRET`. Reminder delivery respects enabled channels, records failures and suppresses duplicate daily delivery attempts. Missing SMTP does not count as a sent email. An interrupted pending delivery is not automatically replayed, because the external delivery outcome may be unknown.
- Free one-tap access remains available for the eight original whitelisted athlete accounts. Existing accounts are reused without changing their profile, plans, workouts, metrics or history; a button cannot bypass a password that the athlete has changed. The optional data seed still requires explicit local opt-in.

Provider behavior was checked against [Garmin FIT SDK](https://developer.garmin.com/fit/), [Google Calendar events](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert), [Oura API v2](https://cloud.ouraring.com/v2/docs) and [WHOOP webhooks](https://developer.whoop.com/docs/developing/webhooks/). Provider tests use fixtures. Live OAuth consent, token refresh, real watch import and external delivery still require acceptance tests with configured accounts.

## Deploy and enable Jasmel

1. Configure the deployment's server environment: `DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_APP_URL`, and a strong `TOKEN_ENCRYPTION_KEY`. Add provider credentials, `CRON_SECRET` and delivery settings only for services you intend to enable. Keep secrets in the hosting platform's environment settings.
2. Back up the existing database. On Vercel, a Production build applies pending additive migrations through Prisma before compiling; Preview builds never mutate the production schema. `DATABASE_URL` and `DIRECT_URL` must both be configured for the Production environment. Other hosts should run `npm run db:deploy` as a release step before `npm run build` and `npm start`.
3. The deployment migration promotes an existing `jasmel@jasmiamimethod.com` or `jasmelacosta@gmail.com` account to full administrator without changing its athlete data. Jasmel signs in with the account's normal password; administrator access is deliberately absent from the public one-tap buttons. If neither account exists when the migration runs, create the account with a unique password and run `npm run admin:grant -- exact-account-email@example.com`.
4. Sign in normally and open `/admin`. Confirm the expected athlete list, save a controlled profile/session change and verify its history entry.
5. Register new OAuth callback URLs. For Strava webhook delivery, register `/api/connectors/strava/webhook?key=<STRAVA_WEBHOOK_SECRET>` and configure the verification token. Reconnect accounts whose scopes changed, then test one sync per provider.

No production database, external calendar or deployment was changed directly by this local implementation.

## Verification

- `npm test`: five existing test files plus nine new regression/contract tests, 14 passing test entries. Partial sessions retain actual work without counting as fully fulfilled planned sessions.
- `npm run test:integration`: 44 authenticated HTTP checks against isolated PostgreSQL and a production Next.js server. Covers account isolation, coach edits, plan generation/replacement, repeat adaptation, rest, undo, individual date moves, feedback, sleep/metrics, repeated Apple import and independent FIT decoding.
- `npm run test:sync`: isolated database tests with provider fixtures, covering concurrent import deduplication, plan matching, calendar create/rename/delete and notification preferences/repeat suppression. No external messages were sent.
- `npx tsc --noEmit` and `npm run build` pass. CI now provisions PostgreSQL, applies migrations and runs these checks.
- Browser testing verifies administrator login and an actual profile save. Administrator and athlete pages fit a 390-pixel viewport without horizontal overflow. An offline reload served the saved plan with its date/save timestamp; reconnecting restored the normal app.

These are local results, not production latency measurements or a guarantee that every inherited feature is correct. Legacy date-only records written at server midnight should be inspected on a staging copy before rollout; this release does not guess their original timezone and rewrite history. Daily recovery storage still keeps one summary per athlete/day, so later provider updates can replace populated values; separate per-provider streams are a future improvement. Large Apple exports above 40 MB need a future streaming importer. Automatic activity matching intentionally leaves ambiguous sessions unmatched. Full admin localization, organization-specific coaching assignments, audited editing of all specialized health records, and validation of inherited medical/genetic recommendations remain separate work.
