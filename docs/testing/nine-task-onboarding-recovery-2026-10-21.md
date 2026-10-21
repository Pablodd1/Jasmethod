# Tasks 7–8: recovery diagnosis and onboarding/check-in audit

Source baseline: `8f0291b` on `codex/jmm-nine-task-acceptance`, 21 October 2026. This document describes synthetic source/handler tests and the proposed corrections. It is not production acceptance, provider authorization, medical clearance, or permission to rewrite historical rows. The existing dirty research document was preserved.

## Demonstrated recovery root cause

The full-check-in route previously passed an unknown-safety adaptation through `prescribeToday`, then persisted its zero-minute `Rest and recover` output over the saved workout's title, type, intensity and duration. `originalPlan` retained the earlier source. The shared canonical resolver then classified any zero-minute row as rest **before** consulting unknown safety. Consumers consequently received an actual `rest` verdict and "Rest day has no workout to export" despite unresolved evidence. The effective-prescription fallback also projected canonical blocks as recovery/Z1/rest. The separate daily-recovery card already distinguished missing check-in and review needed; renaming that card would not repair the saved-row/canonical chain.

Corrections retain unknown-safety answers and adaptation, revoke prior approval, and leave saved workout instructions intact. Existing zeroed records remain unchanged in storage. Unknown safety now resolves to blocked before the zero-duration fallback; explicit planned day-off and injury holds retain their existing behavior. A blocked historical adaptation may display the retained original title/type for review. No duration, executable steps, numerical targets, exercise permission or extra training is reconstructed. The canonical revision still changes with current safety/context.

`canonical-fit.test.ts` exercises a previously zeroed source through the effective resolver and universal card: the original session identity is visible, verdict is blocked, duration is zero, steps are empty and export capability is unavailable. Its genuine planned-day-off and injury variants remain rest. `checkin-metric-origin.test.ts` executes the actual POST/GET route under injected storage: incomplete answers persist while the saved 30-minute ride remains intact, approval becomes false, retry preserves one ID, reload retains the answers, and a separate athlete's row is unchanged.

Scoped short reviews remain limited to the current session. Today derives the presentation marker only from the matching canonical-ready session and its current eligible review. Daily presentation retains `safetyStatus: unknown` for unanswered scales. A second blocked session still produces review-needed; missing/stale scoped identity does not clear anything. Ordinary Z2 training, Z1 easy training, planned rest, no plan, symptom holds, new feedback/unknown activity load and multiple sessions remain distinct. Stale sync remains connection evidence, not a recovery prescription. Daily sleep/food/relaxation support adds no exercise.

## Question consumers and progressive entry

The short route already uses one `DetailedAthleteSetup` through `PilotOnboarding`. It can skip devices, review stored data, save optional goal intent, and arrive at Today without generating an individualized cycle. The existing `assessPlanningSetup` gate remains authoritative when a cycle is requested. No safety/planning question was removed. Optional thresholds are now collapsed during short entry; advanced mode and an unfinished threshold draft keep that section open.

