# JMM coaching workflow, logic, data and connection QA

Date: November 3, 2026. Agent assignment: `/root/coaching_flow_qa`.

## Scope and limits

Inspected current repository instructions and code, executed local tests, and reproduced an unplanned-activity duplicate using the real route with an isolated synthetic transaction stub. No real database writes, provider messages, credential reads, browser actions, deployments, merges or commits were performed by this agent. Build and browser ownership remained with the root agent to avoid Windows Prisma engine locks and competing browser control.

The checkout contains pending dual-domain edits which were preserved. Therefore the baseline local suite count includes those tests and is not a claim about the exact deployed main tree. Production account counts and the prior live AI test are parent-provided evidence, not newly collected live acceptance by this agent.

## Executed verification

| Check | Result | Evidence |
|---|---|---|
| Full `npm test` before focused corrections | PASS, 2266 tests; 0 failed/skipped | `npm-test.log` |
| `npx tsc --noEmit` before corrections | PASS | `typecheck.log` |
| Targeted lint across onboarding, starter, planning, chat, check-in, workouts and feedback | PASS | `lint.log` |
| Cycle reason correction: existing route + shaping tests | PASS, 39 tests | `cycle-reason-tests.log` |
| Combined focused cycle, athlete-model, route and provenance tests after corrections | PASS, 50 tests; 0 failed/skipped | `focused-fix-tests.log` |
| `npx tsc --noEmit` after corrections | PASS | `typecheck-after.log` |
| Targeted lint after corrections | PASS | `lint-after.log` |
| Identical manual activity requests replay probe | REPRODUCED DEFECT: two identical POSTs produced two synthetic rows, 201 + 201 | `manual-replay-probe.ts`, `manual-replay-probe.json` |
| Manual activity replay repair: request state, actual route, rollback, ownership and legacy compatibility | PASS, 15 focused tests | `manual-replay-fix-tests.log` |
| Typecheck and lint after manual replay repair | PASS | `typecheck-manual.log`, `lint-manual.log` |
| Production build | Not run by this agent; root coordinates after agents settle | — |
| Real OAuth/account/device/transport end-to-end | Not executed; cannot infer from synthetic tests | — |

All evidence above is in `.local/cto-competitive-2026-11-03/`. Root must run the final integrated suite after other agents' changes settle.

## Highest-priority findings

### P0 — selected sport does not ensure a saved cycle

`src/lib/plan-auto.ts:autoGenerateStarterPlan` is a compatibility status reader. It returns `created:false` both when a plan exists and when no plan exists; it never creates `TrainingPlan` or `PlanDay` rows. Even a ready setup returns `preview_confirmation_required`. `src/app/api/onboard/route.ts` calls it after `ensureStarterWorkout`, catches starter/generation errors, and still returns `ok:true,next:'/today'`.

Parent live audit reported four onboarded athlete accounts with selected goals, only one active cycle and three missing cycles; all three have a saved planning setup. This directly contradicts the user's requested mandatory first-plan behavior. A selected sport is not enough to make the existing endpoint generate a cycle.

`ensureStarterWorkout` can create one conservative same-day suggestion but stops when any active plan exists, even if that plan is expired or has no future usable session. It does not provide a weekly/monthly cycle. The generic starter maps triathlon goals to running and HYROX to mobility; it is explicitly labelled a product suggestion rather than individualized performance training.

Required acceptance: an athlete choosing a supported sport reaches a saved, visible provisional schedule with a nonempty next action or an explicit real safety hold. Saving profile/onboarding must never claim a plan exists unless a saved receipt can be loaded. Existing-account repair needs an idempotent coverage audit/backfill which preserves completed history and current valid cycles. Plan creation and exercise clearance must remain separate.

### P1 — recovery reason fabricated positive execution evidence (corrected locally)

PR113 manual-baseline mode sets `recoveryReview:true` to preserve conservative handling of unknown imported load. `shapeTrainingCycle` interpreted that flag as reported difficult or incomplete activity and emitted that claim into `volumeDecision.reason`.

Local correction adds optional `recoveryReviewBasis` and passes `unknown_history` from the explicit reported-baseline branch. The reason now says load and recovery are unknown. The .6 reduction, sessions, all physiological rules, rest/event protections and template behavior are unchanged. Tests compare both branches' dose and exact sessions and exercise the real generation route.

