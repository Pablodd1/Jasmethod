# Daily imported evidence and completion context — 21 October 2026

This is local implementation and synthetic test evidence. Production duplicate counts, provider authorization and device receipts are **unknown**. No production records were queried or changed for this work. The helper adds no route, schema, training engine or workout store.

## Source and time contract

`src/lib/daily-input-context.ts` reads at most 100 owner-scoped metric observations from 14 local calendar days and 100 activity/report records from yesterday and today (approximately 48 hours; daylight-saving transitions change the elapsed hours). It also reads existing owner-scoped reconciliation decisions and bounded connector state. It uses the existing `MetricObservation` and `Workout` records, rather than the mixed-provider `DailyMetrics` projection.

Each supported metric has a status (`usable`, `missing`, `stale`, `conflicting`, `invalid`), a selected usable observation or null, its source, units, method, quality, classification, stored observation time, record-creation/import-time basis and any limitations. Original upstream provenance and exact sensor timestamp precision are not present in the metric schema. They remain unknown instead of being inferred from a provider name. `createdAt` is labeled as observation/workout creation time; it is not asserted to be a latest provider-retrieval receipt. Uploaded-file readings remain unverified measurements.

Numerical coaching and question suppression require positively allowed origin as well as usable quality, units and range. Restricted or unknown-origin observations stay available as the latest raw reading, with an explicit provenance reason, but are not selected for coaching. A measurement method such as optical sensor or chest strap does not override its origin. Withholding a reading does not establish normal recovery.

The explicit product freshness policy is the athlete's current local date, not a clinical threshold. Earlier-date readings are stale for suppressing today's optional numeric question. Fresh sources that disagree require review; values are never averaged. RMSSD and SDNN remain separate. Sleep duration and provider scores do not answer subjective sleep quality, energy, soreness, stress, motivation or current safety questions. The `questions` flags mean "unanswered by imports"; callers still honor explicit current answers already saved by the athlete. Missing values are never converted to zero or normal.

Intervals wellness currently records `qualityFlag: incomplete` and no upstream measurement identity. Such values require review instead of being silently promoted to verified measurements. No readiness/HRV baseline or medical clearance is fabricated.

If optional observation storage is absent or lacks the queried columns (Prisma `P2021`/`P2022` on the observation read only), `readStatus` and `dataAvailability.observations` are `unavailable`, selected measurements remain null and saved activity history stays readable. General connection/authentication errors and failures from activity/history reads still propagate; they are not disguised as missing data.

## Existing decision path

The supported activity path already normalizes provider summaries in the importers, stores them through `storeActivity`, and links a planned session only when a same-owner/date/sport/duration match is unambiguous. The existing reconciliation service groups linked or corroborated copies and preserves explicit decisions.

The daily helper reuses that service and supplies curated actual-duration/RPE/outcome inputs to the existing `applyExecutionFeedback` service through `applyDailyExecutionContext`. It creates no score, prescription or progression rule. Tests demonstrate:

- An imported 45-minute completed summary suppresses a redundant duration question while leaving missing subjective RPE unanswered. The existing service receives 45 actual minutes, a stored-completion outcome and missing RPE, and returns its existing conservative 0.6/easy decision.
- Explicit RPE 3 causes no automatic progression; confirmed RPE 9 receives the existing 0.85 reduction.
- A linked 40-minute plan and 42-minute actual record count once and retain a +2-minute comparison. The primary record's missing RPE is not borrowed from another source.
- Existing illness holds survive imported recovery evidence and easy completion unchanged.

This evidence covers normalized stored inputs through the deterministic decision service. It does not establish a real provider-to-production-to-device round trip. The helper's approximately 48-hour completion context must not replace older pending/missing-execution or other safety checks. No synced activity means unknown coverage, not no training or a confirmed rest day.

Strava-origin and unknown-origin values retain their provenance restrictions, including relayed `Original source: STRAVA` records. Raw own-history minutes remain visible, while contaminated activity totals and plan comparisons are unavailable and `executionFeedback` is empty. The execution wrapper treats this as an insufficient-data hold, preserving existing safety holds, rather than interpreting an empty list as no training or clearance. This context must never be placed in an AI prompt. Private titles, medical notes, arbitrary error strings and raw external activity identifiers are not returned. Recognized upstream tokens are projected without the surrounding importer notes.

