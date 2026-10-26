# Garmin data and prescribed workouts — October 26, 2026

This change starts at merged main `e9049c3` (PR85) and preserves its consented authorization and the existing chat, plan-review, readiness and file workflows. It is implementation evidence, not a claim of live Garmin delivery or full Garmin compliance.

## Implemented

- A bounded push receiver factory authenticates the exact request bytes **before** parsing or enqueueing. The production transport verifier is deliberately not invented: there is no active incoming HTTP endpoint or subscription in this change.
- Once a supported transport is supplied, an encrypted PostgreSQL inbox routes only to a uniquely connected Garmin owner with the matching Activity or Health permission. Exact duplicate payloads do not create new jobs. Acknowledgment follows durable enqueue, not in-memory work.
- All 20 documented Activity/Health summary families can be archived, including unprojected fields. Activity-file notifications are archived, but their callback URLs are not fetched. No claim of full FIT-file retrieval is made. Parent multisport summaries do not double-count child training.
- Measured activity duration, distance, heart rate, power and calories project locally. Supported daily resting heart rate, steps, sleep and body mass preserve source observations and manual entries. Sleep validation states remain distinct. Garmin's reported HRV is not guessed to be RMSSD/SDNN or used to replace an athlete's baseline.
- Lease-fenced workers and per-summary correction ordering protect durable processing. The generic provider worker cannot accidentally parse the encrypted Garmin inbox. Account deletion cascades to the inbox through the existing User relation; no schema migration is introduced.
- Direct Garmin measurements can feed deterministic local training analysis while `isAiEligible`/external AI remain denied. The shared import path explicitly skips external activity-report delivery for this source. No AI, email, Telegram, Calendar or Intervals forwarding is added.
- Own-account archive access is paginated, bounded and authenticated; another athlete's cursor is rejected. Raw archived summaries may include location fields supplied by Garmin. These records are not image uploads or anonymous public files.
- Native structured **running and cycling** publication uses the effective saved prescription and expected revision, preserving step order, time/distance/lap endpoints, HR/watt targets and pace-to-speed units. Unsupported sports keep existing file/app fallbacks; native pool/strength/HYROX/multisport API publication is not implemented here.
- Garmin workout and calendar responses are verified independently. Provider IDs are persisted before continuing. An ambiguous creation cannot be blindly retried; an uncertain schedule is reconciled by date and owned workout ID. Revisions, removed sessions and unsafe prescriptions trigger owned withdrawal/replacement. Historical calendar entries are not rewritten.
- New automatic publications require a separate, unchecked per-athlete opt-in. A reconnect or disconnect clears that opt-in. Opt-out is rechecked before new creation/scheduling; previously published sessions retain safety updates/cancellations while authorized. A scheduled calendar entry is never labeled as device receipt.
- The existing five-minute worker considers Garmin-only athletes independently, oldest cursor first, with a bounded deadline. Durable rolling app/user budgets include OAuth and API reservations. Capacity, provider outages, device sync, expired permissions and unresolved writes preclude an unconditional delivery guarantee.

## Actual production and activation blockers

Production metadata on October 26 shows merged main `e9049c3` ready. It has **no** Garmin Client ID, Client Secret, connector activation flag or processing attestation. This branch has not changed production credentials, subscriptions or flags. No credentials were created or rotated.

The JMM Supabase project is active. Protected production DATABASE_URL/DIRECT_URL and SMTP_HOST could not establish their actual mappings through readable configuration. The existing recipient inventory's exact database/backup/logging/subprocessor checks therefore remain open. Do not infer mappings from local development configuration or install a key merely to bypass that review.

1. Verify/disclose actual production database, backups, logs and infrastructure recipients; obtain appropriate operator confirmation of that inventory.
2. Obtain Garmin's supported authentication and replay contract for Starter incoming push deliveries. Current approved app fields expose HTTPS endpoint URLs but do not establish a verified signature/custom-header mechanism. Do not trust user IDs as sender authentication, invent a signature, or enable an unauthenticated receiver.
3. Install existing Garmin credentials as production-only secrets only after owner authorization for that destination. Keep connector/data-processing gates off until the recipient review is complete. Separate training/import flags default off.
4. Verify the documented Training 2.0 creation namespace against actual authorized responses. No alternate endpoint fallback is invented. Activate and test one consenting owner's connect/refuse/reconnect, actual new activity/health receipt, safe disposable workout, changed prescription, cancellation and device sync before expanding rollout.
5. Add a supported authenticated permission-change/deregistration adapter and reconcile retained data according to verified Garmin requirements. Until then, outgoing operations recheck current permissions and local disconnect stops future processing.
6. Historical backfill is unavailable with the verified Starter contract. Older data needs existing athlete file imports or separately approved Enterprise capabilities. Neither a full historical import nor all-sport native publication is claimed.

## Reviewable Garmin support question — not sent

Our approved Starter OAuth2 application receives Activity, Health and Training access. Before registering production push endpoints, which supported mechanism authenticates Garmin as the sender and prevents forged/replayed deliveries? Please provide the current contract for signatures, authenticated headers, mutual TLS or supported source validation, including retries and permission-change/deregistration notifications. The endpoint configuration currently shows HTTPS URL, enabled and on-hold controls. Please also confirm the Training 2.0 workout creation path versus its retrieve/update namespace. No credentials, tokens or athlete data are included in this request.

## Validation

Unit tests cover executable workout equivalence, wire units, wrong owners/revisions, duplicate/uncertain writes, schedules, withdrawal, concurrent leases, consent changes, invalid push origin/identity, sleep/HRV semantics, local-only provenance and 50 synthetic identities. CI extends real disposable PostgreSQL checks with inbox encryption/dedupe, local projections, HTTP consent/owner boundaries, durable receipts and global budgets. Browser acceptance adds EN/ES 390px/1280px automation opt-in, stop, failed preference save and unverified-watch states. Exact results are attached to the PR after execution. Synthetic evidence is not a real Garmin or watch receipt.
