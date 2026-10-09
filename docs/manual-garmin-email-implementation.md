# Manual Garmin email pilot

## Scope and status

Reviewable implementation only. No production migration, credentials, real email, provider grant, merge or deployment was performed. Email provider acceptance is not inbox delivery and is not device transfer. Physical Garmin/Edge + OS acceptance is still required. The setting defaults off and legacy `ReminderPref.emailEnabled` no longer authorizes approval email.

## Entry points

- `/workout-email/settings`: signed-in inbox verification, purpose/content opt-in, schedule and pause controls; linked from `/reminders`.
- `/api/workout-email/preferences`: account-self reads/writes only; does not accept another recipient/user ID.
- `/api/workout-email/verify`: explicitly requested account-email code, hash-only persistence, 15-minute expiry, one request/minute, five attempts. Verification alone does not enable coaching email.
- `/api/cron/worker`: existing bearer-secret-protected 5-minute worker runs email reconciliation alongside connector jobs. No new automation or deployment is created by this change.
- `/daily?sessionId=…`: existing authenticated current plan and workout download. Emails never contain a login bypass or public graphic token.

## Activation prerequisites (operator actions, not performed)

1. Review/apply `20261009124500_manual_workout_email` migration to the intended database using the normal deployment process.
2. Review email provider/privacy policy, configure existing SMTP via server-side secret management, and set `SMTP_FROM`, `MANUAL_WORKOUT_EMAIL_ORIGIN` (HTTPS origin only), `ENABLE_MANUAL_WORKOUT_EMAIL=true` and existing `CRON_SECRET`. Examples deliberately contain no credentials/project identifiers.
3. Each athlete verifies their own inbox and explicitly selects daily/revision purposes plus content consent. Historical flags or mock verification are never migrated into consent.
4. Calendar guidance is a separate optional checkbox identifying the connected Google Calendar and its existing viewers; default calendar entries are minimal placeholders (calendar sharing still applies). This feature creates no Google permission/grant.
5. Exercise a small authorized pilot and inspect actual provider receipts. Confirm supported Garmin model, firmware, Windows/macOS version, data cable and USB mode before device acceptance.

## Delivery invariants

- Only today's effective canonical ready, planned, uncompleted session with an approval audit matching the exact revision may attach a single FIT. ZIP/multisport bundles are held in this manual-Garmin MVP.
- Holds, unknown readiness, absent approval, cancellations, completed/feedback sessions and future sessions never attach actionable FIT or guidance. Previously notified cancelled/moved sessions get a generic withdrawal/update notice when revisions are opted in.
- The preferred local time is advanced to start minus lead time if earlier. Lead is 30–720 minutes. The worker never starts actionable delivery at/after a known session start. Delivery timing cannot be guaranteed without a start time or while approval/check-in/provider availability is missing.
- Daylight-saving gaps are skipped rather than guessed; repeated hours use the same durable transition key.
- Outbox uniqueness binds athlete/session/canonical revision/effective state transition. Same-revision held→approved and approved→held are material changes. A per-session lease prevents simultaneous different-revision SMTP sends. Queued older rows are superseded.
- Consent, account address, purpose, canonical revision/state and clock are rechecked after FIT/graphic generation, immediately before SMTP. There is still an unavoidable interval after the final check/in-flight send: already accepted email cannot be recalled. Every email directs the athlete to the current authenticated plan.
- `accepted`, `rejected`, `unknown`, `superseded`, `cancelled`, `queued` and `sending` are distinct. SMTP ambiguity or a database failure after acceptance never triggers an automatic resend. Interrupted sends become unknown; operator review is required. Rejections also remain terminal in this MVP.
- No email body, symptom answer, free-text note, body-weight history or nutrition-context history is persisted in the outbox. It stores the recipient, revision, purpose/state and provider receipt ID.

## Athlete content

See `manual-garmin-email-templates.md` for English/Spanish shell templates. The saved athlete language controls email, verification, settings and consented calendar content, independently of timezone, browser or server locale. English and Spanish have authored content; Haitian Creole, French and Russian currently show an explicit unavailable notice and receive no silent fallback email. Locale changes before dispatch invalidate queued content. Spanish quantities copy validated source values and known units; unrecognized source guidance is explicitly unavailable rather than mechanically translated. Emails include exact supported targets with units/source, actual structured time profile where all endpoints are timed, and the full required hydration and nutrition warnings. Distance/repetition/lap sessions keep exact endpoint lists and do not invent a time-scaled graphic.

The shared nutrition builder retains missing-input and measurement provenance, labels quantities educational/planning examples, does not include private personalization history and does not create new caffeine/VO2max/weather inference. Higher carbohydrate intake carries review/rehearsal cautions. Forecast/location inputs are unavailable in this pilot and are explicitly described as unverified; local-condition preparation is conditional.

## Calendar behavior

Connected Google Calendar events keep existing per-workout IDs and update/delete hooks. Detailed plain-text preparation, exact supported targets and before/during/after guidance require explicit calendar guidance opt-in. Otherwise title/body stay a minimal placeholder (calendar sharing still applies) plus authenticated plan link. Full graphics remain in the app. Google and downloaded calendars use the saved athlete language; unsupported detailed-content locales receive native minimal placeholders and a clear unavailable notice. ICS is an explicitly downloaded full-detail export to the authenticated athlete, not a privacy-minimal calendar feed; importing it into another calendar shares its session titles, steps and nutrition with that calendar’s audience. Downloaded ICS removes raw safety reasons and step free-text notes and links to the authenticated app; it explicitly identifies itself as a snapshot that does not auto-sync.

## Remaining operational/acceptance limits

- No real SMTP or inbox delivery test; mocked acceptance never establishes delivery.
- No hardware transfer test; old email attachments cannot change and previous on-device workouts may require manual deletion by model.
- No production migration or live authenticated app test until authorized deployment.
- Reconciliation is deliberately bounded to 500 opted-in athletes/run, 100 same-day sessions/athlete and 200 recent dispatch records/athlete. Scale beyond a small pilot requires cursor/batch scheduling; do not enable at larger scale without that work.
- Successful sends can outlive consent or a workout change by the small unavoidable in-flight interval. Pause stops future unclaimed work, not messages already accepted by SMTP.
