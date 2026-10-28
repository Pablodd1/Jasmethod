# Athlete entry and starting-week review

## Capabilities preserved

JMM already reads the authenticated profile, source-labelled imported observations,
performed activity, check-in, events, and applied tests for its local training
review. Imported-volume review retains dates, possible duplicates and missing
days rather than calling them rest. Full cycles already schedule comfortable
sport-specific observations when verified anchors are missing. Maximal testing
is not required, and legacy automatic test-battery scheduling stays disabled.
Chat and the existing preview/confirm/save cycle workflow remain available.

## Measurement entry audit

| Surface | Athlete entry | Stored/API value |
| --- | --- | --- |
| Profile/onboarding and coach profile editor | Existing min:sec pace, athlete weight/height units | Existing canonical metric fields |
| Baseline tests in Profile, coach athlete editor and Labs | Finish time as minutes or m:ss/h:mm:ss; CSS as min:sec per 100 m or 100 yd; W and bpm unchanged | Seconds for finish time, seconds/100 m for CSS, W/bpm |
| HYROX | Running min:sec/km or mile; actual split and Roxzone clocks | Seconds/km and split seconds |
| Timed workout editor | Clocks for step durations and pace; km/h or mph for speed; W and bpm unchanged | Seconds, seconds/km, m/s, W and bpm |
| Pool/strength/HYROX structure authoring | Clocks for timed steps, rests and planning estimates; metres, lengths, repetitions and selected load units retained | Existing canonical structure; estimates remain estimates |
| Race scenario references and targets | Clock pace and selected distance units; km/h or mph for wind and speed-cap inputs | Existing scenario model SI inputs |
| Goal progress reports | Clock pace entry, W, km/h or mph; old manual report corrections convert displayed units explicitly | Existing immutable source reports and comparison units |

Invalid clock drafts cannot silently save the previously valid canonical value.
Unit/language redisplay does not round or overwrite an untouched source value.
Shared tests cover clocks, decimal minutes, invalid seconds, and metric/imperial
pace, CSS and speed conversions. Raw seconds remain appropriate for internal
models, machine-readable exports, timers and technical metadata. HRV milliseconds
remain milliseconds; they are a different measurement, not a training pace.

## Why a reported athlete could not generate a cycle

Read-only production investigation found an existing restriction-review flag and
a stale reported training baseline, with no active plan. It was not an FTP
requirement. The coach review panel previously listed missing fields but omitted
the separate review reasons; it now shows both. No production athlete record,
restriction, language, baseline or plan was changed during this investigation.
This document intentionally contains no athlete identifiers or health values.

## Starting path with incomplete information

Training and the private coach's plan workspace share an explicit starting-week
preview and confirmation. A seven-day draft offers up to three optional familiar
observations, at most 20 minutes each and 60 minutes for the week, bounded further
by saved time limits. These are product starting suggestions, not inferred
capacity, confirmed availability or a progression prescription. The athlete
reviews the dated schedule before saving. Unknown eligibility, known restrictions,
an interruption requiring review, explicit zero availability or restricted origin
produce review tasks with zero exercise instead. A birth year alone does not
establish that an eighteenth birthday has occurred.

Every positive observation uses the existing starter-session admission rules and
remains unapproved and on hold until the current daily safety/time check. The
starting week does not write FTP, VO2 max, threshold pace, tolerated-volume
baselines or a completed-test result. Record actual effort, minutes and recovery
within the existing workflow, review permitted imports, then choose the next
cycle. No missed dose is made up. Existing activity/event dates are protected.

An active plan cannot be overwritten by this shortcut. An expired starting week
can be explicitly renewed without progression; renewal archives only that expired
starting plan and preserves actual history. Normal personalized replacement still
uses the existing full review. Unknown, restricted, and Garmin-relay origins keep
their existing restrictions; no external AI, Telegram or provider fallback was
added. Credentials and integration permissions are unchanged.

## Verification and limitations

The new starting endpoint is athlete-owned, checks origin/content type/body size,
validates explicit confirmation, hashes current preview evidence, rechecks it in a
serializable transaction, rejects active-plan replacement, and replays duplicate
confirmations without duplicate plans. It uses existing tables; no migration.

`scripts/jmm-athlete-entry-browser.cjs` requires the exact disposable loopback
PostgreSQL database and CI egress guard. It checks authentication, cross-athlete
denial, CSRF and malformed bodies, preview without writes, stale/duplicate saves,
active-plan protection, expired-week renewal/history preservation, restrictions,
stale baseline preservation and restricted-origin canary leakage. English/Spanish
390px journeys submit and reload real plans, record actual benchmark clocks and
CSS units, reject invalid clock drafts, and verify HYROX request units. Reports
and step screenshots are uploaded in `jmm-launch-acceptance`.

These checks do not establish suitability to exercise, Garmin compliance, device
delivery, complete imported history, or the accuracy of race predictions. A
restriction requiring review must be resolved appropriately; neither an available
draft nor a successful save clears it. Browser checks use synthetic accounts;
live production checks remain read-only.
