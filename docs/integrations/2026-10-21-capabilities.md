# Integration evidence and owner actions — 2026-10-21

This is a source and offline-test audit, with a separate read-only deployment check. No athlete records,
credential values, OAuth grants, provider connections or real messages were retrieved or changed. No production
deployment or environment change was made. Provider documentation describes provider capability, not JMM acceptance.

## Actual release state

| Evidence level | Finding |
|---|---|
| Previously reported | Calendar redirect override/checker, obsolete-plan guards, refresh fencing and long-gap history fixes were reported in PR work. Source and the executed tests below confirm the listed code paths. |
| Code inspected | Branch `feat/jmm-connectivity-smart-coach`, starting HEAD `2b519b3d49c1862142e1141d4267e740503a19dd`, plus the committed Oct 21 follow-ups on this branch. The final reviewed head and matching CI evidence are recorded in [PR 68](https://github.com/Pablodd1/Jasmethod/pull/68); this document does not claim a deployment. |
| GitHub checked by coordinating reviewer | PR 67 OPEN, head `31abeabccc8b62f0fd47a4c5b4ca0ce2f2e3e0a2`, based on main; PR 68 OPEN, based on PR 67, updated with this review's isolated commits. Neither is merged. PR 48 is unrelated and was preserved. |
| Production checked afresh | Vercel READY production deployment created `2026-10-20T21:44:58.212Z`, main commit `38c43a44df8744cb877545825a25d83f3cc5511c`, serving `jasmiamimethod.fit`. It is not the feature HEAD. |
| Public metadata only | `GET /api/auth/providers` returned 200 and Google availability `true`. This establishes sign-in configuration availability only; it does not identify the Google client or prove Calendar authorization. |
| Real integration acceptance | Not performed in this audit. New-athlete Google consent/refresh, provider import, actual transport acceptance and watch receipt remain unverified. |

The public website/contact work on main remains separate. Preserve the published booking destination
`https://cal.com/videocall-intro/15-minutes-overview`.

Vercel project environment **names and production targets only** were listed; values were neither pulled nor read.
Presence cannot establish nonempty credentials, an enabled boolean, provider approval, or the deployed build's values.
The Vercel plugin's team scope returned 403; the read-only CLI supplied the deployment metadata and sanitized name list.

| Production name inventory | Present / absent |
|---|---|
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL` present; `GOOGLE_REDIRECT_URI`, `APP_URL` absent. Exact client identity and registered URIs remain owner-only. |
| Intervals | `ENABLE_INTERVALS_CONNECTOR`, `INTERVALS_CLIENT_ID`, `INTERVALS_REDIRECT_URI`, `INTERVALS_WEBHOOK_SECRET`, `ENABLE_INTERVALS_AUTO_PUBLISH`, `TOKEN_ENCRYPTION_KEY` present; `INTERVALS_CLIENT_SECRET` absent. Current branch requires that secret for self-service OAuth. |
| Oura / WHOOP | Each provider's client ID, secret and redirect name present. No token, scope or account validity was tested. |
| Strava | Client ID/secret and webhook configuration names present; new `ENABLE_STRAVA_CONNECTOR` absent. The default-off gate added in this audit is not deployed. |
| COROS / Garmin / Tredict | No COROS configuration names were present. Direct Garmin and Tredict approval/credentials were not established; no active JMM direct adapter is claimed. |
| Email / Telegram | SMTP host/port/secure/user/pass/from, `ENABLE_MANUAL_WORKOUT_EMAIL`, `MANUAL_WORKOUT_EMAIL_ORIGIN`, Telegram token/username/webhook secret, `ENABLE_TELEGRAM_COACHING`, `ENABLE_AUTOMATED_DELIVERY`, `COACHING_TRANSPORT`, `CRON_SECRET` present. Enabled state, verification, consent and live acceptance were not inspected. |

## Capability matrix

All application behavior below refers to the inspected branch, not a claim that the production deployment contains it.

| Integration | Athlete connection and permission | Import and history | Outgoing workout / receipt | Remaining owner acceptance |
|---|---|---|---|---|
| Intervals.icu | Own-account OAuth; no passwords collected. Requires owner app registration/approval, strict server gate, client ID/secret and encryption key. `ACTIVITY:READ`, `WELLNESS:READ`, `CALENDAR:WRITE`. | Permitted original-source activities: sport/date/duration/distance/HR/power/NP/calories; wellness RMSSD and SDNN kept distinct, resting HR, sleep, weight, steps. Strava and unknown upstreams refused. Initial 180 calendar days in 30-day requests. Later reads retain the saved cursor plus correction overlap. | Canonical approved run/bike FIT published to own Intervals calendar; revision-bound provider acknowledgment. Auto publication additionally needs global gate and per-athlete opt-in. `deviceReceived:false`; downstream Garmin setup is separate. | Resolve missing secret name, verify app approval and exact callback, then separate-athlete connect/import/refresh-or-reconnect/webhook/retry/publish/cancel tests. Check forwarding in the athlete's Intervals account and inspect the actual watch. |
| Garmin | Direct callback is disabled (503); no verified JMM developer grant. File upload requires the athlete's own export. | Completed TCX, FIT activity, English Garmin Activities CSV; no direct background history. ZIP refused: extract the FIT first. Direct upload cap 4 MB. Real device dialects remain untested. | Single workout FIT and model-specific manual USB `Garmin/NewFiles` guidance; not Garmin Connect calendar publication or automatic watch receipt. Intervals forwarding is a separate conditional route. | Confirm Garmin program eligibility/approval with Garmin; validate a real device export and workout on a supported model. Do not label a file download “connected” or “delivered.” |
| COROS | Gated public-client OAuth lifecycle exists; `authorized` is distinct from imported/connected. Requires pinned regional issuer, registered client, deployment origin, encryption, PKCE/browser binding. | No normalized activity/wellness ingestion or scheduled COROS import is implemented. TCX/FIT manual activity files are a separate path. | Direct publishing hard-throws `write_disabled`; draft payloads are not a verified wire adapter. Official MCP capability is broader than JMM implementation. No watch receipt. | Choose official MCP versus partner API, register through owner-controlled provider flow, review broad `mcp.tools` scope and revocation limitations; separately implement/accept import and writes. No account/client was created here. |
| Oura | Own-account OAuth with `daily` scope; normal expiring access/rotating refresh credentials. | Daily sleep/readiness documents yield sleep hours/score, RMSSD HRV, resting HR and provider readiness. No workout/session/continuous-HR ingestion. Initial 180 days; retained cursor minus one day for later requests, including gaps over 90 days. | No structured-workout publication and no device-delivery claim. | Verify app/user eligibility, scope, a separate athlete's consent, expiry/rotation/reconnect, populated and missing/stale daily documents. Provider scope availability does not prove every metric exists. |
| Strava | **New ingestion disabled by default**; exact server `ENABLE_STRAVA_CONNECTOR=true` is necessary but insufficient permission. Saved connection/status/history remain. | Existing opt-in importer requests initial 365 days, then retained cursor minus one day, paginated; activity-by-ID events repair older updates. Provenance persists through relays/files. New ingestion is blocked until owner policy review. | No future structured-workout publisher or watch receipt. AI stream/context guards do not resolve legacy analytics or retention below. | Resolve policy/retention/derived-data blockers before considering enablement; do not use Intervals/files or Strava MCP as a workaround. No production flag was changed. |
| Google Calendar | Own-account OAuth `calendar.events`; Google sign-in is a different consent flow. Callback registration is in the exact Google Cloud client. | Upcoming commitments in the current 14-day window; app mirrors excluded from busy-time inference. Generic hourly/manual sync refreshes expired access tokens. | Stable owned event ID and revision-aware PATCH; 409/retry recovery. Unapproved/held/future sessions use provisional placeholders; detailed guidance needs current approval and separate sharing consent. No watch/message-read receipt. | Exact two callbacks below, Calendar API/consent screen checks, new-athlete connect→refresh→disconnect/reconnect, one event across repeated sync; verify owned stale-plan removal and unrelated events retained. |
| Email | Verified signed-in athlete email; explicit purpose/time/quiet-window consent. Server gate plus complete SMTP config and trusted origin. Calendar authorization grants no email consent. | Not an activity importer. Durable outbox, leases, current-session and canonical-revision preflight. | Approved revision's single FIT/graphic and guidance; SMTP acceptance is the strongest implemented transport evidence, not inbox/read/watch receipt. Unknown send outcomes are terminal for review, not blind retry. | Test verified recipient/opt-in, rejection, ambiguous outcome and accepted SMTP acknowledgment in an authorized pilot. No live send was made. |
| Telegram | Verified private-chat pairing bound to same human actor; server delivery/coaching/transport gates plus per-purpose opt-in. | Not a device importer. Replies propose feedback; app confirmation precedes training changes. | Same current approved revision; text/FIT/graphic each have recorded Telegram message acknowledgment. Pre-check-in preview cannot distribute a FIT. Partial/unknown outcomes need review. No read/watch receipt. | Verify pairing, real bot/webhook configuration, opt-in, quiet hours/DST, rejected/partial sends and revision upgrade in an authorized pilot. A sent workout has no implemented Telegram withdrawal notice after later change. |
| Tredict | No JMM adapter, registration, OAuth route, sync job or configuration was found under `src`, `scripts`, `docs`. | No application import/backfill mechanism. Installed external Tredict tools are not a JMM integration. | No JMM workout publication or receipt. | Owner must choose and authorize an integration project; no connector was invoked here. |

Official capability evidence: [Intervals open API](https://www.intervals.icu/features/open-api/) and
[maintainer OAuth application/scopes guidance](https://forum.intervals.icu/t/intervals-icu-oauth-support/2759),
[Garmin program FAQ](https://developer.garmin.com/gc-developer-program/program-faq/),
[COROS MCP repository](https://github.com/coroslab/COROS-MCP) and
[official MCP updates](https://coros.com/stories/coros-metrics/c/mcp-testing),
[Oura authentication/scopes](https://cloud.ouraring.com/docs/authentication),
[Tredict API](https://www.tredict.com/faq/tredict-api---connect-your-platform-or-application/).
COROS documents running/trail-running/cycling workout/plan creation and editing, not AI deletion; that does not
enable JMM's blocked writer. Oura's additional API scopes do not enable unimplemented JMM fields.

## Synchronization, backfill and retry evidence

- `vercel.json`: reminders and durable worker every five minutes; generic sync at minute 45 each hour; feedback
  ingestion at minute 15 each hour. These are configured schedules, not evidence that production invocations ran.
  A 05:00 athlete preference is local-time eligibility, not a guarantee of an exact second or a Calendar notification.
- `oauth.ts`: ordinary successful OAuth callback saves encrypted credentials and an initial durable sync job in one
  transaction. WHOOP/Intervals explicit reconnect clears sync history markers so the bounded initial import can repair
  historical gaps. Already-connected WHOOP accounts affected by an older 30-day implementation need explicit reconnect
  or a separately authorized import; the patch cannot restore data that was never requested automatically.
- `background-jobs.ts`: durable deduplication, lease-fenced completion, exponential retry capped at five attempts.
  A disabled Strava import job performs no provider work and can reach the ordinary failed state; enabling a flag later
  does not automatically replay terminal jobs. Narrow privacy events remain processable without provider fetches.
  Owner review is required before replaying imports.
- `sync.ts`: owner/provider/token/refresh/lease snapshot guards refresh rotation and final cursor updates. Disconnect
  wins over stale worker finalization. Records already being written during a loop are not claimed to be aborted or
  erased; this is not a data-retention or remote-revocation solution.
- WHOOP: initial 180-day requested horizon, or retained cursor minus one day; paired wellness/workout windows no
  larger than 30 days. The provider's workout pagination limit throws on incomplete traversal, retaining the cursor.
  This proves requested ranges, not that WHOOP retains every older activity or accepts every historical request.
- Oura: full retained gap is requested without the former silent 90-day cap. A 120-day gap fixture requests at least
  121 days. The 100-page guard throws rather than declaring truncated success; failed reads retain the cursor.
- Intervals: fixed here after reproducing the former seven-day-only incremental window. `intervals-ingest.ts` now
  starts at the earlier of last successful local day minus one day or today's seven-day correction window. Initial
  import remains 180 calendar days. Synthetic 120-day outage requests five contiguous activity/wellness range pairs;
  provider failure stops before storing records and the outer sync retains its prior cursor. Activity-by-ID webhooks
  separately repair older updates. Data already missed by a previously advanced cursor still needs explicit
  reconnect or an authorized historical import; no stored cursor was rewritten in production.
- `activity-store.ts`, `activity-evidence.ts`, `activity-reconciliation.ts`: repeat provider IDs update idempotently;
  completed activity and planned session remain distinct linked records. Cross-provider copies need corroboration or
  explicit athlete review, and uncertain records do not establish rest or extra capacity. No production cleanup ran.

## Google Calendar: app versus owner configuration

`oauth.ts` uses a valid HTTP(S) `GOOGLE_REDIRECT_URI` override, otherwise `NEXT_PUBLIC_APP_URL` plus the Calendar
callback. The generic sync builds the same fallback and passes it into refresh configuration. However,
`googleCalRefreshToken` sends the documented client ID/secret/refresh-token grant without `redirect_uri`; a successful
refresh cannot verify Cloud callback registration. `APP_URL` can separately override the sign-in origin.

For the canonical production host, the owner must inspect the **existing Web application OAuth client matching the
deployed `GOOGLE_CLIENT_ID` privately**, then add missing exact Authorized redirect URIs without removing unrelated entries:

```text
https://jasmiamimethod.fit/api/connectors/google-cal/callback
https://jasmiamimethod.fit/api/auth/google/callback
```

Google Cloud → Google Auth Platform → Clients (or APIs & Services → Credentials) → that matching client → Authorized
redirect URIs. Confirm Calendar API enabled in the same project, consent publishing/test-user status and requested
scope review. Do not rotate a secret or broaden grants just to fix a URI mismatch. Google requires exact redirect
matching; sign-in success does not prove Calendar access. [Google web-server OAuth documentation](https://developers.google.com/identity/protocols/oauth2/web-server)

The actual client ID and Cloud registration were not inspected: public `/api/auth/providers` only reports availability,
and no authorization endpoint was started to extract one. Environment-name inventory cannot prove the deployed origin
value. Owner can use the existing **offline** checker in a private environment:

```text
npm run check:google-calendar -- --env-file <private-owner-settings-file> --registered-file <copied-redirect-uris.txt>
```

It prints credential presence/shape and URI findings, not credentials/client IDs. `--expect-client-id` compares privately.
Do not attach a credential-bearing file to a review. The checker cannot query Google registration, token validity,
consent publication, a new athlete or actual calendar writes. See `docs/OWNER-SETUP.md` for acceptance steps.

## Strava: blockers beyond the new ingestion gate

The current [API Policy](https://www.strava.com/legal/api_policy), effective June 1, 2026, restricts AI context/use
including derived data (§5.3), analytics and combination with other customer data (§5.4), and persistent storage
(§5.5/§6.2). Its personal MCP exception (§3.5) does not authorize JMM commercial third-party use. This is broader than
“do not train an LLM.” Preserve provenance; neither relaying through Intervals nor a file removes the restriction.

Implemented here: strict server-only `ENABLE_STRAVA_CONNECTOR`, default off, blocks new OAuth, manual/scheduled sync,
new webhook subscription and create/update enqueue or previously queued import processing. The gate itself changes
no history, credentials or stored connection status. Own history remains accessible. Privacy events are the narrow
exception below. New-provider guards do not settle stored-data retention or permission for every raw-record display.

Owner must resolve permitted application use, retention/deletion and the derived consumers below before considering
`ENABLE_STRAVA_CONNECTOR=true` in the secret manager through a separately authorized release. Do not toggle it merely
because credentials exist. Authenticated privacy events remain processable even while imports are off:
`isStravaPrivacyEvent` accepts only activity deletion or explicit athlete deauthorization with matching owner/object
identity. Public ingress bounds JSON to 32,000 bytes, checks existing webhook credentials, then classifies. The queue
can find disconnected bindings; the worker rechecks the saved expected athlete and provider identity. Activity deletion
uses the existing owner/source-scoped plan-aware deletion workflow. Deauthorization stops that binding and clears its
credentials/lease. Neither path fetches provider data or refreshes a token. Wrong credentials, malformed withdrawal
and foreign/unlinked worker targets cause no mutation. No such production event was processed in this audit.

Destructive privacy ingress **always requires the existing `STRAVA_WEBHOOK_SECRET` key**, whether imports are enabled
or paused; subscription-ID-only deletion/deauthorization requests return 503 before owner lookup or enqueue. Ordinary
enabled create/update ingress retains its existing subscription-metadata trust path and cannot enter deletion logic.
Owner must verify that Strava can deliver through the authenticated callback route before release; inspect the existing
subscription registration privately and establish supported secret-bearing delivery without exposing its URL in logs.
If that cannot be verified, privacy delivery is blocked; do not weaken authentication. No callback registration,
credential or environment was changed. Old trusted durable privacy jobs still recheck athlete/provider ownership.
Full retention, historical derivatives/insights and account-wide deletion obligations remain owner/provider blockers.

| Existing derived consumer requiring policy guard | Evidence in inspected source / minimal required behavior |
|---|---|
| `src/app/api/fitness/route.ts` → `j-metrics.ts`, `fitness.ts` | Parallel reviewer has added `derivedActivityPolicy` guards for JStress/EMA, legacy PMC and execution. Raw history remains; restricted input makes derived values unavailable. Final core regression coverage is reported by that reviewer. |
| `src/lib/coaching.ts` → `src/app/api/admin/athletes/[id]/route.ts` | **Fixed summary/disclosure guards:** contaminated raw workouts or metrics return unavailable totals/load/fulfillment/PMC before grouping. Another person's admin view withholds restricted/unknown activity/metrics, all free-form audit before/after snapshots and contaminated serialized checkins; analysis still receives the full raw input. Owner history stays intact. |
| `src/lib/activity-report.ts:generateAndDeliverActivityReport` ← `activity-store.ts` | **Fixed for new reports here:** restricted/unknown activity stops before history queries, writes or sends. Any restricted historical contributor suppresses rank/average/streak. New insights use `schemaVersion:1`/`provenanceReviewed:true` envelope. Today shows only that reviewed envelope with currently permitted source; old/unversioned insights remain stored but are not displayed as reviewed reports, recomputed or erased. |
| `src/lib/weekly-review.ts:buildWeeklyReview` | **Fixed guard here:** both queries select source/external ID/notes; restricted or unknown input returns an unavailable summary before duration/adherence/load calculations. No live caller found under `src`/`scripts`. |
| `src/lib/imported-training-review.ts`, `training-cycle.ts:cycleActivityEvidence` | **Fixed guards here:** contaminated raw members suppress totals/ranges/averages/group counts and inferred recovery. Original records and every performed date remain. `plan/generate` returns explicit 409 before creating a dose; transaction rereads the same notes-inclusive activity query. |
| `src/app/api/checkin/route.ts`, `src/lib/effective-prescription.ts`, `existing-workout-review.ts` | Coordinating reviewer has added central restriction holds: recent restricted/unknown activity cannot establish readiness, short review or extra training capacity. Root reviewer owns these paths and final regression evidence in this workstream. |
| `src/lib/athlete-day-review.ts`, `daily-input-context.ts` | `daily-input-context` retains raw minutes but suppresses totals/comparison and produces no execution feedback from contaminated input (parallel reviewer: 21 context tests). **Day-view guard fixed here:** original minutes/distance/RPE remain, restricted per-record pace and aggregate grouping become unavailable, with bilingual explanation. |
| `src/lib/race-forecast-service.ts` | Older PMC/history path would need the same guard before enablement; currently `FORECAST_AVAILABILITY.enabled=false` stops before database/provider work. |

`coach-personal-context.ts` and stream analysis already reject restricted data; explicit manual-only external coach
facts are not a justification for every local derived calculation. Proposed safety contract: restricted history yields
unknown derived load/capacity and review, while known performed-work existence remains a conservative hold. Never
silently exclude performed rows and prescribe more training. The gate alone does not fix these consumers; the parallel
core guards above and remaining consumers must be reviewed independently.

`ACTIVITY_EVIDENCE_SELECT` now includes `notes`, preventing relayed Strava markers from disappearing in shared
projections. The Prisma Workout model has no `originalSource` column; the in-memory type accepts it and stored upstream
is read from notes. Verified JMM `starter`/`starter-rest` writers are explicitly allowed, with tests that any upstream
Strava note/external ID/original-source marker still wins. No generic unknown-upload source was whitelisted.

Final targeted-view correction: Today, checkin GET and the v1 daily adapter retain the actor and refuse another
person's view with explicit 403 when relevant activity/metric/input context includes restricted or unknown origin.
The lightweight Today plan query selects provenance for this decision, then removes source/notes from its response.
The admin athlete route instead returns the permitted raw subset with explicit disclosure-unavailable reasons;
restricted activity is never silently subtracted into an apparently complete load. Audit snapshots are metadata-only
for every non-owner because their serialized contents have no reliable field-level provenance. No data was deleted.

This is not a blanket provider-disclosure certification. Other profile/calendar/export/admin overview domains were
not comprehensively reviewed in this final patch. In particular, canonical profile fields may have provider origin
(e.g. saved Strava-reported weight); profile disclosure and historical retention still require release-owner review.

## Executed evidence and limits

- Combined integration run: **268/268 offline tests passed** across `capabilities`, `connections-oauth`, `background-jobs`,
  `sync-connection-lifecycle`, `strava-data-sync`, new `strava-capability`, Google `oauth-redirect-check`, `coros-oauth`,
  `intervals-ingest`, `intervals-delivery`, `strava-provenance`, `manual-workout-calendar-reconciliation`,
  `manual-workout-calendar`, existing/new `activity-report`/`activity-report-provenance`, `strava-privacy-event`, and `athlete-setup-paths`.
  Disabled boundaries cause zero provider/enqueue/mutation effects; owner-scoped saved status remains. Includes
  callback mismatch/secret-output guards, refresh races, no fabricated device receipts, obsolete-plan event retirement,
  retained 120-day Intervals gap/range failure, and restricted new-report/history comparisons without erasure.
- Final guard/privacy follow-up: **179/179 passed** across the new `legacy-derived-activity`, cycle/generation,
  imported-training review, day review, reliability, activity evidence, privacy/Strava capability/OAuth/background tests.
  Counts overlap the integration run. Includes secret-authenticated delete/deauthorization, pinned-ID-only and
  forged rejection, no provider fetches, disconnected owner binding, no unknown-to-zero conversion, preserved source
  records/performed dates, and generation 409 before writes. Existing synthetic behavior tests now state their known
  manual/Garmin/COROS origin instead of relying on absent or restricted provenance.
- `npx tsc --noEmit` and `git diff --check` passed after the final source/test edits. Final aggregate unit/build gates
  and the parallel core guard tests are owned by the coordinating reviewer.
- Final disclosure/report follow-up: **30/30 passed** across `activity-disclosure`, `activity-report-provenance`,
  `current-plan-daily`, `legacy-derived-activity`, `reliability`. Real route modules run with synthetic boundaries:
  owner versus assigned/foreign admin access, metrics-only contamination, Today fast plan, checkin GET and v1 adapter;
  versioned report storage/display and no removal of old records. Counts overlap earlier sets.
- Tests use synthetic athletes, credentials and transport/DB mocks; they do not prove deployed flags, provider approval,
  new-athlete consent, pagination beyond fixture boundaries, actual SMTP/Telegram acceptance or physical watch delivery.
  No build/deploy/live-provider ladder completion is claimed; production changes and provider acceptance were outside
  this audit's authorization.