| Question / fields | Existing downstream consumer | Needed to begin / personalized plan | Evidence reuse and presentation |
| --- | --- | --- | --- |
| Device / file source selection | Connector authorization, import-review endpoint | Optional for both | Connection, queued refresh, stored history and analysis are separate. Failed review clears stale success; no account permission is inferred. |
| Goal / sport | Starter sport selection, planning goal validation and cycle templates | Optional for workspace; supported goal required for personalized cycle | Saved explicit goal is shown; unchanged goals are not resubmitted. |
| Goal in own words | Planning-setup gate, coach context | Optional for workspace; required for personalized cycle | Saved text is reused; no performance prediction is inferred. |
| Training horizon / 12 or 24 weeks | Planning-setup gate and cycle preview | Optional initially; required for cycle | Saved horizon is displayed; no race date is invented. |
| Experience / explicit confirmation | Experience defaults, planning-setup and double-day gates | Deferred to personalized setup; required there | Database defaults alone are not athlete answers. Explicit saved answers hydrate. |
| Weekly hours | Retained profile and coach settings | No first-use question | Existing values remain stored; onboarding asks tolerated recent minutes instead of a duplicate weekly-hours question. |
| Adult confirmation / birth year | Adult-pilot gate, starter restrictions, youth policy | Adult confirmation needed for automated individualized planning; birth year optional | No age is inferred from wearable data; stored under-18 restrictions remain. |
| Sex | Optional cycle advice and profile | Optional, deferred | Saved explicit value remains editable; no automatic inference. |
| Height | Profile and permitted coach/profile edit | Optional, deferred | Not required by daily prescription or setup gate; remains under optional details. |
| Weight / reviewed imported weight | Session nutrition and hydration guidance, profile | Optional, deferred; absent weight makes relevant quantities unavailable | Imported weight requires explicit choice. Saved manual value is preserved. |
| LTHR / max HR / FTP / run and swim pace references | Saved-reference display, anchor evidence and sport-specific canonical targets | Optional, deferred; specific targets may remain unavailable | Saved anchors are displayed; only missing known values are asked. No age-based threshold or PB-derived threshold is invented. |
| PB/test label, result, units, optional actual date | Reviewed manual result history and profile | Optional, collapsed | Retains prior manual PBs; a race result is not a threshold or consent. |
| Recent tolerated weekly minutes / observation date | Planning starting-load bound and freshness gate | Required for personalized plan | Imported recorded volume supports review; never replaces explicit tolerated capacity automatically. Unknown/overlapping history is disclosed. |
| Recent interruption | Setup and starter restrictions | Required for individualized planning | Saved answer reused; return after interruption remains reviewed. |
| Current restrictions | Setup, starter restrictions and current safety checks | Required for individualized planning | Wearables cannot answer pain or illness. Existing positive restrictions survive missing answers/reset. |
| Qualified review circumstance | Automated-pilot exclusion/review | Required for individualized planning | Unknown remains unresolved; no medical clearance is inferred. |
| Available weekdays | Cycle scheduling | Required for individualized planning | Saved availability reused; distinct from a rest-day preference. |
| Rest-day preference | Existing cycle scheduling choices | Optional preference | Does not override symptoms, actual work or day-level holds. No extra intensity is created. |
| Maximum daily minutes | Day budget, double-day and effective-prescription checks | Required for individualized planning | Saved bounded limit reused; daily available minutes are asked separately. |
| Equipment and venue | Setup eligibility and coach/planning context | Required for individualized planning | Explicit "none" is meaningful; device ownership is not required. |
| Actual sprint event | Track-specific planning gate | Required only for track sprint | No distance is inferred from generic labels. |
| Structured target metric/sport/value/unit/context/date; baseline-only opt-in | Existing target validation and plan-review gate | Optional advanced details | Goals remain aspirations; target-driven progression is not enabled. |
| Double-day weekday(s), purpose, start times and four confirmations | Existing double-day eligibility and session review | Optional advanced details | Moves existing work; no additional weekly capacity. A second day retains the professional restriction. |
| Coach preference | Stored setup preference / coach review context | Optional advanced detail | Does not assign a coach or grant data access. |
| Race name/distance/date/location | Saved race/event, cycle timing and event-day protection | Optional collapsed details | Saved ID is updated rather than duplicated; unchanged races are untouched. |
| Travel dates/timezone/time cap/equipment/schedule notes | Travel context validator and review | Optional separate section | No automatic timezone or historical workout rewrite. Zero time remains explicit. |
| Sleep quality, soreness, energy, motivation, stress | `resolveCheckinSafety`, existing `adaptSession` | Full-review questions; nullable during eligible scoped short review | Device sleep duration/score cannot answer these scales. Same-day explicit saved answers hydrate. |
| Illness, new pain, urgent symptoms; pain location/movement impact | Shared current-safety gate | Explicit current answers required when reviewing exercise | Imports cannot answer them. Positive symptoms dominate missing data and scoped review. |
| Available minutes remaining today | Safety input, actual-work/daily-budget allocation | Required for full or scoped review | Zero differs from blank. Scoped review explicitly confirms displayed remaining plan time. |
| Mood | Existing adaptation and shadow input | Optional full-review field | Saved explicit answer retained; no imported mood inference. |
| Menstrual flag / optional cycle day | Stored context, shadow/cycle advice | Optional | Does not itself authorize exercise or replace safety review. |
| Previous session felt easier/normal/harder | Existing adaptation mismatch adjustment | Optional | Does not substitute for per-session actual outcome/RPE. |
| Morning weight, RHR, HRV, sleep hours | Existing metric context, permitted same-source comparisons and stored reports | Optional | Fresh quality/provenance-allowed observations answer numeric questions; corrections are explicit. RMSSD and SDNN stay separate. |
| Previous activity actual duration, outcome, effort | Shared revision-aware feedback writer and execution-feedback service | Only missing outcome/effort/duration needs entry | Known imported actual duration is displayed; planned duration is never substituted. |
| Optional actual distance/load/reps and fueling | Shared actual-details writer | Optional | Omission preserves stored values; hourly fueling uses positive actual duration only. |
| Optional focus/cognitive check | Existing preparation/check-in context | Optional | Does not override current safety or prove recovery. |

