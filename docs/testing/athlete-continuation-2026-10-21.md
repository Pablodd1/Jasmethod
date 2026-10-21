# Controlled athlete testing continuation — 21 October 2026

## Reconciled repository and production state

The earlier handoff is historical. GitHub records PR68 merged into PR67's branch
at 15:21:36 UTC, followed by PR67 into main at 15:22:06 UTC. Main is now
`14dbf2dd5780195cb306c40bb874267f40984eb7`. Its tree
`c1f9b879651e9e3e6c7c9d233139ffebb76bb240` is identical to the last reviewed
candidate `5a48b7e5a953284737a38ce1b412517664357006`; there are no new source
changes between those two states. PR48 remains open and is outside this review.

Fresh main acceptance [39625007904](https://github.com/Pablodd1/Jasmethod/actions/runs/39625007904)
passed all 42 steps. Downloaded artifacts were independently inspected: 15
reports covering 199 scenario groups, eight FIT binaries with valid integrity
and zero decode errors, 23 valid JSON files and 75 PNG containers. Reports that
record a commit match main. Recorded fixture cleanup and zero-egress assertions
passed. These are synthetic checks, not external-provider acceptance.

The canonical production hostname still resolved to READY deployment
`dpl_E8kXmZeNYx52sFU9p2wTUNEesUTN`, main `38c43a44df8744cb877545825a25d83f3cc5511c`,
when checked during this continuation. Vercel's deployment inventory confirmed
that no newer deployment appeared in the latest five records. Merging main did
not establish that the candidate was deployed. Recheck the alias immediately
before any supervised athlete test; do not deploy as a testing shortcut.

## Reproduced defects and corrections

1. **Fitness omitted partial actual work.** The route queried partial and
   substituted reports but then kept only `completed:true` for legacy PMC.
   It also filled missing actual duration with planned duration. It now reuses
   `hasPerformedTraining` and `activityActualMinutes`, preserves reconciliation
   and provenance gates, and makes load/execution unavailable when actual
   duration is missing or invalid. The legacy completion score cannot represent
   partial/substituted outcomes, so it is explicitly unavailable for those
   reports while their actual work remains counted in load. It must not label a
   half-completed session as 100% completed or "Excellent execution."
2. **Bounded measurements hid conflicting sources.** One hundred current
   observations could hide a conflicting 101st reading while still selecting a
   usable value and suppressing the numeric question. A sentinel distinguishes
   an exact complete boundary from overflow. Incomplete evidence selects no
   coaching measurement and leaves numeric questions available; raw readings
   and bilingual limitations remain visible. SDNN/rMSSD separation is retained.
3. **Short review bypassed incomplete recent actuals.** A previous day's
   reported session with unknown effort could qualify although the full review
   applies the existing conservative execution rule. The short path now reuses
   that service over reconciled recent evidence. Unknown duration, effort or
   outcome requires the full review. Explicit RPE zero and skipped reports
   remain distinct from missing information.
4. **In-flight Strava event fetch outlived its binding.** Both by-ID fetch paths
   could persist after disconnect/deauthorization or reconnect. They now
   revalidate capability, athlete/provider identity, status and token snapshot
   before and after fetching, using the existing sync lifecycle pattern.
   A stale check cannot fall through into another provider fetch or mark the
   event processed. This does not cancel an already in-flight provider request
   or establish atomic cancellation once persistence has begun. New ingestion
   remains off by default pending policy review.

These changes use the existing coaching, evidence, review and connector
services. No second engine/store, dependency, schema or migration was added.
The continuation branch explicitly inhibits Vercel Git deployments.

## Verification scope

Corrected source passes 1,867 unit tests with zero failures/skips, 27 follow-up
boundary/transport tests, TypeScript and lint. Lint retains the two documented
hook warnings. Focused regressions cover partial/substituted actuals, missing
duration, linked copies, restricted provenance, observation overflow, recent
incomplete execution, and deferred-fetch connection changes.

An intermediate local production build passed after host execution resolved
Windows DLL/filesystem and font-network restrictions. Final exact-head build,
authenticated PostgreSQL acceptance and mobile persistence must be evaluated
from this continuation PR's workflow and artifacts; the earlier main run is
baseline evidence only. No local isolated PostgreSQL installation was available.
Local browser sandbox startup/navigation failures are not acceptance passes.

The fresh official npm audit reports zero runtime vulnerabilities and seven
high development-tooling findings. The configured npm mirror lacks the audit
endpoint; verification used `--registry=https://registry.npmjs.org` without
changing registry settings or dependencies. The existing toolchain disposition
remains open. CodeRabbit CLI was unavailable; independent engineering/security
source reviews and regression tests were used instead.

## Athlete flow and remaining gates

The daily contract remains: saved workout first, independent context/sync,
usable permitted measurements before questions, explicit current review,
separate canonical revision approval, supported export, actual report and
conservative subsequent adjustment. Reads/retries must create no workouts.
The corrections prevent incomplete evidence from becoming known capacity or
short-review clearance. Full review remains available when the short path holds.

Production environment **names only** were rechecked. `INTERVALS_CLIENT_SECRET`
is still absent. Names do not establish flag values, provider permission,
registered redirect URIs, working grants, transport receipt or device delivery.
Do not enable any connector/sending/stream flag merely because a name exists.

Owner/provider actions remain those in the capability matrix and owner runbook:
verify the exact existing Google client and both callbacks; secure Intervals
approval/configuration; separately verify Oura/WHOOP consent, refresh/history;
verify actual email/Telegram receipt and timing; test actual Safari and hardware.
Garmin remains partner-gated; COROS normalized sync/publication and a JMM
Tredict adapter remain unavailable. FIT validity proves file semantics only.
Strava policy, historical ancestry, retention/privacy delivery and broader
cross-person disclosure remain release gates. Personalized forecasts stay off.

Two inactive helpers need review before activation: `weekly-review.ts` still
uses unreconciled completed totals and planned-minute fallback; no runtime
caller exists. `applyDailyExecutionContext` does not itself hold on a truncated
workout list; its only callers found are tests. Neither is activated here.

## Controlled testing and release decision

1. Inspect the continuation PR's exact-source workflow/artifacts and fixture
   cleanup. Use isolated synthetic athletes and blocked provider egress.
2. After a separately authorized staging release, run an incomplete/manual
   profile through saved Today, current review, conversational revision,
   approval, decoded export, repeated import and revision-aware actual feedback.
3. Include partial/substituted sessions, missing RPE/duration, source conflicts,
   symptom/time reset holds, two genuine daily sessions and ambiguous copies.
   Repeat the main journey in English and Spanish on mobile.
4. Only after owner/provider acceptance, test one consenting athlete and one
   supported external path. Record provider acceptance and actual destination
   receipt separately before expanding toward the 50-user, no-charge pilot.

PR67/68 are already merged; their former merge-order advice no longer applies.
Review this continuation against current main. A passing synthetic workflow
supports controlled testing, not unconditional production/full-launch approval.
No merge, deployment, migration, credential/grant change, real send or athlete
record mutation is authorized by this report. The unrelated research edit was
preserved and excluded from all commits.

Before a later authorized release, record the previous READY deployment and
database backup. Roll back with reviewed reverts or the prior deployment,
preserving public-site/security work and raw athlete history. Disable unverified
ingestion/sending first; keep deletion/retention controls. Source rollback cannot
recall files/events or restore changed external records. No new migration is
needed for these corrections.
