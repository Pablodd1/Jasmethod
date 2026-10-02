# Opt-in coaching: release-disabled provider path and isolated simulation

Implementation date: 2026-10-02. This is engineering implementation evidence,
not privacy/clinical approval or evidence of real Telegram delivery.

## Included

- `/reminders` exposes separate daily-plan, session-feedback and missing-input
  choices, one primary channel, an IANA scheduling timezone, quiet hours,
  pause/unsubscribe, disconnect/revoke, delivery history and editable answers.
- The scheduling identity is athlete + purpose + selected session + local
  observation date. DST repeated hours use their first instant; skipped times
  move forward. Quiet hours postpone. Duplicate triggers reuse the same record.
- At most three new prompts per local day. A definite pre-acceptance failure
  retries after 1/2-minute backoff, at most three attempts. Unknown outcomes and
  interrupted pending attempts never automatically retry. A pending claim older
  than 20 minutes becomes unknown on the next scheduler run. Result persistence
  uses a pending-state compare-and-set; an unverified finalization is never
  reported as a saved receipt.
- Daily messages use the canonical selected-session resolver and recheck it
  immediately before real transport. Rest/blocked prescriptions never become
  exercise. Concise whole-step summaries retain phases/endpoints/targets and
  link to the complete authenticated app. Long notifications are explicitly
  labeled shortened and stay below Telegram's message limit.
- Missing-data questions name the exact input and decision consequence. Current
  unperformed sessions ask setup/safety questions, not assumed completion.
  Optional declined benchmarks are not requested again until allowed in settings.
- Real Telegram replies use native Reply to the original bot message. The accepted
  provider message ID plus uniquely linked private chat/actor maps to the saved
  athlete/session/date/timezone/source revision and 30-minute one-use nonce.
  No long token/hash command is presented in the primary flow. A legacy opaque
  command parser is retained as a secondary compatibility path.
- Fresh authenticated webhooks reject other chats/actors, forwarding, groups,
  bots, incorrect replies, expired/replayed tokens, duplicated Telegram update
  IDs, changed session/date/timezone/revision and revoked permissions.
  Handled duplicates and terminal rejected authenticated updates receive a
  minimized HTTP 200 acknowledgment. Claim and processing commit atomically;
  transient failures roll back the claim and remain retryable.
- Parsed replies are editable drafts only. The signed-in athlete confirms them
  through the existing audited `updateWorkout` validator in one serializable
  transaction with nonce/draft consumption. Confirmation saves actuals and asks
  for a fresh check-in; no Telegram reply independently progresses training.

## Flags and setup boundary

All flags default off. No credentials, webhook registration, permissions,
provider accounts, production migrations or live messages were configured or
executed as part of this implementation.

Isolated simulation:

- `ENABLE_MOCK_COACHING=true`
- `COACHING_TRANSPORT=mock`
- `VERCEL_ENV` must not be `production`

Real Telegram code remains unavailable unless **all** of the following are set
by an authorized operator after provider/privacy review:

- `ENABLE_TELEGRAM_COACHING=true`
- `ENABLE_AUTOMATED_DELIVERY=true`
- `COACHING_TRANSPORT=telegram`
- Existing `TELEGRAM_BOT_TOKEN` and a separately generated
  `TELEGRAM_COACHING_WEBHOOK_SECRET` are configured securely

No route accepts an API host, credentials or custom HTTP client. The adapter
uses the fixed official Telegram API and disables redirects. Server-function
HTTP injection exists solely for isolated tests. Failures never return or log
provider descriptions, request URLs/bodies, tokens or exception messages.
Webhook registration, if separately approved, must target
`/api/coaching/telegram/webhook` with the configured secret-token header.

Real private-chat pairing uses a 10-minute single-use challenge created by the
signed-in athlete and received through the authenticated Telegram webhook.
Pairing does not opt in: it clears old purposes and requires separate
`telegram-coaching-v1` consent. Mock verification and mock consent cannot enable
real delivery. Disconnect clears recipient verification, pending challenges,
reply capabilities/drafts and all purpose choices. An already in-flight HTTP
request cannot be recalled; late acceptance is recorded without reviving reply
access. Real email and push transport remain excluded; their UI options are
explicitly simulation-only. Legacy direct reminders, Telegram polling and SMTP
digest routes cannot bypass these boundaries.

## Data and retention

Routine messages exclude symptoms, medical reasons/history, body measurements,
free-form athlete notes and arbitrary titles. Private questions are shown in the
app. The text grammar supports English labeled outcome/minutes/RPE/sport and
explicit unknowns; unsupported languages, narrative, ambiguous or contradictory
answers use the app form. No raw incoming text or audio is retained by this flow.
Unconfirmed candidate values expire after seven days and are cleared on the
next authenticated list or scheduler run. Receipt audits retain field names and
provenance, not candidate values. Confirmed edits retain normal before/after
workout audit and observation provenance. The provider's own retention requires
privacy review before activation.

## Migration, rollback and evidence

Migration `20261002211000_mock_opt_in_coaching` adds CommunicationPreference,
CoachingPrompt and TelegramCoachingUpdate. Existing reminder settings/connection
records and training history are preserved. Apply only through the authorized
release migration process; no production migration was run. Rollback switch:
unset the three Telegram flags and mock flag, which stops new sends/ingestion.
The app's manual feedback/check-in remains available. Preserve tables/audits when
rolling code back; do not delete athlete history as a feature toggle.

Verification sources:

- `src/lib/coaching-communication.test.ts`: consent/type validation, DST,
  quiet hours, token binding/expiry/replay, unknowns and optional-data declines
- `src/lib/coaching-lifecycle.test.ts`: native receipt/forwarding boundaries,
  bounded summaries, pending reconciliation, CAS finalization and storage failure
- `scripts/jmm-followup-integration.ts` and
  `scripts/jmm-telegram-webhook-integration.ts`: isolated PostgreSQL +
  authenticated HTTP (see generated QA report)
- Injected HTTP adapter tests: accepted/failure/timeout/recipient mismatch and
  secret redaction, without provider traffic

Real Telegram pairing, webhook registration, sending/acceptance, mobile
interaction and provider privacy review are NOT RUN. Synthetic receipts are not
live provider evidence. Release owner, qualified safety/coaching reviewer and
privacy reviewer still need to approve enabled production scope.