### P1 — blocked history displayed as zero history (corrected locally)

`/api/athlete-model` correctly excludes Strava/unknown-origin activity and excluded biometrics before building its local model. It supplies empty arrays, producing `coverageDays:0`. `CoachOnboardingCard` ignored returned provenance and stated “I have 0 days of history,” conflating unavailable history with no training.

Local correction adds an additive `historyCoverage` contract: positively eligible observed coverage or `withheld/days:null`. Existing model fields and blocked-data exclusion remain unchanged. API responses are `private,no-store`. The card uses positive provenance before rendering a numeric coverage statement, reports unknown coverage honestly in English/Spanish, and removes the unsupported “without overload” guarantee and connection dependency from that paragraph. Route tests prove owner-scoped reads, anonymous rejection before database access, restricted-row exclusion, and no canary leakage.

### P1 — unplanned manual activity was not replay-idempotent (corrected locally for request-ID clients)

`POST /api/workouts` validates explicit actual activity and writes an audit record, but has no request-id ledger, duplicate claim or replay receipt. The synthetic route probe sent the same date/sport/duration/RPE/title twice and created two distinct rows. A UI disabled button alone cannot protect ambiguous network outcomes or retries.

Required acceptance: stable client request ID, athlete-scoped unique claim, replay returns the original saved receipt, changed payload under the same ID conflicts, and a second athlete cannot recover the first athlete's receipt. Never deduplicate legitimate separate sessions merely because their measurements happen to match.

Focused repair now uses a deterministic athlete/request-scoped AuditLog ID, SHA-256 request fingerprint, advisory lock and serializable transaction. Same ID/body replays the original row; changed body conflicts with 409; new intentional requests can report identical-valued separate sessions. Receipt and workout commit or roll back together, bounded database conflict retries produce no provider effects, corrupt/foreign/missing record receipts fail closed, and new actual reports remain unapproved.

The Calendar producer creates a logical request ID, keeps it through network/unknown-result failures, changes it for a changed payload and clears it after verified save. It verifies the echoed request ID and saved workout ID before saying Saved, guards in-flight double submits and account changes, and disables form edits while pending. This state is held in memory; no raw report/notes are persisted to browser storage. Reload recovery is not claimed.

For compatibility, legacy API clients omitting `clientRequestId` still work and explicitly receive `replayProtected:false`; they remain outside the deduplication guarantee. This is not fuzzy time/measurement deduplication. Tests use the actual route with synthetic transactional state; real PostgreSQL concurrency remains a root/CI integration gate.

### P1 — conservative event windows flatten large portions of a race cycle (unfixed)

`cycleEventPolicy` applies preparation by priority (A14/B7/C3 days), with recovery 7 days unless distance is classified as middle/long. Those are labelled conservative heuristics. `shapeTrainingCycle` applies the minimum day factor across an entire seven-day block, removes protected event dates, and can downgrade quality throughout any block overlapping preparation/recovery. Thus a short B event and a later A event can suppress most of a short race build. A green test confirms existing arithmetic, not appropriate coaching dose for a trained athlete.

Required acceptance: show the reason per affected day/session, distinguish event importance from effort/recovery demand, preserve an explicitly reviewed sport-specific race build when appropriate, and avoid globally promising validated recovery windows. Changes to dose/clinical policies need the appropriate coaching review; this agent changed none.

## Workflow and capability matrix

