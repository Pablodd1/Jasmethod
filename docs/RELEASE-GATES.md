# JMM authoritative release gates

Updated 6 October 2026. This runbook supersedes older deployment instructions in implementation reports. It does not authorize database writes or deployment. Production operations still require the task's authorization and correct environment.

## Evidence labels

- **Verified — source inspection:** observed in files, not an execution result.
- **Verified — isolated test:** executed successfully for the recorded candidate, command and environment; does not prove live providers or hardware.
- **Verified — live acceptance:** observed on the recorded deployed candidate with authorized accounts; name the provider/device involved.
- **Pending:** no candidate-specific evidence recorded here. Historical pass counts do not clear a different release.
- **Not applicable:** requires a documented reason, such as a deliberately disabled feature with truthful unavailable UI.

This update records source inspection only. Attach dated test results and candidate identity before marking execution gates verified. For concurrent uncommitted work, a commit hash alone is insufficient: record a source fingerprint or rerun after the final candidate commit.

## Verified source facts

| Item | Evidence | Status |
|---|---|---|
| Build does not migrate | package.json: prisma generate followed by next build | Verified — source inspection |
| Production migration wrapper is explicit | scripts/migrate-production.mjs requires production environment, approval flag and database URLs | Verified — source inspection |
| CI contains isolated database/API/contract suites | .github/workflows/ci.yml and package scripts | Verified — source inspection; candidate execution pending |
| CI push branch is main; pull requests also run | .github/workflows/ci.yml | Verified — source inspection; hosting branch must be checked separately |

Inspection context was codex/coach-science-reliability at ac3d471 with concurrent work. This identifies neither a completed release candidate nor live production. An earlier inventory saw navigation edits before the concurrently added /coach page; that transient observation is not evidence of the historical outage cause. Test the completed candidate.

## Ordered release workflow

1. Identify repository, intended base branch, complete candidate commit/fingerprint, hosting project and public origin. Reconcile branch instructions against hosting settings and CI. Never choose a branch from an old report by assumption.
2. Review the full diff, variable names, feature flags and migrations. Record credential presence without values. Confirm exact callbacks, scopes, provider approvals and intended model adapter.
3. Apply candidate migrations in an isolated database and run appropriate existing harnesses. Preserve synthetic-account cleanup protections. Never redirect these tests at production.
4. For production schema changes, verify authorization and target, take a usable backup and review compatibility/rollback. Apply reviewed migrations explicitly. npm run db:deploy is a mutation; npm run db:migrate-production is a separately guarded wrapper. Neither happens implicitly during npm run build.
5. Build/deploy through the authorized path. Record deployment ID, source, origin and schema state. Ready is a deployment status, not functional acceptance.
6. Run authorized live smoke tests, beginning with navigation/account access. Keep unverified capabilities honestly labelled. Inspect errors and queues before expanding enrollment.
7. Report isolated, live-provider and physical-device evidence separately. Progress from one athlete to five and fifty only after each gate has evidence.

## Candidate acceptance matrix

Execution rows start **Pending** until the completed candidate's results are recorded. This does not invalidate historical results; it prevents presenting them as proof of later changes.

| Gate | Required exercise and evidence | Status |
|---|---|---|
| Static/build | Typecheck, lint, relevant unit suites and production build; save command summary and candidate identity | Pending |
| Isolated schema/API | Existing integration, sync, launch, follow-up, conversation, Telegram and boundary suites as applicable; cleanup verified | Pending |
| Actual UI navigation | Click desktop sidebar, mobile navigation, help and Today coach links; open chat, load, type/send, reopen. Check deep links, refresh/back, loading/error states, console and failed requests. HTTP200/static rendering alone is insufficient | Pending |
| Authentication | Enabled Google/password signup/sign-in, existing-account linking, reset, logout/expiry and correct athlete/admin identity; disabled options truthful | Pending |
| Isolation | Two athletes; assigned/unassigned/revoked coach; administrator and private AI conversation boundaries; denied reads/writes fail closed | Pending |
| Manual athlete journey | No-device onboarding, dated baseline/zone provenance, readiness, cycle preview/confirmation, check-in and daily session; explicit uncertainty | Pending |
| Canonical training | Same selected ID/revision and steps across Today/calendar/export/messages/coach; edits supersede previous versions; stale approvals/feedback rejected | Pending |
| Recovery/actuals | Rest, illness/injury, missing baseline, partial/skipped/completed and corrected activity, multiple sessions; no extra training from reads or motivational messages | Pending |
| Nutrition parity | Same revision and quantities across consumers; total carbohydrate, tolerance/context, caffeine opt-in, measured/estimated hydration, rest suppression and turnaround; unwired inputs identified | Pending |
| Conversation writes | Editable transcript, proposals, confirmation, cancel, replay/idempotency, stale revision, timeout and model outage; actual configured provider and consent verified | Pending |
| OAuth/inbound sync | Exact return, account binding, scopes, refresh/revocation, durable history, provenance, correction/deletion, missing-data honesty, duplicate/out-of-order webhooks | Pending |
| Delivery transport | Approved revision published once, acceptance recorded, edits/cancellation reconciled, ambiguous timeout not blindly resent; one primary outbound route | Pending |
| Physical watch | Observe workout in Garmin Connect and identified watch model/firmware; verify steps, units, targets/alerts, completion and imported execution; record sport limitations | Pending |
| Scheduler/resilience | Hosting cron/runtime support, heartbeat, queue age, crash/lease recovery, retries/backoff, expired consent and rate-limit handling | Pending |
| Scale 1 → 5 → 50 | Authorized pilot and isolated load tests for concurrent users, backfill/daily sync; measure latency, failures, lag, provider budgets, duplicates and isolation | Pending |

## Delivery vocabulary

Downloaded file, sent email, accepted provider request, workout visible in Garmin Connect and workout observed on the watch are different events. Report the strongest observed event only. Keep watch receipt unknown without an acknowledgement or authorized observation. Synthetic FIT decoding validates representation, not physical compatibility. Completed-activity import alone does not prove execution of the intended structured workout.

## Evidence record

For each gate record candidate commit/fingerprint, deployment ID if applicable, timestamp/timezone, environment, command/exact UI journey, synthetic or authorized account role without private data, expected/observed outcome, redacted artifact location and exclusions. Repair failed gates and rerun affected checks. Pending gates must remain pending rather than becoming readiness claims.

DeepSeek remains the owner's intended AI provider; verify the actual adapter separately. This runbook does not configure a model or establish that every requested protocol, personalization input, provider or watch type is implemented.