The shared `derived-activity-policy.ts` uses the existing positive provenance whitelist. JMetrics checks every performed source record in the selected window before grouping or ignoring linked plans. A restricted/unknown copy makes the aggregate and trend unavailable even when an allowed primary was selected explicitly. Individual restricted JStress is unavailable. The owner-only fitness route likewise makes PMC and execution/compliance analytics unavailable with an explicit reason; it never drops those activities and reports a smaller or zero load. Source records are unchanged.

## Reset and short-review boundary

The offline audit reproduced a check-in reset deleting an urgent answer while leaving a timed saved prescription with `originalPlan: null` intact. The short review could then accept it without the prior restriction. The replacement regression executes the actual DELETE route and short-review service with injected in-memory storage. The effective prescription now reads owner-scoped, current-local-day reset audit snapshots and carries any unresolved positive symptom/recovery/time restriction into eligibility and revision checks. Repeated resets cannot erase that marker. A later complete full check-in with server metadata and a newer recorded time can resolve it; a short review or unknown answers cannot. Yesterday's restrictions are not made permanent and no illness is inferred from missing answers. No schema or check-in DELETE behavior was changed for this guard.

## Duplicate dry run and safe proposal

The read-only `duplicateReview` output reports record IDs, reasons, proposed actions and `destructiveChanges: 0`. It does not delete, merge, relink or supersede anything.

| Synthetic case | Retained records | Dry-run result |
| --- | ---: | --- |
| Two records sharing one provider/external activity ID | 2 | `review`; uncertain aggregate minutes are null, not zero |
| A plan linked to its completed import | 2 | `retain_linked_records`; one existing evidence group |
| Two distinct sessions from one provider | 2 | No duplicate proposal; both sessions retained |
| Unresolved near-start cross-provider observations | 2 | `review`; no automatic identity assertion or summed total |

Completed records and athlete feedback are retained. Existing plan links remain links. Current explicit same-session or different-session decisions are honored instead of reopening the same duplicate proposal. Existing superseded suggestions are not reactivated or newly superseded by this helper. Any future proposal to supersede an obsolete unperformed plan belongs to the existing reviewed plan workflow. Ambiguous provider identity requires explicit review. No production cleanup or destructive migration is proposed or authorized by these synthetic results.

## Verification scope

The focused tests cover fresh/missing/stale/invalid/conflicting observations, true zero, source classification, absent timestamp precision, RMSSD/SDNN separation, subjective/safety questions, local midnight/DST, imported completion reaching the existing decision engine, planned/actual links, explicit primary RPE, multiple sessions/bricks, provider ambiguity, duplicate dry runs and existing decisions, ownership, restricted provenance, bounded projected reads and no source mutations.

Executed locally on 21 October: the initial context/engine/import suite passed **56/56**. After the derived-analysis guard and optional-storage fallback, the daily-input-context, derived-policy/actual fitness-route VM, JMetrics, activity-evidence, Strava-provenance and coach-conversation/service suites passed **137/137** (including 21 context tests and six dedicated derived-policy/route tests). The final context/policy rerun passed **27/27**, including preservation of urgent holds and propagation of non-observation schema errors. `node node_modules/typescript/bin/tsc --noEmit --incremental false` passed after the guard integration. Final build and route/UI acceptance are recorded by the parent review. No production/provider/AI requests, migrations, commits or deployments were performed by this subtask.

The reset, metric-origin and harness follow-up passed **71/71** focused source tests, including six reset tests and the actual DELETE/short-review VM regression. Acceptance-script fixtures were inspected and prepared for CI, but their PostgreSQL/HTTP runs were not executed locally: allowed Coros/Garmin fixtures retain the intended reconciliation assertions, stored Strava history has a separate insufficient/hold scenario, and disabled OAuth/sync asserts a paused state without enabling ingestion. Raw-history-only Strava fixtures remain restricted history examples. CI configuration was not edited by this subtask.