| Path | Existing useful behavior | Gap / test interpretation |
|---|---|---|
| Select sport / finish onboarding | Authenticated profile, saved setup, starter mutation | Does not ensure a cycle; success can coexist with generation failure |
| First day with incomplete information | Conservative starter suggestion; missing physiological targets not invented | Generic 20-minute suggestion, not a sport-specific plan; HYROX uses mobility |
| Starting-week fallback | Seven reviewable dates, existing/event protection, bounded familiar observations | Explicit preview/confirm; maximum 60 minutes across at most three slots; cannot represent an advanced athlete's weekly cycle |
| Full cycle preview/save | Sport coverage checks, custom triathlon legs, Monday strength/double-day preferences, fingerprint and serializable checks | Can block on data provenance; manual branch is provisional, not verified performance coaching |
| Open Today | Fast saved-plan display, separate rich context, selected-session state | An active old plan can suppress starter creation; planned and executable state must remain visibly distinct |
| Synced health inputs | Current local-day freshness, source/type/unit checks, RMSSD distinct from SDNN, conflicting/missing values preserved | Imported sleep duration is not subjective sleep quality or symptom clearance; do not claim full readiness from connection status |
| Daily check-in | Safety/availability checks, reduce-only adaptation, explicit current-workout review | Short wearable-assisted workflow remains separate PR112 per parent audit; don't claim deployed from its source alone |
| Workout review/edit | Canonical revision checks, actual history protected, approval cleared on changes | A successful edit is not delivery; unresolved provenance/actual load still matters |
| After workout | Actual minutes, RPE, outcomes, notes and optional weights are accepted by existing update paths | Complete/partial/substitution remains separate from a planned duration; local request-ID replay repair now covers new Calendar manual creates |
| Next-day adjustment | `applyExecutionFeedback` uses actual minutes × RPE, lowers for hard/incomplete reports, no catch-up work | This is a conservative heuristic; missing reports remain unknown and can repeatedly limit later sessions |
| Chat natural conversation | Optional consented own-message channel with isolated history; model errors never become success | External model cannot see protected JMM cards, profile, workouts or imported context; a more powerful model does not remove this boundary |
| Chat read tools | `review_today/profile/cycle/races` actions open protected inline cards | Model must not pretend it read their contents; show provenance/context availability clearly |
| Chat edits and plan actions | Proposal→explicit review→validated save, CAS, receipts and duplicate/replay tests | Several intents are local pattern classification; unsupported language must be explicit instead of confidently unrelated replies |
| Voice | Uses same chat tools after transcript review; text remains available | Hardware microphone and transcription/provider permission tests require browser/device acceptance, not node unit tests |
| Human handoff | Separate verified Telegram pairing/communication paths and minimal notification contracts | Provider acceptance, correct athlete routing and failure/retry remain real end-to-end gates |

## Connection / delivery audit

These are code-boundary observations, not new real-account connection tests:

- Connector reads are authenticated and user-scoped; structured workout publishing and automatic device delivery are separate capability fields.
- WHOOP's `configured:true` also represents its upload fallback; `method:'oauth'` is separately gated by credentials. UI logic correctly checks method for sync, but reports should not call this proof of live OAuth.
- Garmin/COROS upload capability descriptions explicitly say automatic import and structured delivery are unfinished. Native COROS/Apple capability routes separately report protocol review/pilot state and `watchReceiptVerified:false`.
- Google Calendar import/publish implementation and failure tests exist. A connector's “connected” status cannot prove a specific event was delivered.
- Email preference, inbox verification, approved canonical revision and provider receipt are distinct gates. Telegram likewise has verified destination/pairing and delivery receipts. Existing tests cover failures and duplicate dispatch, but no actual sends were made here.
- Every imported/unknown-origin history boundary must stay intact while learning from competitor UX. Do not copy competitors' claims about complete athlete memory into JMM's external-AI disclosure.

## Reusable architecture for the chat-led product

Use deterministic, athlete-scoped context and tools as the source of numeric decisions. Make the chat the entry point to a visible plan and a short “what changed and why” review. A model explanation cannot become a write or delivery receipt. Keep generated/proposed, saved, queued, provider-accepted and watch-delivered states distinct. The app should ask for a missing piece only at the point it affects the requested action, and should not send athletes to an empty training page because unrelated optional data is missing.

## Files changed by this agent (uncommitted)

- `src/lib/training-cycle.ts`
- `src/app/api/plan/generate/route.ts`
- `src/lib/training-cycle.test.ts`
- `src/lib/training-cycle-route.test.ts`
- `src/lib/athlete-history-coverage.ts` (new)
- `src/lib/athlete-history-coverage.test.ts` (new)
- `src/lib/athlete-model-route.test.ts` (new)
- `src/app/api/athlete-model/route.ts`
- `src/components/coach-onboarding-card.tsx`
- `src/app/api/workouts/route.ts`
- `src/app/calendar/page.tsx`
- `src/lib/manual-workout-request.ts` (new)
- `src/lib/manual-workout-request.test.ts` (new)
- `src/lib/manual-workout-route.test.ts` (new)

No existing physiology thresholds or mechanical/metabolic energy calculations were edited. Root owns the final integrated review, regression, build and release decisions.
