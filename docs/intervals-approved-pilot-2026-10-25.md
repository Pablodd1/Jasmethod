# Approved Intervals OAuth pilot

## Verified settings

On October 25, 2026 the owner's Intervals management page showed JasMiamiMethod client 1143, no Pending status, zero connected users and an unlisted app. Its callback and enabled webhook URLs match JMM's deployed routes. The app is a confidential client; Public Client and Require PKCE are unchecked. No app settings, secrets, scopes or live athlete records were changed during this inspection.

The app-specific quota shown was 8,000 calls/day, 2,500 calls per rolling 15 minutes and an additional 10 calls/second per IP. These observed quotas supersede older public draft limits. They are not a capacity guarantee. The owner can review them at Settings / Apps / Manage App.

Production environment-name inventory still lacks INTERVALS_CLIENT_SECRET. The live JMM owner session shows Intervals disabled. Credential validity, current secret values and webhook-secret agreement have not been verified. The callback and webhook path registration alone does not enable OAuth.

## Changes

- Optional INTERVALS_PILOT_USER_IDS gates new authorization, callback token exchange and low-level import/publication credentials. An explicitly blank, malformed or over-50 list fails closed. Unset preserves the existing global feature-switch behavior. Set the exact pilot account before enabling the connector; expand the list deliberately. Disconnect remains available.
- OAuth identity remains bound to the initiating durable transaction, regardless of which user is signed into the returning browser. All athletes authorize their own accounts.
- Intervals 429 responses preserve bounded Retry-After seconds or HTTP-date values. Durable sync jobs use at least that cooldown. Publication receipts retain a cooldown so repeated clicks and maintenance cannot immediately retry. Deleted-session cancellation retains cooldown in its ownership audit too.
- Automatic new-workout publication remains separately gated by both server settings and per-athlete opt-in. Structured publication remains native run/bike only, revision-bound and idempotent. Provider acceptance never proves Garmin/watch receipt.

## Test evidence and budget

Synthetic tests cover 50 independent OAuth transactions with distinct provider identities and a different returning browser user, plus 50 initial 180-day reads in six 30-day windows with activity and wellness scopes: 600 list calls total. Fifty token exchanges plus one publication and cancellation per athlete would bring that illustrative startup budget to 750 calls before retries, webhooks or other reads. This is a request-count estimate, not 50 real users, an IP burst/load test or measured provider performance. Roll out a few athletes first and inspect actual quota headers and errors.

Existing tests continue to check duplicate provider-account prevention, wrong-athlete callbacks, disabled connections, source restrictions, disconnect fencing, exact FIT decoding, update/cancellation and stale prescription rejection. New cooldown tests use fake responses and clocks; no live provider calls are hidden inside tests.

## Live gate and unresolved scope

The signed-in owner accounts are available in both JMM and Intervals. Before live testing, configure the existing client secret and matching webhook secret securely in JMM's Vercel production settings, set the one-account pilot allowlist, keep automatic publication off, and deploy the verified changes. Production must also include the privacy fixes in PR78; this branch preserves them.

Browser policy requires action-time confirmation for security-sensitive access expansion and OAuth grants. Obtain that confirmation before saving production credentials/enabling the connection or granting activity/wellness read plus calendar write. Do not print secrets, create real athlete accounts, fabricate readiness answers or replace the owner's training plan for a test.

App approval does not establish permission to forward Garmin-origin activity data to JMM. The importer still rejects GARMIN_CONNECT, Strava and unknown activity origins; mixed restricted batches do not advance the import cursor. Preserve that boundary pending provider/owner permission review. No direct Garmin approval or unrestricted Garmin data coverage is claimed. A physical-device inspection remains necessary for watch delivery, even after an Intervals publication receipt.

Official references: [OAuth](https://forum.intervals.icu/t/intervals-icu-oauth-support/2759), [integration cookbook](https://forum.intervals.icu/t/intervals-icu-api-integration-cookbook/80090), [API terms](https://forum.intervals.icu/t/intervals-icu-api-terms-and-conditions/114087), [maintainer's Garmin clarification](https://forum.intervals.icu/t/api-access-to-intervals-icu/609/829).
