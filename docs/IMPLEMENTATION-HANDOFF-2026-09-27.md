# JMM implementation and continuation handoff — 27 September 2026

## Decision and delivery

Implemented changes in an isolated worktree of the original application, rather than handing over a proposal alone. Branch: `codex/jmm-coaching-integration`. Base: `4e2ae955d3a865efadd636eb674d4028e7de8212` (`science-v2-shadow`), not current `main`. The original checkout and live `jasmiamimethod.fit` deployment were not changed. Review this branch against the destination platform's latest work before integrating; do not replace concurrent changes blindly.

This is a tested engineering increment, **not certification that the entire application or any physical watch integration is production-ready**. The portable package includes source, a patch, Git history for this increment, and verification evidence. No provider credentials, athlete records, session cookies, environment files or dependencies are included.

## What changed and what it means

| Area | Implemented behavior | Remaining boundary |
|---|---|---|
| Connection authorization | Bound OAuth state to the initiating user, provider and same-app return; single-use state; corrected aliases and WHOOP scopes | Production app registrations, callback allowlists and actual Oura return flow require live acceptance |
| Background import | Persist connector and initial job atomically; persist webhook jobs before acknowledgment; leased workers, retry limits, backoff and crash recovery | Hosting scheduler must actually run; initial history remains 30 days, not months |
| Data integrity | Correct WHOOP energy units/sport mapping; activity updates/deletions reconcile plan matches; ambiguous matches abstain; preserve manual observations | Full field-level provenance, exclusive external-account linking and all provider deletion cases remain |
| Coach access | Pending assignments cannot read athlete data; athlete can grant/revoke; authorized administrator access retained | Review existing assignments before rollout; pending is no longer equivalent to consent |
| Shared profile and workout editing | Revision checks, atomic audit writes, validation, consistent athlete/coach edits; protect completed/skipped/measured history | Consumers of the APIs must adopt the new revision contract |
| Device-free use | Manual profile anchors, daily check-ins and dated benchmark results; explicit selection to apply eligible test to baseline | Missing HRV remains missing; lab imports and every sport-specific test are not covered |
| Onboarding | Repair unreachable wizard stages; load existing values, normalize optional blanks, preserve save revisions and stop on failures; truthful device availability | Baseline entry remains in Profile/settings and Labs rather than an additional wizard step |
| Conversation | Athlete and authorized coach/admin messages in Today and athlete workspace; idempotent sends and revocation checks | Polls every 30 seconds while visible; latest 100 messages; no read receipts or push notifications |
| Daily coaching | Personalized local coaching cue using saved preferences/check-in context; opt-out honored; local briefing fallback | A deterministic cue is not evidence that the entire periodization model is individualized or validated |
| AI | Chat cannot silently modify workouts; explicit per-question consent for external AI; automatic saved biometrics/profile context stays local | External AI requires configuration and provider-policy review; a typed question is still sent when consented |
| Supplements/science | Respect opt-outs; remove unsupported brain-protection claims; distinguish a study protocol from tested outcomes; remove fabricated progression assertions | Full supplement catalog, brands, labels, contraindications, dosing and sport-specific protocols need expert review |
| Device export | Honest JMM review JSON labeling; preserve prescription details instead of pretending Garmin compatibility | No verified Garmin/COROS/TrainingPeaks structured-workout publisher or watch receipt |
| Framework/runtime | Next.js 15.5.26 and async request API migration; remove duplicate icon route; disable shared demo login | Review deployment runtime and normal authentication configuration |

## Workflow now implemented

1. Athlete creates/edits a profile manually or authorizes an available provider. OAuth completion creates a durable import job. Authorization is not presented as proof that history is already imported.
2. The scheduled worker claims jobs. Imported activities and observations are reconciled with existing data; retries cannot silently turn an enqueue failure into success. Hourly reconciliation remains a fallback.
3. Daily coaching reads saved profile, available observations, recent activity and the check-in. Missing device data is not invented. Athlete can enter data and tests manually.
4. The athlete or authorized coach reviews changes in the shared editors. A revision conflict requires review instead of overwriting someone else's change. Applying a benchmark to a baseline is explicit.
5. Conversation provides context; messages and AI responses do not secretly rewrite prescriptions. The editor records an intentional change and its audit record. Changed prescriptions invalidate approval as applicable.
6. External workout publication is a separate, unfinished adapter layer. Downloading review JSON is not sending a workout to a watch. The eventual publisher must store the provider workout ID, revisions, delivery status and completion association.
7. Completed activity is matched cautiously back to training. Explicit athlete feedback and recorded history are preserved.

See [coaching contract](JMM-COACHING-CONTRACT.md) for intended behavior and [sync operations](DURABLE-SYNC-OPERATIONS.md) for the worker deployment contract.

## Verification and limits

Verification uses synthetic users and a dedicated UTF-8 PostgreSQL database on loopback. All 24 migrations applied from an empty database. Unit tests, real authenticated HTTP/database integration tests, TypeScript checks, production compilation and browser interaction checks were performed. The packaged verification manifest/logs record final counts and results.

The integration harness tests cross-athlete isolation, pending/granted/revoked consent, profile conflicts and validation, manual baseline updates, idempotent messages, device-free check-ins and cue opt-out, disabled demo login, non-mutating assistant commands, shared workout editing/history protection, audit records, admin reads and actual database queue concurrency/deduplication/crash exhaustion. It removes the synthetic records it creates.

Browser checks covered athlete messaging, profile editing, manual baseline recording, administrator message visibility/reply and profile editing, plus desktop and mobile layout. The final onboarding check loaded existing values, saved optional blanks, returned and saved again, continued without a device/race, and reached Today. A real browser exposed the duplicate icon route failure and broken onboarding stages, which were repaired. Browser checks do not establish complete accessibility or every screen's correctness.