## Draft defect and correction

The actual check-in page previously called `load()` after device sync/import and unconditionally overlaid saved answers on unsaved edits. This could change newly entered symptoms back to the old saved denial and replace explicit zero minutes with an old time budget. It also lost interrupted drafts on reload.

The form now keeps edited fields when refreshing evidence and stores unfinished entries in this tab, scoped to athlete, local day and the exact saved answer snapshot. Changed server answers or another day/athlete cannot inherit a stored draft. Hydration permits only editable scalar fields; it does not copy review metadata or imported metrics into manual answers. Imported SDNN never prefills an RMSSD correction. Successful submission clears submitted draft edits; edits made while a request is pending remain unsaved. Confirmed sign-out clears check-in drafts alongside onboarding drafts. Storage failure leaves saved data readable and tells the athlete the draft cannot be retained.

`checkin-lifecycle.test.ts` runs actual component handlers with synthetic storage/fetch: symptom=true, time=0 and a deliberately cleared scale survive successful sync, failed sync and reload; a second athlete does not receive the draft; the exact first athlete's answers are submitted; reload shows stored values. `onboarding-lifecycle.test.ts` already covers interrupted setup, saved profile, failed/queued import review, draft-preserving refresh, race idempotency and minimal completion to Today; the additional threshold test verifies progressive entry and restored advanced drafts.

An independent review caught a first-response race: an older tab draft could overwrite a newer live edit made while the initial GET was pending. The corrected hydration applies server values, then matching stored-draft fields, then the newest live edited fields. A deferred-GET actual-handler regression confirms symptom=true and time=0 win over the older draft while untouched draft energy still resumes. The focused draft/handler rerun passed 5/5.

## Verification and limits

The combined recovery/canonical, draft, onboarding, short-review and reset source/handler run passed 107/107. An additional actual provenance-hold persistence regression passed in the 7/7 check-in metric/route suite. `node node_modules/typescript/bin/tsc --noEmit --incremental false` passed before the final scoped-presentation addition; the parent release report records the final shared-source check, build and deployment status.

Source tests use injected local state only. No provider calls, real athlete writes, account grants, plan replacement, migration or deployment were performed by this task. Live owner diagnosis and serving-deployment evidence belong in the parent release report. Real mobile Safari/Android, full HTTP/Postgres flow, provider consent/import and external receipts require their separate acceptance lanes. Existing saved zero-minute adaptations are deliberately not rewritten; the owner must review any actual plan changes through the normal preview/approval workflow.
