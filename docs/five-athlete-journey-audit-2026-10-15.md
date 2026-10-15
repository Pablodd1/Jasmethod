# JMM five athlete workflow audit

15 October 2026. Five specialist agents tested synthetic new athletes against the application and a disposable PostgreSQL database. The reviewed baseline was main `e1f6803`, including the morning-reminder and saved-training visibility changes. Fixes in this branch require review and deployment before they affect the live app.

The audit found real faults beyond the existing green test suite: retired starter suggestions blocked replacement training, triathlon templates lost purposeful sessions, future workouts accepted premature completion, and invalid race/calendar input produced server errors. These faults were reproduced, repaired at their shared boundaries, and retested. HYROX still has an unresolved training-authoring gap; the application is not fully ready for every requested sport and delivery promise.

## Assignments and final journey results

| Agent as athlete | Saved workflow exercised | Final API and database scenarios |
| --- | --- | --- |
| Triathlon | New signup, optional setup, repeated Garmin TCX import, manual profile, four benchmark reports, Olympic event, eight-week preview and confirmation, brick/strength retention, Wednesday pair, current workout and actuals, second-session recheck, calendar, three-leg race scenario | 13 of 13 passed |
| Swimming | New signup, no-device starter, reviewed profile, dated CSS, 1500 m event, eight-week cycle, daily check-in, explicitly authored pool workout, decoded FIT, completion and history protection | 9 of 9 passed |
| Cycling | New signup, starter, TCX deduplication, reported versus applied FTP, dated HR test, race and venue, eight-week cycle, daily readiness, decoded FIT, actual results, calendar and explicit bike scenario | 14 of 14 passed |
| HYROX | New signup, no-device profile, running test and station history, event, eight-week cycle, daily run and results, manual station structure, 16-segment split calculation, connector limitations | 7 of 8 passed; generated station prescription remains a gap |
| Running | New beginner signup, optional day zero, dated 5K, 5K/10K events, eight-week cycle and rest, daily check-in, focus preparation, actual results, conversation/referrals/profile confirmation, future-result rejection, auth and tenant isolation | 15 of 15 passed |

Total: **58 passed and one unresolved requested capability across 59 scenarios**. These are named acceptance scenarios, not 59 independent scientific validations or complete browser journeys. The scripts call the real authenticated HTTP routes and inspect saved records; file-format checks decode actual generated files. Browser inspection is additional and narrower. Repairs were sent back to the responsible agents for replays; the cycling agent also independently reviewed the shared changes and found an additional distance-only evidence case, which was repaired.

## Confirmed faults and repairs

| Priority | Trigger and former behavior | Repair and verification |
| --- | --- | --- |
| P1 | Skip devices, receive a starter, complete setup, confirm a cycle, then submit a clear check-in. The unperformed starter became `planned:false` and was treated as unknown performed activity. Replacement training became rest and FIT returned 409. | Shared retired-suggestion predicate excludes only named superseded records with no recorded execution or measurements. Check-in recent feedback, same-day budget and canonical activity checks use it. Completed, unknown, zero-duration, distance-only and measured records remain evidence. Swimming and cycling journeys now resolve usable training. |
| P1 | Tomorrow's blocked workout accepted completion through the completion API and shared plan writer. | Shared workout writer rejects future execution reports with 409 using the athlete's local date, before writes/audits. Future planning edits and current/past reports remain possible. Running replay checks both routes and unchanged actual fields. |
| P1 | A planned record containing only distance, maximum heart rate, normalized power or pre/post weight could pass the history guard and have its prescription overwritten. | Complete the shared history predicate, including explicit zero, and reuse it for sport-structure edits. Regression checks reject ordinary and protected edits before any write/audit. |
| P2 | Triathlon generator appended bricks and strength after seven ordinary bouts; modulo day assignment and first-per-slot deduplication discarded them. | Replace an existing duplicate easy bout with an existing purposeful session where coverage, availability, time and hard-day constraints allow. No invented extra weekly minutes or automatic stacking. Triathlon preview retains swim, bike, run, brick and strength across the tested cycle. |
| P2 | Discretionary rest ordering always removed an otherwise eligible preferred Wednesday pair in the tested start-day arrangement. | Eligible agreed pair weekdays get preference over an arbitrary rest tie-break. Required recovery, time limits, unavailable days, race/test/taper exclusions and a fresh check-in for the second session remain. |
| P2 | Race creation accepted negative goal/result durations and priority zero; malformed dates produced Prisma/server errors. | Creation reuses the manual edit validator. Invalid JSON, scalars, dates, numeric ranges and ownership/provenance injection are rejected before creation. Internal errors are generic. The authenticated owner is server-bound. |
| P2 | Malformed calendar dates produced 500, rather than a useful validation error. | Validate JSON, scalar fields, calendar dates and local start/end times; return 400 for user errors and a generic 500 for internal errors. Preserve the athlete's local day. |
| P2 | A known single-sport swimmer saw missing cycling FTP/running pace questions. | Filter missing anchor questions by the selected/saved sport. Already saved values stay acknowledged, and optional skip remains. Unknown goals retain the broader optional choices; moving sport choice earlier remains a UX improvement. |
| P2 | HYROX page opened with an assumed 75-minute Men Open scenario. Split inputs looked like usable future coaching data although they were temporary. | Require an explicit target, division and Open/Pro selection before either request path. Explain in English/Spanish that split comparisons are temporary and not saved for future coaching. Do not infer race division from profile sex. |
| P3 | Today showed two separate no-device connection banners. | Retain one actionable device/manual-data banner. |
| P2 | Unavailable connector cards promised generic file support or Oura data arriving through WHOOP, and exposed configuration names to athletes. | English/Spanish guidance now distinguishes available manual files from automatic sync. WHOOP is not presented as an Oura bridge; server configuration names stay out of athlete cards. |

