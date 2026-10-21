# Task 3: separate workout-email health

Source baseline: `8f0291b`, reviewed 21 October 2026. These are local synthetic source/handler checks, not a real SMTP send, inbox receipt or production acceptance.

## Reproduced defect and scope

The existing `/api/reminders/health` hardcoded `smtpConfigured: false`, derived cron availability from Telegram/mock configuration, and read no manual-workout-email preferences or outbox. The reminders page displayed Telegram readiness and a separate email settings link, but no email-specific blockers or attempt evidence. The endpoint therefore could report SMTP unavailable even when its server settings existed and could not distinguish an opted-in athlete from one with no email verification/consent. This diagnostic defect alone does not prove the cause of a particular athlete's failed email.

The existing email pipeline already separates account-bound verification, per-purpose consent, athlete-local schedule, current canonical workout/approval revision, durable outbox, dispatch claim and SMTP receipt. It runs through `/api/cron/worker`; Calendar OAuth and Telegram are not prerequisites. The current service/transport stores `accepted`, not `provider_accepted`, for a matching SMTP acceptance. `unknown` and interrupted `sending` attempts are uncertain and are not automatically resent. An SMTP acceptance is not inbox receipt or watch delivery.

Health now reads only the authenticated actor's email preference and the ten most recent outbox rows, reports independent SMTP/email/scheduler configuration, explains missing consent/verification/purposes/timezone/language/storage, and projects queued/accepted/unknown-or-sending/rejected counts. These counts cover at most ten recent records, not the complete delivery history. No health read calls a transport, checks a mailbox, grants consent or changes a setting. Missing optional email tables/columns have an explicit unavailable result; general database errors remain failures. Responses are private/no-store. The actor's email is used internally to validate the account-bound recipient and is not added to the health payload.

The existing reminders page presents a separate bilingual workout-email panel with schedule, blockers, recent states and email-settings navigation. Telegram readiness retains its separate controls. Email health fetch failure clears stale email status, leaves other reminder settings usable and offers an independent retry. An empty blocker list means the worker may evaluate eligible current workouts; it is not a send or a claim that an executable attachment is permitted. Existing canonical revision/approval checks remain in the delivery service.

## Evidence

`node --import tsx --test src/lib/reminder-health.test.ts src/lib/reminder-readiness.test.ts` passed 7/7. The regression executes the actual health route and actual `coachingActor` with injected storage/configuration, verifying two-athlete isolation, unauthenticated/foreign-target rejection before reads, SMTP reporting independent of disabled Telegram, actual `accepted` enum counts, optional-storage unavailability and connection-error propagation. Its strict dependency loader has no email/Calendar transport dependency. No external request occurs.

A handler fixture executes the actual reminders page with failed health fetch alongside successful Telegram preference reads, then retries email health successfully without resetting Telegram preferences. Static EN/ES component rendering verifies distinct provider acceptance and unconfirmed receipt copy. Existing fake-transport/service tests cover actual send state machines independently; final rerun results belong in the parent release checklist.

The combined health/readiness, manual-email core, existing service, fake transport and actual email-route suites passed **69/69** locally. This includes concurrent cron/outbox claims, stale revisions, opt-out, timeout ambiguity, disabled configuration, DST, language selection and source changes during file preparation. All transport calls in these tests are injected local fakes; no SMTP provider was contacted.

## Remaining owner actions and limits

The source checks above sent no real message. During the separate production review, the owner explicitly authorized one verification-code email to the signed-in address. The existing settings action was invoked once; its rendered result said the verification email could not be confirmed. The attempt was not repeated. This created the normal account-bound verification challenge; it did not verify the inbox, enable workout purposes, grant content consent or enable a reminder schedule. SMTP acceptance and inbox receipt remain unproven. No workout email was authorized or sent by the agent.

The owner must separately verify serving configuration, deployment cron registration/execution, provider acceptance and actual inbox receipt. Do not grant Gmail mailbox access or change Calendar OAuth to solve email health. Never automatically resend an uncertain SMTP attempt. No credentials or provider permissions were changed.
