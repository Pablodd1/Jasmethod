# Direct Garmin integration: verified approval, gated authorization

## Verified account and deployment facts

The owner requested implementation after approval. The October 25 welcome email confirms program acceptance. In the authenticated developer portal, AI DYNAMICS INC's existing Jas Miami Method (JMM) application is Approved, OAuth 2.0, with Connect Developer – Starter Enabled. Its registered callback matches `/api/connectors/garmin/callback` on the production app origin. Existing credentials were used privately to sign into Garmin's own API Tools; none were created, rotated, logged, committed or installed in Vercel by this change.

API Tools confirms Activity, Daily Health Stats and Training enabled/approved, with **zero active incoming data endpoints**. Women's Health and Courses are off and were left off. No endpoints or API permissions were changed. Starter documentation/portal specifies push-only delivery, no historical backfill and capacity up to 1,000 connected users. A 50-athlete pilot is within that stated capacity, but no claim of 50 successful real connections is made. Starter approval is not Enterprise verification.

The branch starts at updated main `f488524`, preserving PR82's mobile, readiness, race and plan-review functionality and the subsequent PR79/PR84 merges. The unrelated research document in the owner's working tree is excluded from this change.

## Implemented here

- Separate, consented direct Garmin authorization card in English/Spanish; manual uploads and other connections remain separate.
- Server-only OAuth2 PKCE S256, exact registered callback, ten-minute encrypted pending state, browser and authenticated-athlete binding, atomic one-use state consumption, bounded provider responses and sanitized errors.
- Existing Connector and OAuthTransaction tables; provider key `garmin_direct` keeps direct grants separate from legacy Garmin file records and scheduled pull connectors. No schema migration.
- Live Garmin user ID and user-permission verification before storing an authorized state. No invented scope parameter; users control Garmin's permissions. Subsequent authorization use rechecks permissions even with an unexpired access token.
- Encrypted access/rotating refresh credentials; compare-and-swap ownership prevents simultaneous refresh or stale completion overwrites. Ambiguous token exchanges/refreshes require reconnection instead of blind retries.
- Real Garmin registration revocation on explicit own-account disconnect, including when the release switch is off. Unconfirmed revocation retains recovery credentials and blocks their use. A duplicate remote identity is rejected without revoking the established owner's app-wide Garmin registration.
- No import, AI request, outgoing message, Calendar event, workout publication or watch receipt is produced by this grant flow. No initial pull job is queued; Starter does not provide historical backfill.
- English/Spanish privacy and setup wording distinguish approved application, configured transport, athlete authorization and actual delivery.

## Activation configuration — not set by this PR

Production requires existing `GARMIN_CLIENT_ID` and `GARMIN_CLIENT_SECRET` as server-only secrets, a valid HTTPS `APP_URL` (or canonical `NEXT_PUBLIC_APP_URL`), `TOKEN_ENCRYPTION_KEY` of at least 32 characters, `ENABLE_GARMIN_CONNECTOR=true` and `GARMIN_PROCESSING_APPROVED=true`. Missing or malformed configuration fails closed. `GARMIN_PROCESSING_APPROVED` is an operator attestation after the recipient inventory has been verified and disclosed as required; app approval alone is insufficient. Do not set it simply to make the button appear.

Do not install credentials into Preview or Development by default. Do not put credentials in public environment variables, URLs, Git, screenshots, messages or test artifacts. Do not generate or rotate credentials without owner authorization.

## Remaining implementation and activation blockers

1. Confirm/disclose actual production hosting, database, backup, logs and analytics recipients. Existing inventory still lacks a verified exact production database mapping and complete platform recipient review. The app registration itself states those items are pending and excludes downstream Garmin disclosure to external AI/email/Telegram/Calendar/Intervals.
2. Establish an authenticatable push contract before enabling incoming Activity/Health endpoints. The current visible API Tools endpoint form contains URL/enabled/on-hold controls, but no signing-secret or custom-authentication field. The reviewed 2.0 specifications do not establish a verified signature scheme. Do not invent one, treat user/client ID as proof of sender authenticity, trust spoofable forwarding headers, or expose a guessable unauthenticated receiver. Keep endpoint subscriptions off until a supported method is confirmed and tested.
3. Implement authenticated, durable, idempotent push ingestion and permission/deregistration handling after that contract is confirmed. Retain Garmin provenance and ensure raw records and derived summaries cannot enter downstream channels. Existing external AI restrictions remain intact; this change introduces no Garmin activity or health records into those models.
4. Implement and test direct Training API publication, rate limits, revision-bound receipts, ambiguous writes, cancellation and withdrawal of stale workouts. The October 2026 2.0 document uses a different creation namespace from update/retrieve; verify actual responses with authorized disposable test workouts rather than guessing. No direct publishing or watch-delivery capability is advertised by this release.
5. After exact-main test/build and owner authorization for production configuration/deployment, perform one consenting owner's real connect/refuse/reconnect/disconnect, push receipt and safe workout test; then a separate athlete-isolation check. Device delivery still requires device evidence.

These are explicit remaining requirements, not completed features. Do not submit compliance attestations, accept new agreements, enable all summary types, unblock Garmin relay imports through Intervals, or claim full Garmin compliance from this PR.

## Validation

Focused tests cover PKCE/callback binding, missing/refused consent, expired/replayed transactions, another athlete's callback, duplicate provider identity, partial/revoked permissions, refresh rotation/uncertainty and revocation. Fifty synthetic identities test separation; they are not live Garmin users. Additional CI uses real disposable PostgreSQL for durable state claims/encrypted reload and English/Spanish mobile/desktop browser fixtures for configuration, consent, errors and disconnect. No real provider data or secrets enter CI.

Exact run results and browser screenshots are attached to the PR/CI artifact after execution. Provider contracts are kept in local ignored review files, not uploaded as repository artifacts.

Public references: [Garmin program overview](https://developer.garmin.com/gc-developer-program/overview/), [developer portal](https://developerportal.garmin.com/), and the portal's current October 2026 2.0 specifications. The signed-in portal/application, not old public examples, was used to establish the registered callback and enabled APIs.