The second-pass review protected explicit `distanceKm: 0` as well as positive distance. A partially reported or uncertain activity must not disappear just because its former plan was replaced. No historical workout was deleted to fix readiness.

## What worked in the tested flows

- Signup created real local accounts and sessions. No payment or device was required for the tested day-zero path. Completing full cycle context remained distinct from skipping optional onboarding.
- Manual profile values remained distinct from dated, explicitly applied benchmark reports. The cycling fixture's typed FTP did not by itself establish current benchmark evidence; applying its dated 235 W test did.
- Cycle previews were read-only, confirmation persisted the reviewed cycle, and stale confirmations/edits were rejected. Tested weekly and daily budgets were respected. The triathlete's second workout required the first result and a fresh check-in.
- Reimporting the same TCX did not create a second copy. The cycling fixture retained one 45-minute ride at 165 W. This does not establish deduplication for every pair of different providers.
- Planned duration and actual results stayed separate. The cyclist's 43 actual minutes and RPE 4 did not replace its planned 37 minutes.
- Generated bike FIT steps decoded and matched the saved structure. The manually authored swim FIT decoded a 700 m workout in a 25 m pool. Downloading a file does not establish compatibility or receipt on a particular watch.
- Race scenarios accepted explicit assumptions and saved scenario arithmetic without presenting a validated personalized forecast or confidence interval. The numerical personalized forecast gate remained disabled.
- J Koach basic educational questions, configured owner referrals and reviewed profile changes passed the running journey. This is not a test of an external personalized LLM, fine-tuning or unrestricted conversational plan generation.
- Unauthorized requests returned 401. Another synthetic athlete could not read a selected private session or private conversation. Selected revision guards, completed history and the tested owner boundaries held.

## Remaining work and acceptance gates

### HYROX purposeful workouts

The requested station-prescription scenario remains a failure: generated HYROX rows do not contain an explicit run/station structure with usable sets, repetitions, individual loads and recovery. A detailed equipment/history note does not automatically become a validated prescription. The manually reviewed JSON structure path works, but it is not friendly enough for the intended daily athlete workflow.

Next implementation: provide a coach/athlete form for familiar station exercises, practiced loads, distance/repetitions, rests and scaling; preserve unknown loads as unknown. Bind a reviewed protocol to the cycle goal and current readiness, with exercise substitutions and explicit progression criteria. The same canonical structure must drive Today, focus, graphics, results and supported exports. Do not assign race loads from a running test or mark this audit green by inventing capacity.

Acceptance: an athlete can review a complete station session without editing JSON; actual run/station results persist with owner, date, units and revision; a coach's change is visible on every surface; illness/pain, insufficient history and unavailable equipment cannot silently produce a maximal session.

### Durable HYROX split history

The split planner compares 8 runs and 8 stations, but its entered actuals are component state and disappear on leaving/reloading. They are not available to later coaching. The new disclosure fixes the misleading expectation; it does not implement persistence.

Next implementation: save explicitly confirmed actual splits to an athlete-owned race/workout result with division, units, source, missing segments and transition treatment. Support review/correction without silently generating a new plan. Test reload, cross-user denial, stale updates and actual-versus-estimated labels.

### Swimming authoring

