# Service simplification: local review candidate

This is a local code change against main `5be7fd4`, for integration with the
training/chat/onboarding review candidate. It is not a production rollout,
provider activation, subscription change, or statement of Strava compliance.
The requested scale is **59 athletes**, not a verified count of enrolled users.

## Changes prepared in code

- Athlinks is explicitly deferred. Authenticated search, link and refresh return
  `503 provider_deferred`; the shared provider helper and scheduled reconciliation
  also stop before network or database work. A saved key cannot activate it.
- The connection screen explains the optional race-history scope and links to
  manual races and personal bests. Existing imported records and saved connection
  status remain readable. An athlete can still explicitly unlink their own
  Athlinks connection; imported races are not deleted. Failed unlink requests do
  not display success. Manual race/PB handlers are unchanged.
- Intervals.icu and its existing publication/receipt safeguards remain unchanged.
  Provider acceptance still does not establish Garmin Connect or watch receipt.
- `PILOT_USER_LIMIT` becomes a finite, server-side total-account setting. Missing
  or empty uses the existing **50** default. Only decimal integers **1–100** are
  accepted; whitespace, fractions, zero, negative values, exponent notation and
  unlimited-like strings are invalid. Invalid configuration closes new enrollment
  with an effective limit of zero, while existing sign-in/recovery remains usable.
  The upper bound is an engineering safeguard, not load-test evidence or approval
  to expand enrollment. All roles still count under the existing transaction lock.
- The help page uses the effective configured limit; client copy no longer embeds
  a stale hard-coded 50. The administrator accounts API already uses the same
  server constant. The concurrency fixture is parameterized for the selected cap.
- `/api/coach` now explicitly passes `externalAiEligible: false`. Its direct-row
  filter is labelled insufficient for provenance; it is not presented as an AI
  compliance boundary. No AI adapter is activated by this patch.

## Owner decisions still required

1. Count the needed coach, administrator and retained test accounts. Choose a
   finite deployment value equal to **59 athlete accounts plus that actual count**
   (within this pilot's 100-account guardrail). No such value is selected here.
   Apply the approved value consistently to all serving instances and build/runtime
   configuration; validate concurrent signup, coach creation and social signup at
   the resulting boundary before expansion.
2. Separately verify the Strava app's owner, current subscription, approved tier,
   athlete capacity and rate limits. Do not downgrade the developer-owner account
   while the greater-than-10-user application depends on that subscription.
   Ordinary athletes need not buy a paid account merely because JMM uses the API;
   confirm the app's actual eligibility before inviting 59 connections. The JMM
   account setting does not raise Strava capacity or approve a capacity request.
3. Keep Intervals.icu only as the optional permitted-import/workout-delivery path
   already implemented. Review its actual app configuration and a real athlete's
   end-to-end delivery before promising device delivery. Do not enable flags,
   change OAuth scopes, or treat a different provider as a route around Strava.
4. Review the Strava data architecture with the app owner and qualified provider/
   legal guidance before expansion or any personalized external AI activation.
   No records, connections, credentials, subscriptions or production settings were
   removed or changed during this work.

## Strava policy and implementation blockers

The [official API Policy](https://www.strava.com/legal/api_policy), effective
June 1, 2026, restricts AI operation/context and derived data (§5.3), analytics and
combination (§5.4), retention beyond a seven-day cache (§6.2), and requires deletion
handling (§6.3/§7.4). Disclosure rules in §2.3 and the capacity-related wording in
§6.1 need reconciliation; coach consent alone is not assumed sufficient. These
are engineering review risks, not a legal conclusion.

The [official API FAQ](https://communityhub.strava.com/developers-knowledge-base-14/strava-api-faq-12906)
describes Standard access with review above 10 users and a developer subscription
requirement. A published tier ceiling does not establish this app's approved
capacity or guarantee review acceptance. Sources checked October 13, 2026.

### Observed paths on the inspected code baseline

- `src/lib/sync.ts` imports a first Strava history window of 365 days;
  `importers.ts` and `activity-store.ts` persist activity records. Matching an
  activity can complete a planned workout whose own source remains `plan`.
  Therefore removing `source=strava` rows does not remove derived adherence.
- `profile-import-review.ts` records provider weight observations;
  `profile-service.ts` can adopt Strava weight and retain before/after audit
  snapshots. Benchmark records have no comprehensive input lineage. Independent
  manual observations must stay distinct from copied provider facts.
- Fitness/PR APIs, `j-metrics.ts`, `activity-report.ts`, check-in execution budgets
  and training-cycle construction consume mixed-source records. Derived reports,
  earlier decisions and persisted conversation replies can retain their influence.
- The legacy rich briefing remains local-only. Its payload assembly still contains
  unverified mixed-source profile/history, so granting its boolean eligibility
  flag later would require a full provenance review.
- The conversation text adapter sends the current question, language and static
  educational catalog, rather than saved context. A pattern filter on arbitrary
  current text cannot prove it contains no copied Strava data. Conversation vision
  sends user-uploaded pixels; nutrition-photo is a separate Gemini image path and
  currently does not use `EXTERNAL_AI_ENABLED`. Uploaded images have no verified
  provenance boundary. This patch does not resolve those adapters.
- Assigned coach/admin views, coaching analysis and training export read mixed
  source records. They require a separate owner-only disclosure review.
- Generic disconnect clears credentials; deauthorization changes connection
  status. Activity deletion retracts direct records/matches, but does not
  comprehensively reconcile all prior reports, adopted profile/audits, plans,
  replies, queued payloads or other derivatives. No comprehensive seven-day expiry
  was found. A cleanup design must preserve unrelated/manual data and requires
  separate approval before any permanent deletion.
- `intervals-ingest.ts` rejects explicit Strava and unknown activity sources.
  Webhook reclassification can retract an old import; ordinary range sync merely
  skips newly disallowed rows. Wellness lineage and historic reclassification
  need review. Free-text source notes are not full field-level provenance.

### Bounded next remediation, before calling AI exclusion complete

1. Inventory acquisition and field/record lineage across direct imports, matches,
   profile adoption, reports, decisions, caches and persisted replies. Treat unknown
   legacy lineage as ineligible; disconnection must not erase restrictions.
2. For general education, consider sending only a server-controlled topic ID and
   static catalog. Do not send arbitrary question text if its origin is unknown.
3. Enforce an eligibility decision before every relevant provider dispatch and
   cache lookup, including both image routes. Query failure/unknown lineage must
   remain local-only. Consent is separate from provider permission.
4. Design owner-only viewing, retention and derivative-aware deletion/recomputation
   together; do not delete data or announce compliance from a quick source filter.
5. Test synthetic matched-plan completion, adopted weight, disconnected retained
   imports, stale caches, copied text, image payloads, query failures, and Intervals
   source reclassification. Assert zero model calls for restricted/unknown cases
   and preservation of unrelated manual records.

## Verification

Local checks: 1,257 unit tests passed; 26 capacity/enrollment checks also passed
with a synthetic `PILOT_USER_LIMIT=64` (a test value, not a rollout decision).
TypeScript passed. The production build passed with the repository test-font
fixture; the final combined candidate must rerun its full build/browser checks.
PostgreSQL concurrency and browser acceptance were not run in this isolated
checkout. No production
provider/device acceptance, subscription change, capacity approval or enrollment
load validation is implied by local tests. CodeRabbit CLI was not installed in
this executor, so no CodeRabbit review was run here.
