# Workout backup delivery review

Review branch based on main `3be1c623ffc4161d3d4233cdebe483a4e5c1e46d`.
No merge, deployment, production credential change or real provider send was performed.

## Changes

- Email FIT attachments exclude arbitrary notes, group labels, custom workout titles and custom step labels. Explicit structured exercise/station identity and exact targets/endpoints remain; source approval revision is unchanged. Companion safety limits are revalidated after relabeling so essential reps/LAP/load instructions cannot be truncated; oversize instructions fail closed. Authenticated downloads are unchanged. Split ZIP workouts remain excluded from provider attachments.
- Both workout email transports require implicit TLS or STARTTLS; certificate verification is not relaxed. SMTP servers without encryption will fail rather than receive plaintext messages.
- Selected `/daily?sessionId=…` links resolve the current athlete-owned date, including past/future/rescheduled sessions. Off-day safety/readiness remains blocked by the existing effective-prescription boundary.
- Calendar reconciliation retracts linked sessions moved outside the publication window, preserves a retryable mapping on deletion failure, and retains unchanged historical entries. Unknown start times become explicitly described all-day placeholders. Snapshot revisions include scheduling/content/readiness. Provisional events are tentative, and a matching provider event acknowledgment is required for success.
- Telegram daily-plan delivery can include a single FIT and a time-scaled PNG when every endpoint is timed. Actionable text and files require the exact current athlete-approved revision, current local date and, when a start time is supplied, delivery before that time. An unknown start is not invented. Consent/readiness/revision are rechecked before every provider request.
- Telegram consent is now `telegram-coaching-workout-files-v2`. Old consent stops delivery until renewed through the bilingual disclosure. Pausing does not silently renew consent.
- Telegram records text/FIT/graphic receipts individually. Partial and ambiguous outcomes are terminal and never automatically resent. Preflight cancellation is recorded before any network call.

## Verification

- `npm test`: final isolated run 1,115 passed, zero failed. An earlier concurrent build/test run briefly lost the shared generated Prisma client (one module-load failure); the isolated rerun passed without source changes.
- `npm run test:followup:boundaries`: 27 passed, zero failed.
- Independent source/security review found two safety regressions (ungated Telegram text and relabeled HYROX endpoint truncation); both were reproduced, fixed and independently re-reviewed, with 41 focused tests passing.
- TypeScript no-emit check: passed.
- Lint: passed with two pre-existing hook-dependency warnings in unrelated components.
- Production build: passed with a local font fixture and synthetic-only database URL.
- Added synthetic integration coverage executes actual service/API control flow with injected database and provider fixtures: private FIT decode, stale email revision cancellation, date/tenant isolation, calendar reconciliation/provider acknowledgment, Telegram multipart receipts, revocation/revision races, consent renewal and duplicate suppression. Approval-gap regressions explicitly cover unapproved, missing/stale approval, already-started sessions and approval loss before any text request.

## Remaining acceptance requirements

- No real SMTP inbox, Telegram private chat, Google Calendar account, Garmin/device transfer or watch execution was tested. Provider acceptance is not receipt, reading or watch delivery.
- Full PostgreSQL-backed acceptance was not rerun: this execution environment has no PostgreSQL binaries. Mocked database integration does not establish database transaction behavior under real contention.
- Mobile consent browser regression was attempted in an isolated cloud Chromium process with mocked APIs. Chromium could not create its required Unix socket, including an approved escalation attempt, so rendered UI/keyboard acceptance remains unverified.
- CodeRabbit CLI is unavailable in this environment; source/security review and local tests were used.
- Branch-only publication does not trigger this repository's CI, which runs for main pushes and pull requests. No PR was created or CI success inferred.