Pool lengths, units, strokes and independent rest can be represented and exported after explicit authoring. Generated swim cycles still use generic timed sessions rather than constructing this pool structure. A simple pool-length/stroke/rest editor and suitable reviewed templates are needed. Dated benchmark records already accept an optional method/reason; promote applicable pool, stroke and test conditions into structured metadata that coaching can check. Heart-rate benchmark reports likewise need a sport context and clearer applied-source presentation. Unsupported send-off or workout structures must keep an honest export block.

### Provider and scheduled delivery acceptance

The mock environment deliberately disables real provider credentials, automated publishing and external messages. It tests available options and refusal behavior; it does not certify production configuration or provider approval.

| Connection or surface | What this audit establishes | Remaining real acceptance |
| --- | --- | --- |
| Garmin/Intervals | File import and supported bike FIT semantics; connector/publishing gates remain explicit | Athlete OAuth/refresh, Intervals-Garmin permissions, publication receipts, actual Garmin Connect/watch display and completed activity returning to JMM |
| Strava | Import/source distinctions and no unsupported structured-workout publishing claim | Real token/refresh/webhook behavior and permitted production data use |
| WHOOP/Oura | Connector options do not claim structured workout delivery | Actual authorization return, refresh, late/missing recovery observations and per-athlete freshness |
| COROS/Apple Watch | Unavailable/native/file capabilities remain labelled | Approved direct/native paths, compatible device execution and inbound completion |
| Telegram/email | Paused/disabled/consent states are visible and do not report false receipt | Production transport/webhook configuration, recipient verification, opt-in, chosen local time, accepted message/file receipts and absence of duplicates |
| Calendar | Active cycle/ICS and owner-scoped event behavior | Real Google Calendar OAuth, creation/update/retraction receipts, calendar refresh behavior and rest-day representation |

A named 5 a.m. delivery claim needs a real scheduled receipt with the athlete's timezone and quiet hours. A successful cron HTTP response is insufficient. New source data can arrive after the scheduled time; missing sleep/HRV is not an observation of poor recovery.

### Race forecasts, timers and human effectiveness

Personalized numerical forecasts remain gated. Sport-specific historical error evaluation, documented course/weather assumptions, benchmark provenance and release criteria are needed before enabling them. A manually specified scenario is not a validated forecast.

Focus preparation was exercised through the API. Persistent elapsed time, background phone behavior, sound/vibration, offline reload and a real watch following the workout need device/browser acceptance. No synthetic result proves an intervention improves human performance or that a fuel/supplement recommendation is suitable for an individual.

## Evidence and reproduction

The five scripts are `scripts/jmm-athlete-qa-{triathlon,swimming,cycling,hyrox,running}.ts`, with the restricted helper `scripts/jmm-athlete-qa-support.ts`. They require the same isolated database used by existing acceptance tests: loopback PostgreSQL on port 55432, database `jmm_launch_integration_test`, app on port 3220, and the `scripts/jmm-test-egress-guard.cjs` preload. Never run them against a deployed or athlete database. The helper intentionally keeps named synthetic accounts for the CTO's browser follow-up; the disposable database can be stopped afterward. The committed swimmer fixture uses plausible synthetic 400 m / 200 m times of 400 / 196 seconds for its unchanged 102 sec/100 m CSS arithmetic; original snapshots used 415 / 211. Neither is human efficacy evidence.

Each script writes a sport report under ignored `.local/athlete-qa/`. Detailed snapshots, original failures and decoded FIT evidence remain there. Files named `*-private.json` contain local test credentials and must never be committed, uploaded or attached to a public report. Importantly, the HYROX script intentionally exits unsuccessfully for the unresolved generated-station requirement; this result must remain visible.

The local public/authentication smoke passed 17 checks against the built server. The final local unit/provider suite passed 1,389 tests. TypeScript and the production build passed. In the built app, the CTO signed into the latest synthetic swimmer through the login UI, saw its saved cycle and explicit pool workout, and followed the connection link. The page had one device banner and one J Metrics panel; repeated metrics seen during development did not reproduce in the clean build. At a 390 × 844 viewport, the connection page had no document horizontal overflow and showed the mobile navigation. HYROX's target and division stayed unselected, with calculation disabled until chosen. This is a targeted browser check, not five complete click-through journeys. Exact-head CI results accompany the PR. The test guard blocked external attempts by build tooling/font retrieval; public font assets required a separate sanitized build. Runtime athlete/provider traffic remained loopback-only.

## CTO release decision

Review and deploy the shared fault repairs after their build/CI checks. Continue a supervised pilot for the tested manual-data and reviewed-cycle workflows. Keep HYROX station generation, automatic end-to-end watch delivery, scheduled receipt promises and calibrated numerical race forecasts outside a fully verified launch claim until their acceptance gates above pass. The outstanding work has concrete owners and test criteria; it must not be hidden by the successful scenario count.
