# Bounded account delivery smoke test

Review-only implementation. No configuration changes, OAuth grant, migration, deployment, real send, browser acceptance or device delivery has been performed by this change.

## Scope and operation

`/account/smoke-test` and `/api/account/smoke-test` require the authenticated owner, `ENABLE_ACCOUNT_SMOKE_TEST=true`, and the exact server-side `JMM_SMOKE_TEST_USER_ID`. Both settings are absent/off by default. These are independent of every scheduled-delivery switch. Do not enable scheduling flags to test this feature.

The authenticated user separately confirms each fixed `JMM SMOKE TEST` transmission. No recipient, message body, user ID, alternate calendar, workout, attachment, retry or reset is accepted from the client. Telegram is a verified human private chat: the separate smoke pairing flow works while global schedulers are off, or a current unpaused normal verification can be reused. Each test still requires explicit one-off consent. Email uses only the saved account email. An existing verified account email receives the fixed test; otherwise the single test email includes a verification code, explicitly disclosed in the UI. Entering the code confirms receipt of that one test; it never sends a second email or enables normal delivery. Missing service configuration blocks delivery; normal verification and preference records are never reset.

Calendar uses a dedicated smoke OAuth flow. The user reviews Google’s requested permissions before granting them. It requests short-lived online event access for calendars the Google account owns, stores a separate `google_cal_smoke` connector, discards refresh tokens and never queues workout sync. It only inserts one event into that account’s primary calendar: private, transparent, five minutes, fixed test title/body, no guests, no reminders, updates suppressed. The user must select a Google account they own. Normal Calendar credentials and training are untouched. Expired smoke access requires explicit reconnection; no refresh grants are requested.

## Receipts and recovery

A database uniqueness constraint on user/channel/consent-version permanently claims one attempt before provider I/O. Destination and consent state are checked again immediately before dispatch. Concurrent/repeated requests read the existing receipt. There is no automatic or manual reset/retry endpoint, including for rejected attempts. At most one external attempt per channel is deliberately more conservative than retrying known rejections.

- `provider_accepted`: a matching provider receipt was verified; this does not establish inbox arrival, reading, notification or device delivery.
- `processing`: durable claim exists; completion not recorded yet.
- `unknown`: interrupted/malformed provider result, or a claim older than one minute. The provider might have accepted it. Never resend.
- `rejected`: provider rejected, or adapter validation blocked the send.
- `cancelled`: saved destination/consent changed after claim, before provider I/O.

A crash after claiming or after acceptance but before receipt persistence remains non-retryable. No lease expiry releases the claim. No raw tokens, destinations, payloads or provider exception text are stored in receipts. Combined email verification stores only a bound code digest and email digest, expires in 15 minutes, allows at most five attempts, and is single-use. User-confirmed arrival is recorded separately as verifiedAt without inventing a provider-acceptance receipt. No completed workout or training prescription is synthesized.

## Rollout requires separate authorization

1. Review and approve code, apply the additive receipt migration through the normal deployment process, regenerate Prisma, and deploy the exact reviewed commit.
2. Approve the target account identity and explicit smoke-only server flag configuration. Do not change scheduled-delivery switches.
3. Verify required existing Telegram/SMTP service configuration. Telegram needs the bot username/token/webhook secret and an existing registered webhook. Configuration and webhook registration require separate authorization. In the app, create a smoke-only pairing link, open Telegram and manually press Start; refresh status and separately authorize the single test. No bot reply is sent during pairing. Email needs SMTP service configuration; the explicitly confirmed combined code-and-smoke email is the single allowed email if the address is not yet verified.
4. The user separately grants Google access through the smoke-only connection UI if wanted. Registering redirect configuration or credentials requires its own approval.
5. User confirms one test per channel. Check each stored receipt and independently inspect actual destination arrival. Device/import delivery is outside this test.

Use only the smoke page for these tests. Its isolated Telegram pairing and combined email verification do not require enabling the global Telegram/email scheduler flags, and they do not update normal delivery preferences.

## Local verification

All provider transports are tested with injected HTTP/SMTP fakes. Core tests cover ownership, strict bodies, missing configuration, revoked consent, changed destinations, repeated and concurrent requests, channel isolation, uncertain results and receipt-write failures. OAuth tests cover persisted mode, callback replay/spoofing, scope/expiry, gate revocation, and absence of normal sync. These do not substitute for real PostgreSQL concurrency or browser/provider/device acceptance testing.