No production credentials, provider approval, real wearable, real email/Telegram delivery, months-long backfill, load test, calibrated race-prediction validation or clinical safety validation was used. Local tests cannot prove those outcomes.

## Reproduce safely

Use Node 22 or compatible Node with `--env-file`, PostgreSQL, and the locked dependencies. Create your own local secrets. Do not reuse packaged/test session data (none is supplied).

```text
npm ci
npx prisma generate
npm test
npx tsc --noEmit
node node_modules/next/dist/bin/next build
node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3220
node --env-file=.env --import tsx scripts/coaching-integration-check.ts
```

The HTTP harness deliberately refuses any database except `127.0.0.1/jmm_original_integration_utf8_test`; create this disposable UTF-8 database and apply migrations before running it. It expects the app on port 3220, with the same database. Keep `EXTERNAL_AI_ENABLED=false` and omit live provider/mail credentials during this test.

**Updated deployment caution (6 October 2026):** this is a historical implementation handoff. The current npm run build only generates Prisma and compiles Next.js; no automatic build migration occurs. Follow [RELEASE-GATES.md](RELEASE-GATES.md). Verify the target, backup and compatibility before an explicitly authorized migration. This increment introduced 202609270001_coaching_messages and 202609270003_durable_sync_jobs; inspect all subsequent migrations for the actual candidate.

Set `CRON_SECRET`, encryption/session configuration and correct app URL through the host's secret manager. Confirm cron frequency and runtime entitlement; the five-minute worker configuration alone does not run a scheduler locally. Test rollback/recovery and queue observability before onboarding real athletes.

## API compatibility changes

- Profile GET returns `revision`; PUT requires `expectedRevision`. A stale write returns 409; fetch the latest state and let the user review. Do not auto-retry an overwrite.
- Workout prescriptions require the loaded workout revision. Feedback/history has separate protections. Clients must not reconstruct a prescription from stale calendar data.
- Benchmark POST must explicitly specify `action: record` or `action: schedule`. Applying an eligible baseline requires `applyBaseline: true` and a profile revision. Five-kilometer time is not silently treated as threshold pace; CP is not FTP.
- Pending coach assignments are denied. The athlete must grant access. Revocation applies to subsequent API access and conversation polling.
- Demo authentication returns 410. Approval GET is read-only; approval/delivery requires POST. Delivery success must reflect the sender's result.

## Highest-priority continuation work

1. **Close the actual watch loop.** Obtain Garmin Training API approval and credentials; implement supported workout schema, publish/update/cancel, provider IDs, idempotency and receipt handling. Run a real test athlete from JMM prescription to watch steps/alerts to completed activity. Then add approved COROS and TrainingPeaks adapters. Do not use Strava as a presumed structured-workout bridge.
2. **Live provider acceptance.** Verify Oura's consent return on `jasmiamimethod.fit`, token renewal, revoked access and cron polling. Test WHOOP/Strava authorization and retries with authorized test accounts. Enforce unique external account ownership or a deliberate documented sharing rule.
3. **Historical completeness and provenance.** Implement permitted paginated backfill with date coverage and progress; field-level source/time/unit/quality; retention and deletion enforcement; targeted WHOOP old-object changes/deletions. Display incomplete coverage instead of pretending months of history are present.
4. **Sports-science review.** Audit every prescribed session and cycle for sport, experience, goal, phase, workload and recovery. Independently verify human-study outcomes and applicability. The novice sprint assessment safeguard is not a finished sprint training engine. Version anchors with method/date/source and coach acceptance.
5. **Nutrition and ergogenic aids.** A qualified reviewer should validate eligibility, contraindications, evidence strength, units, timing, product labels and batch testing. Brands are not efficacy evidence. Do not infer a safe personalized dose from a generic evidence category.
6. **Operations at scale.** Queue dashboards/replay after diagnosis, token failure alerts, delivery receipts, rate limits, account/data deletion, monitoring, load tests and per-athlete synchronization health. Unknown message delivery should not be blindly retried.
7. **Forecast validation.** Back-test predictions and uncertainty by sport/terrain/conditions; disclose missing course/weather data. Avoid promising that a model prevents injury/illness or guarantees performance.

Provider references to recheck before implementation: [Garmin Training API](https://developer.garmin.com/gc-developer-program/training-api/), [COROS partner access](https://support.coros.com/hc/en-us/articles/53181766856724-Partner-API-Access), [TrainingPeaks API](https://help.trainingpeaks.com/hc/en-us/articles/234441128-TrainingPeaks-API), [WHOOP](https://developer.whoop.com/api/), [Strava API policy](https://www.strava.com/legal/api_policy), [Oura agreement](https://cloud.ouraring.com/legal/api-agreement). Scientific review starting points: [IOC supplement consensus](https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/) and [AIS Group A framework](https://www.ausport.gov.au/ais/nutrition/supplements/group_a).

## Prompt for the next platform

> Continue the supplied original JMM branch; do not rebuild or discard concurrent work. Read this handoff, JMM-COACHING-CONTRACT.md and DURABLE-SYNC-OPERATIONS.md. Compare its base commit with the current destination branch, integrate deliberately and reproduce the included tests in an isolated database. Preserve tenant isolation, explicit coach consent, revision-checked/audited changes, manual-data support and evidence limitations. First close the approved Garmin prescription-to-watch-to-completion loop and verify the live Oura OAuth return. Report separately: implemented code, local tests passed, provider prerequisites, live acceptance passed and unverified behavior. Do not label downloads as successful device delivery, invent missing biometrics, automatically overwrite training from chat, or present study protocols as proven human outcomes. Complete the prioritized backlog with reviewable changes and real acceptance evidence.
