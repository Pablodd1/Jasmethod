# Athlete test candidate: release acceptance

Use the exact PR head whose workflow and artifacts were reviewed. PR #67 precedes
#68; the latter is stacked on the former. A green workflow is permission to
evaluate the candidate within its tested scope, not proof of a deployed feature
or an external provider's availability. Merging main may trigger production.

## Test lanes

1. **Isolated synthetic acceptance.** Use the CI PostgreSQL database, loopback
   app and egress guard in `.github/workflows/ci.yml`. No real credentials,
   notifications, imported personal files or athlete accounts. Run all unit,
   authenticated integration and EN/ES mobile checks. Inspect artifacts, not
   only the workflow conclusion. Verify every fixture is cleaned up.
2. **Supervised single-athlete acceptance.** After an authorized staging release,
   use one consenting athlete to verify sign-in, own provider authorization,
   a real activity file and the supported export path. Record timestamps and
   receipts. Keep experimental streams/suggestions off until separately approved.
3. **Small pilot.** Exercise the five supported sport journeys below and a
   coach/administrator viewing only assigned athletes. Expand toward the
   50-account cap only after the enabled external paths pass. A 50-account
   database-capacity test does not establish 50-athlete provider capacity.

## Athlete acceptance matrix

| Step | Required result | Failure to stop on |
|---|---|---|
| Sign in / new registration | Google and email methods tested separately; existing account and roles retained; recovery tested with a disposable account | Duplicate account, lost data, wrong role or redirect loop |
| Devices first | Connect an authorized source or skip; missing profile fields remain optional/unknown; imported values have source/date | Asking for a known imported value without explaining why, or inventing a measurement |
| Day zero | Incomplete profile can view a conservative saved session; current safety answers are distinct from profile completeness | Empty schedule presented as confirmed rest, or exercise clearance inferred from missing answers |
| Training cycle | Preview uses the confirmed tolerated baseline, sport, goal, available days, double-day preference and race schedule; creation requires review | Distance discounts the reviewed baseline again, old cycle appears as extra required work, or available hours are treated as proven tolerance |
| Today | Visible purpose, total duration, steps, effort and supported HR/pace/power targets; unavailable targets have a reason | Six-minute accidental scaling, no saved preview during review, or cycling FTP used as running watts |
| Coaching | Try “Update today's workout to 30 minutes”, “Switch today's workout to bike”, and “I have 12 hours a week, no day off” | Unsupported request silently saved, bare yes edits data, missing proposal, or recurring schedule preference falsely reported as changed |
| Confirmation | Review selected values and units; confirm; receive persisted receipt; reopen after reload | Stale/foreign proposal succeeds, approval survives a workout change, or retry duplicates a write |
| Calendar / selectors | One current plan; actual old sessions retained; multiple real sessions selectable; source copies explicitly reviewable | Retired suggestions crowd out current sessions, provider copies summed, or actual history erased |
| Workout approval / file | Fresh session-day check-in and exact current revision required; supported artifact decodes | Export of a held, stale or unapproved prescription, or file success labeled watch receipt |
| After training | Optional actual minutes, RPE 0–10, HR/power/calories, fuel and pre/post weight; unknown remains unknown; edit saved feedback a second time | RPE zero rejected, data lost on failure, stale-revision loop after the first save |
| Next day | Prior actual work, recovery answers, missing data and current cycle inform review; no catch-up debt | Old duplicate history increases load or an availability request silently increases tolerated volume |

Test triathlon, swimming, cycling, running and HYROX separately. Include one
device-free athlete, one imported-history athlete, one double-session day, a
no-fixed-rest preference, a deliberate recovery day and a current symptom hold.
Keep sport-specific equipment, pace units, pool lengths and unsupported exports
explicit. A generic conversation or timed bike interval editor does not prove
that swim, HYROX stations, bricks and full cycles can all be edited by chat.

Include at least 85 pending suggestions on an older plan still marked active,
plus an old skipped report with zero actual minutes and RPE zero. These must
not consume today's budget, become the default session, impose an old rest day,
or remain executable through old links. Retain the report unchanged. Replace a
plan during approval and during delivery preparation: stale approval must fail
and an unsent obsolete attachment must be superseded. Repeated unchanged
approval and multiple genuine current sessions must continue to work.

## Morning delivery: verify each stage

- Confirm saved local time and timezone, purpose consent, quiet hours, verified
  destination and the server's channel readiness. The 5 a.m. shortcut must be
  saved. Email and Telegram have separate consent/verification settings.
- A saved session is needed for a session-specific message. Refreshing device
  data is separate from generating a cycle. Opening Today must not silently
  create activities, prescribe more work or opt the athlete into messaging.
- Before a check-in, verify that the preview/private questions link arrives
  without actionable attachments. After explicit current approval, verify the
  permitted revision-specific follow-up within daily prompt limits.
- Record scheduler attempt time, provider acceptance ID, actual inbox/private
  chat receipt and any compatible-watch receipt separately. A scheduled
  five-minute worker is not an exact 05:00 delivery guarantee.
- Repeat once, then change or cancel the session: no duplicate prompt/event or
  stale attachment should be newly sent. Already delivered files cannot be
  recalled from an inbox or watch.

## Connection failure and history checks

Disconnect during a delayed sync and token refresh. It must remain disconnected;
an older worker must not overwrite a newer connection. This does not promise
cancellation of an already in-flight provider request.

For WHOOP, verify wellness and completed workouts cover the same requested date
windows and a failed page does not advance the history cursor. Existing accounts
whose older version already advanced a partial cursor need an explicit reconnect
or reviewed import/backfill; do not claim their missing history was repaired by
this code release alone.

For Google Calendar, test only app-owned workout links: retiring a replaced
unperformed plan must not remove historical actuals or unrelated appointments.
For Oura, test the real return callback, scopes and refresh after connection;
reading configured credentials is not an OAuth acceptance test.

Garmin, Intervals.icu and COROS require their own approved paths and compatible
hardware. Keep app generation, provider acceptance, Garmin Connect availability,
watch sync and successful step-by-step execution as separate evidence. Strava
activity ingestion is not outbound structured-workout delivery.

## Release and rollback

Do not activate stream storage, suggestions, new provider paths or automated
sending merely to make tests green. Record actual deployed flags and required
provider acceptance for the selected release scope. Personalized forecasts stay
disabled pending independent outcome validation; explicit-target scenarios are
not measured individual predictions.

Before a later authorized release, record the previous deployment and backup.
Rollback through reviewed reverts or the previous deployment, retaining security
patches where possible. Disable experimental behavior first; keep owner deletion
and retention cleanup available. No new production migration is required by the
follow-up fixes. Any earlier optional ActivityStream migration remains a separate
release decision. Code rollback does not undo imported reports, sent messages,
calendar effects, physical deletion or activity reconciliation decisions.

Recheck the full dependency audit and the open build-tool disposition in
`docs/security/toolchain-advisories-2026-10-20.md`. Do not describe an open,
unpatched advisory as fixed.
