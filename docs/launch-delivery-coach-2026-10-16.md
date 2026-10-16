# Daily delivery and coaching release

This release joins the existing delivery, athlete-data review and conversation flows. It does not introduce a second training planner.

## Athlete workflow

1. Sign in to the existing account. Keep its profile, history and training cycle.
2. Open `/reminders` for Telegram. Pair the private chat using the app-generated link, choose purposes, review the contents, and save explicit consent. Use the profile timezone and select 05:00 if wanted. Quiet hours must end by that time.
3. Open `/workout-email/settings` for email. Verify the saved account address, then opt into daily previews and any revision notices. Email has separate consent from Telegram. Calendar guidance also has its own opt-in.
4. Before the daily check-in, a delivery can show only saved schedule metadata and a private app link. It contains no executable workout, FIT, health reason, targets or nutrition. A preview does not authorize exercise.
5. Complete today's self-report in the app. Missing symptoms or actual duration remain unknown. Review and explicitly approve the current canonical workout revision. An approved eligible workout may then be delivered separately with its current FIT. Repeated checks cannot resend the same revision after accepted, ambiguous or partial delivery.
6. Report completed/partial/substituted/skipped work and actual minutes and effort. Imported observations and self-reports inform the next local coaching decision; missing days do not become rest.

Reminder processing runs every five minutes. This is a processing interval, not an exact arrival guarantee. Telegram retains a three-prompt daily limit; multiple sessions and later approvals can exhaust it. Use the app when the limit is reached. Unknown or partial provider attempts require review rather than automatic resend.

## Activity reconciliation

`/api/activities/reconcile` and the setup review expose possible cross-provider copies. An athlete explicitly chooses whether records represent the same session or different sessions. A same-session decision also requires choosing the primary actual record. The decision is immutable and owner-scoped; the provider records remain intact.

Existing plan links or corroborated matching time, sport, duration and distance can count once. Near-start records without corroboration remain unresolved. Their uncertainty must stay visible in activity totals, load, cycle review and daily capacity. A decision invalidated by changed evidence requires another review. Reconciliation never increases the saved training baseline automatically, and a changed decision requires a fresh check-in before further prescription.

Reported effort is shown with the source records; conflicting RPE values prevent automatic grouping. An athlete can deliberately reopen either kind of confirmed decision, review the displayed evidence and select a replacement. Reopening leaves load and execution uncertain until the replacement is confirmed. Original provider rows and earlier audit entries are preserved; stale reopen requests cannot reverse a newer choice.

## DeepSeek conversation

DeepSeek text responses require `DEEPSEEK_API_KEY`, `EXTERNAL_AI_ENABLED=true`, a supported model and named consent for each message. Default model: `deepseek-flash`. There is no silent Gemini fallback. Local coaching remains available when external AI is disabled, fails, or is unsuitable for the question.

The external context is limited to explicitly manual fields, today's self-report, up to ten unmatched manual actuals in thirty days and up to four recent user messages. Imported/device/Strava history, mixed-provenance derived values, screenshots, identity fields and credentials are excluded. This is bounded inference, not model fine-tuning or validated clinical decision support. The local engine continues to use owner-scoped history for training analysis. Expanding external context requires verified provider permissions and field-level provenance.

AI prose cannot apply profile changes, modify a plan, clear exercise or confirm delivery. Existing local proposal → review → confirmation → revision check → audited write handles supported changes. Safety concerns and exact calculations remain local. New model text is filtered and reviewed references are allowlisted; this does not guarantee correctness.

Primary API contracts: [DeepSeek chat completions](https://api-docs.deepseek.com/api/create-chat-completion/), [Telegram webhooks](https://core.telegram.org/bots/api#setwebhook).

## Operator workflow

Administrator `/admin` contains configuration checks and explicit SMTP/Telegram probes. GET reads only configuration. POST `probe` verifies SMTP TLS/authentication without sending mail and checks bot identity/webhook URL. POST `configure_telegram_webhook` uses only the server-owned HTTPS app origin and runtime secret. A different existing webhook is a conflict and is never intentionally replaced. Pending Telegram updates are preserved. No credentials or raw transport errors are returned.

Required email settings: `ENABLE_MANUAL_WORKOUT_EMAIL=true`, `MANUAL_WORKOUT_EMAIL_ORIGIN`, `SMTP_HOST`, `SMTP_FROM`, plus the SMTP provider's authentication/TLS settings.

Required Telegram settings: `ENABLE_TELEGRAM_COACHING=true`, `ENABLE_AUTOMATED_DELIVERY=true`, `COACHING_TRANSPORT=telegram`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_COACHING_WEBHOOK_SECRET` and an HTTPS app origin. Register the webhook, pair an athlete's private chat and test its actual receipt. Existing administrator alert-chat configuration is not athlete verification or consent.

Environment changes require a new deployment. Configuration presence is not a successful provider call. SMTP acceptance is not inbox receipt; Telegram message receipts are not reading; a FIT download is not installation on a watch. Intervals integration is outside the current requested launch scope. No automatic Garmin/watch delivery is claimed by this release.

## Verification

Unit tests use injected transports and synthetic data. `scripts/jmm-launch-integrations-check.ts` exercises the real HTTP authorization, cross-site and body limits, safe diagnostics and audit path against the dedicated loopback PostgreSQL test database. Other isolated acceptance suites cover conversation writes, source reconciliation and delivery revision/idempotency behavior. Real-provider acceptance must be recorded separately after deployment, using the athlete's actual consent and verified recipient.
