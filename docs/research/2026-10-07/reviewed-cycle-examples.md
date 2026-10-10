# JMM 12-week review examples and baselines

Version: 2026-10-10-review-only-v1. Rebuilt from src/lib/reviewed-cycle-samples.ts with node --import tsx scripts/render-reviewed-cycle-samples.ts.

Engineering and evidence-scope review only. These are synthetic educational drafts, not real athlete data, qualified coaching approvals, trial-validated doses or automatically selectable plans. Every number, sequence, priority rule and review window here is a JMM coaching heuristic. Use the [existing evidence dossier](training-evidence.md) and [expert-education adjudication](huberman-galpin-evidence.md) for source limitations.

## How to review or adapt

- Confirm sport-specific history, current symptoms/restrictions, equipment, safe setting, available time and prior tolerance. These samples assume established adults; they are not novice, injury-return or clearance protocols.
- Compare each week to actual tolerated training; the stated ceiling is an assumed synthetic limit, not a target to fill. Stop or reduce for poor recovery, pain, unsafe conditions or lost technique. Do not add missed work later.
- Review at the start and around weeks 4, 8 and 12. Later weeks remain conditional. The 28-day cadence is a product heuristic; observations do not renew the separate 90-day anchor-validity policy.
- Each session below links to editable work/rest endpoints. Recompute all totals after edits. Exact timed totals include warm-up, all work, listed rest and cool-down. Distance sessions have exact distance plus explicit recovery time; their elapsed duration is unknown. Budget minutes are scheduling allowances only.
- The event in week 11 replaces its date; its duration and result are unknown and excluded from training budgets. Week 12 deliberately prescribes no post-event workouts pending actual recovery review. A rest/review slot is not a claim that no activity occurred.
- Close A/B/C events need an explicit choice: reduce conservatively, revise priorities or seek individual coaching. Lower priority does not imply lower physiological cost. The review pack shows one event to keep the example readable; runtime event regression tests cover multiple events.
- General strength is partial supporting scope. Boxing and standalone Olympic lifting remain excluded. The Olympic goal below means Olympic-distance triathlon.

## Sprint triathlon

Goal: sprint. Scope: supported_goal_example. Assumed recently tolerated ceiling: 300 min/week. Start: 2026-10-12.

Synthetic A event: 2026-12-27. Event readiness, duration and recovery are not established by this horizon.

The triathlon variants provide a foundation/maintenance illustration with combined swim–bike–run load. Longer-course variants require separate endurance, open-water, equipment and fueling review; these example durations do not establish full-distance race readiness.

### Baseline examples

- run, synthetic observation 2026-10-05: Recent familiar 5 km performance, consistent course; optional non-maximal alternative records minutes/effort only. Values: distanceMeters=5000; elapsedSeconds=1500; conditions=Synthetic flat-course example. 5:00/km is observed performance pace, not measured threshold. Do not silently write performance pace to a threshold field. Any explicitly chosen derived threshold estimate must retain its method and uncertainty; an aspirational goal never becomes an anchor.
- bike, synthetic observation 2026-10-05: Previously completed, reviewed FTP protocol with calibrated meter. Values: reportedFtpWatts=220; protocol=20-minute-derived FTP, method explicitly recorded. 220 W is a synthetic FTP field estimate; CP needs its own test and field. No universal CP = FTP + 16 W conversion.
- swim, synthetic observation 2026-10-05: Reviewed same-stroke 200/400 m pool tests; not automatically scheduled. Values: t400Seconds=480; t200Seconds=220; cssSecondsPer100m=130; poolLengthMeters=25; stroke=freestyle. (480−220)/2 = 130 s/100 m, a CSS field estimate with measurement error. It is not directly measured LT2 or proof of open-water safety.
- strength, synthetic observation 2026-10-05: Qualified review of familiar movements, comfortable loads and repetitions in reserve. Values: movement=goblet squat; loadKg=12; repetitions=6; reportedRepsInReserve=3. Synthetic technique example, not a 1RM estimate or automatic starting load. General strength is only partially supported; Olympic lifting remains outside scope.

### Full 12-week horizon

| Week / starting | Purpose | Sessions (allowance or exact time as noted in library) | Budget total, excluding event | Rest/review slots |
|---|---|---|---|---|
| 1 / 2026-10-12 | Baseline observation and familiarization; review required | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Thu [S03](#s03) strength 20 min; Fri [S04](#s04) run 25 min; Sat [S05](#s05) brick 53 min | 183 min | Sun |
| 2 / 2026-10-19 | Repeatable foundation | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S08](#s08) run 35 min; Sat [S09](#s09) brick 68 min | 234 min | Sun |
| 3 / 2026-10-26 | Controlled practice | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S08](#s08) run 35 min; Sat [S09](#s09) brick 68 min | 234 min | Sun |
| 4 / 2026-11-02 | Recovery and baseline review; review required | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Thu [S03](#s03) strength 20 min; Fri [S10](#s10) run 25 min; Sat [S05](#s05) brick 53 min | 183 min | Sun |
| 5 / 2026-11-09 | Event-relevant practice | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S11](#s11) run 40 min; Sat [S09](#s09) brick 68 min | 239 min | Sun |
| 6 / 2026-11-16 | Consolidate repeatability | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S11](#s11) run 40 min; Sat [S09](#s09) brick 68 min | 239 min | Sun |
| 7 / 2026-11-23 | Practice within tolerated load | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S11](#s11) run 40 min; Sat [S09](#s09) brick 68 min | 239 min | Sun |
| 8 / 2026-11-30 | Recovery and baseline review; review required | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Thu [S03](#s03) strength 20 min; Fri [S10](#s10) run 25 min; Sat [S05](#s05) brick 53 min | 183 min | Sun |
| 9 / 2026-12-07 | Event-specific integration | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S11](#s11) run 40 min; Sat [S09](#s09) brick 68 min | 239 min | Sun |
| 10 / 2026-12-14 | Reduced-load event preparation | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Thu [S03](#s03) strength 20 min; Fri [S10](#s10) run 25 min; Sat [S05](#s05) brick 53 min | 183 min | Sun |
| 11 / 2026-12-21 | Event week; review actual response | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Fri [S10](#s10) run 25 min; Sat [S05](#s05) brick 53 min; Sun event 2026-12-27; duration unknown | 163 min | Thu |
| 12 / 2026-12-28 | Post-event recovery and review; no assumed return; review required | No workouts prescribed pending actual recovery review | 0 min | Mon, Tue, Wed, Thu, Fri, Sat, Sun |

## Olympic-distance triathlon

Goal: olympic. Scope: supported_goal_example. Assumed recently tolerated ceiling: 360 min/week. Start: 2026-10-12.

Synthetic A event: 2026-12-27. Event readiness, duration and recovery are not established by this horizon.

The triathlon variants provide a foundation/maintenance illustration with combined swim–bike–run load. Longer-course variants require separate endurance, open-water, equipment and fueling review; these example durations do not establish full-distance race readiness.

### Baseline examples

- run, synthetic observation 2026-10-05: Recent familiar 5 km performance, consistent course; optional non-maximal alternative records minutes/effort only. Values: distanceMeters=5000; elapsedSeconds=1500; conditions=Synthetic flat-course example. 5:00/km is observed performance pace, not measured threshold. Do not silently write performance pace to a threshold field. Any explicitly chosen derived threshold estimate must retain its method and uncertainty; an aspirational goal never becomes an anchor.
- bike, synthetic observation 2026-10-05: Previously completed, reviewed FTP protocol with calibrated meter. Values: reportedFtpWatts=220; protocol=20-minute-derived FTP, method explicitly recorded. 220 W is a synthetic FTP field estimate; CP needs its own test and field. No universal CP = FTP + 16 W conversion.
- swim, synthetic observation 2026-10-05: Reviewed same-stroke 200/400 m pool tests; not automatically scheduled. Values: t400Seconds=480; t200Seconds=220; cssSecondsPer100m=130; poolLengthMeters=25; stroke=freestyle. (480−220)/2 = 130 s/100 m, a CSS field estimate with measurement error. It is not directly measured LT2 or proof of open-water safety.
- strength, synthetic observation 2026-10-05: Qualified review of familiar movements, comfortable loads and repetitions in reserve. Values: movement=goblet squat; loadKg=12; repetitions=6; reportedRepsInReserve=3. Synthetic technique example, not a 1RM estimate or automatic starting load. General strength is only partially supported; Olympic lifting remains outside scope.

### Full 12-week horizon

| Week / starting | Purpose | Sessions (allowance or exact time as noted in library) | Budget total, excluding event | Rest/review slots |
|---|---|---|---|---|
| 1 / 2026-10-12 | Baseline observation and familiarization; review required | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Thu [S03](#s03) strength 20 min; Fri [S04](#s04) run 25 min; Sat [S05](#s05) brick 53 min | 183 min | Sun |
| 2 / 2026-10-19 | Repeatable foundation | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S08](#s08) run 35 min; Sat [S12](#s12) brick 83 min | 249 min | Sun |
| 3 / 2026-10-26 | Controlled practice | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S08](#s08) run 35 min; Sat [S12](#s12) brick 83 min | 249 min | Sun |
| 4 / 2026-11-02 | Recovery and baseline review; review required | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Thu [S03](#s03) strength 20 min; Fri [S10](#s10) run 25 min; Sat [S05](#s05) brick 53 min | 183 min | Sun |
| 5 / 2026-11-09 | Event-relevant practice | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S11](#s11) run 40 min; Sat [S12](#s12) brick 83 min | 254 min | Sun |
| 6 / 2026-11-16 | Consolidate repeatability | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S11](#s11) run 40 min; Sat [S12](#s12) brick 83 min | 254 min | Sun |
| 7 / 2026-11-23 | Practice within tolerated load | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S11](#s11) run 40 min; Sat [S12](#s12) brick 83 min | 254 min | Sun |
| 8 / 2026-11-30 | Recovery and baseline review; review required | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Thu [S03](#s03) strength 20 min; Fri [S10](#s10) run 25 min; Sat [S05](#s05) brick 53 min | 183 min | Sun |
| 9 / 2026-12-07 | Event-specific integration | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S11](#s11) run 40 min; Sat [S12](#s12) brick 83 min | 254 min | Sun |
| 10 / 2026-12-14 | Reduced-load event preparation | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Thu [S03](#s03) strength 20 min; Fri [S10](#s10) run 25 min; Sat [S05](#s05) brick 53 min | 183 min | Sun |
| 11 / 2026-12-21 | Event week; review actual response | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Fri [S10](#s10) run 25 min; Sat [S05](#s05) brick 53 min; Sun event 2026-12-27; duration unknown | 163 min | Thu |
| 12 / 2026-12-28 | Post-event recovery and review; no assumed return; review required | No workouts prescribed pending actual recovery review | 0 min | Mon, Tue, Wed, Thu, Fri, Sat, Sun |

## Half-distance triathlon

Goal: half. Scope: supported_goal_example. Assumed recently tolerated ceiling: 420 min/week. Start: 2026-10-12.

Synthetic A event: 2026-12-27. Event readiness, duration and recovery are not established by this horizon.

The triathlon variants provide a foundation/maintenance illustration with combined swim–bike–run load. Longer-course variants require separate endurance, open-water, equipment and fueling review; these example durations do not establish full-distance race readiness.

### Baseline examples

- run, synthetic observation 2026-10-05: Recent familiar 5 km performance, consistent course; optional non-maximal alternative records minutes/effort only. Values: distanceMeters=5000; elapsedSeconds=1500; conditions=Synthetic flat-course example. 5:00/km is observed performance pace, not measured threshold. Do not silently write performance pace to a threshold field. Any explicitly chosen derived threshold estimate must retain its method and uncertainty; an aspirational goal never becomes an anchor.
- bike, synthetic observation 2026-10-05: Previously completed, reviewed FTP protocol with calibrated meter. Values: reportedFtpWatts=220; protocol=20-minute-derived FTP, method explicitly recorded. 220 W is a synthetic FTP field estimate; CP needs its own test and field. No universal CP = FTP + 16 W conversion.
- swim, synthetic observation 2026-10-05: Reviewed same-stroke 200/400 m pool tests; not automatically scheduled. Values: t400Seconds=480; t200Seconds=220; cssSecondsPer100m=130; poolLengthMeters=25; stroke=freestyle. (480−220)/2 = 130 s/100 m, a CSS field estimate with measurement error. It is not directly measured LT2 or proof of open-water safety.
- strength, synthetic observation 2026-10-05: Qualified review of familiar movements, comfortable loads and repetitions in reserve. Values: movement=goblet squat; loadKg=12; repetitions=6; reportedRepsInReserve=3. Synthetic technique example, not a 1RM estimate or automatic starting load. General strength is only partially supported; Olympic lifting remains outside scope.

### Full 12-week horizon

| Week / starting | Purpose | Sessions (allowance or exact time as noted in library) | Budget total, excluding event | Rest/review slots |
|---|---|---|---|---|
| 1 / 2026-10-12 | Baseline observation and familiarization; review required | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Thu [S03](#s03) strength 20 min; Fri [S04](#s04) run 25 min; Sat [S05](#s05) brick 53 min | 183 min | Sun |
| 2 / 2026-10-19 | Repeatable foundation | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S08](#s08) run 35 min; Sat [S13](#s13) brick 98 min | 264 min | Sun |
| 3 / 2026-10-26 | Controlled practice | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S08](#s08) run 35 min; Sat [S13](#s13) brick 98 min | 264 min | Sun |
| 4 / 2026-11-02 | Recovery and baseline review; review required | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Thu [S03](#s03) strength 20 min; Fri [S10](#s10) run 25 min; Sat [S05](#s05) brick 53 min | 183 min | Sun |
| 5 / 2026-11-09 | Event-relevant practice | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S11](#s11) run 40 min; Sat [S13](#s13) brick 98 min | 269 min | Sun |
| 6 / 2026-11-16 | Consolidate repeatability | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S11](#s11) run 40 min; Sat [S13](#s13) brick 98 min | 269 min | Sun |
| 7 / 2026-11-23 | Practice within tolerated load | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S11](#s11) run 40 min; Sat [S13](#s13) brick 98 min | 269 min | Sun |
| 8 / 2026-11-30 | Recovery and baseline review; review required | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Thu [S03](#s03) strength 20 min; Fri [S10](#s10) run 25 min; Sat [S05](#s05) brick 53 min | 183 min | Sun |
| 9 / 2026-12-07 | Event-specific integration | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S11](#s11) run 40 min; Sat [S13](#s13) brick 98 min | 269 min | Sun |
| 10 / 2026-12-14 | Reduced-load event preparation | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Thu [S03](#s03) strength 20 min; Fri [S10](#s10) run 25 min; Sat [S05](#s05) brick 53 min | 183 min | Sun |
| 11 / 2026-12-21 | Event week; review actual response | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Fri [S10](#s10) run 25 min; Sat [S05](#s05) brick 53 min; Sun event 2026-12-27; duration unknown | 163 min | Thu |
| 12 / 2026-12-28 | Post-event recovery and review; no assumed return; review required | No workouts prescribed pending actual recovery review | 0 min | Mon, Tue, Wed, Thu, Fri, Sat, Sun |

## Full-distance triathlon

Goal: full. Scope: supported_goal_example. Assumed recently tolerated ceiling: 480 min/week. Start: 2026-10-12.

Synthetic A event: 2026-12-27. Event readiness, duration and recovery are not established by this horizon.

The triathlon variants provide a foundation/maintenance illustration with combined swim–bike–run load. Longer-course variants require separate endurance, open-water, equipment and fueling review; these example durations do not establish full-distance race readiness.

### Baseline examples

- run, synthetic observation 2026-10-05: Recent familiar 5 km performance, consistent course; optional non-maximal alternative records minutes/effort only. Values: distanceMeters=5000; elapsedSeconds=1500; conditions=Synthetic flat-course example. 5:00/km is observed performance pace, not measured threshold. Do not silently write performance pace to a threshold field. Any explicitly chosen derived threshold estimate must retain its method and uncertainty; an aspirational goal never becomes an anchor.
- bike, synthetic observation 2026-10-05: Previously completed, reviewed FTP protocol with calibrated meter. Values: reportedFtpWatts=220; protocol=20-minute-derived FTP, method explicitly recorded. 220 W is a synthetic FTP field estimate; CP needs its own test and field. No universal CP = FTP + 16 W conversion.
- swim, synthetic observation 2026-10-05: Reviewed same-stroke 200/400 m pool tests; not automatically scheduled. Values: t400Seconds=480; t200Seconds=220; cssSecondsPer100m=130; poolLengthMeters=25; stroke=freestyle. (480−220)/2 = 130 s/100 m, a CSS field estimate with measurement error. It is not directly measured LT2 or proof of open-water safety.
- strength, synthetic observation 2026-10-05: Qualified review of familiar movements, comfortable loads and repetitions in reserve. Values: movement=goblet squat; loadKg=12; repetitions=6; reportedRepsInReserve=3. Synthetic technique example, not a 1RM estimate or automatic starting load. General strength is only partially supported; Olympic lifting remains outside scope.

### Full 12-week horizon

| Week / starting | Purpose | Sessions (allowance or exact time as noted in library) | Budget total, excluding event | Rest/review slots |
|---|---|---|---|---|
| 1 / 2026-10-12 | Baseline observation and familiarization; review required | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Thu [S03](#s03) strength 20 min; Fri [S04](#s04) run 25 min; Sat [S05](#s05) brick 53 min | 183 min | Sun |
| 2 / 2026-10-19 | Repeatable foundation | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S08](#s08) run 35 min; Sat [S14](#s14) brick 113 min | 279 min | Sun |
| 3 / 2026-10-26 | Controlled practice | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S08](#s08) run 35 min; Sat [S14](#s14) brick 113 min | 279 min | Sun |
| 4 / 2026-11-02 | Recovery and baseline review; review required | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Thu [S03](#s03) strength 20 min; Fri [S10](#s10) run 25 min; Sat [S05](#s05) brick 53 min | 183 min | Sun |
| 5 / 2026-11-09 | Event-relevant practice | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S11](#s11) run 40 min; Sat [S14](#s14) brick 113 min | 284 min | Sun |
| 6 / 2026-11-16 | Consolidate repeatability | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S11](#s11) run 40 min; Sat [S14](#s14) brick 113 min | 284 min | Sun |
| 7 / 2026-11-23 | Practice within tolerated load | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S11](#s11) run 40 min; Sat [S14](#s14) brick 113 min | 284 min | Sun |
| 8 / 2026-11-30 | Recovery and baseline review; review required | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Thu [S03](#s03) strength 20 min; Fri [S10](#s10) run 25 min; Sat [S05](#s05) brick 53 min | 183 min | Sun |
| 9 / 2026-12-07 | Event-specific integration | Mon [S06](#s06) swim 40 min; Tue [S07](#s07) bike 31 min; Wed [S06](#s06) swim 40 min; Thu [S03](#s03) strength 20 min; Fri [S11](#s11) run 40 min; Sat [S14](#s14) brick 113 min | 284 min | Sun |
| 10 / 2026-12-14 | Reduced-load event preparation | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Thu [S03](#s03) strength 20 min; Fri [S10](#s10) run 25 min; Sat [S05](#s05) brick 53 min | 183 min | Sun |
| 11 / 2026-12-21 | Event week; review actual response | Mon [S01](#s01) swim 30 min; Tue [S02](#s02) bike 25 min; Wed [S01](#s01) swim 30 min; Fri [S10](#s10) run 25 min; Sat [S05](#s05) brick 53 min; Sun event 2026-12-27; duration unknown | 163 min | Thu |
| 12 / 2026-12-28 | Post-event recovery and review; no assumed return; review required | No workouts prescribed pending actual recovery review | 0 min | Mon, Tue, Wed, Thu, Fri, Sat, Sun |

## Distance running

Goal: run-only. Scope: supported_goal_example. Assumed recently tolerated ceiling: 240 min/week. Start: 2026-10-12.

Synthetic A event: 2026-12-27. Event readiness, duration and recovery are not established by this horizon.

### Baseline examples

- run, synthetic observation 2026-10-05: Recent familiar 5 km performance, consistent course; optional non-maximal alternative records minutes/effort only. Values: distanceMeters=5000; elapsedSeconds=1500; conditions=Synthetic flat-course example. 5:00/km is observed performance pace, not measured threshold. Do not silently write performance pace to a threshold field. Any explicitly chosen derived threshold estimate must retain its method and uncertainty; an aspirational goal never becomes an anchor.
- strength, synthetic observation 2026-10-05: Qualified review of familiar movements, comfortable loads and repetitions in reserve. Values: movement=goblet squat; loadKg=12; repetitions=6; reportedRepsInReserve=3. Synthetic technique example, not a 1RM estimate or automatic starting load. General strength is only partially supported; Olympic lifting remains outside scope.

### Full 12-week horizon

| Week / starting | Purpose | Sessions (allowance or exact time as noted in library) | Budget total, excluding event | Rest/review slots |
|---|---|---|---|---|
| 1 / 2026-10-12 | Baseline observation and familiarization; review required | Mon [S04](#s04) run 25 min; Wed [S04](#s04) run 25 min; Fri [S03](#s03) strength 20 min; Sat [S15](#s15) run 30 min | 100 min | Tue, Thu, Sun |
| 2 / 2026-10-19 | Repeatable foundation | Mon [S08](#s08) run 35 min; Wed [S16](#s16) run 31 min; Fri [S17](#s17) strength 26 min; Sat [S18](#s18) run 50 min | 142 min | Tue, Thu, Sun |
| 3 / 2026-10-26 | Controlled practice | Mon [S08](#s08) run 35 min; Wed [S16](#s16) run 31 min; Fri [S17](#s17) strength 26 min; Sat [S18](#s18) run 50 min | 142 min | Tue, Thu, Sun |
| 4 / 2026-11-02 | Recovery and baseline review; review required | Mon [S10](#s10) run 25 min; Wed [S04](#s04) run 25 min; Fri [S03](#s03) strength 20 min; Sat [S15](#s15) run 30 min | 100 min | Tue, Thu, Sun |
| 5 / 2026-11-09 | Event-relevant practice | Mon [S11](#s11) run 40 min; Wed [S16](#s16) run 31 min; Fri [S17](#s17) strength 26 min; Sat [S18](#s18) run 50 min | 147 min | Tue, Thu, Sun |
| 6 / 2026-11-16 | Consolidate repeatability | Mon [S11](#s11) run 40 min; Wed [S16](#s16) run 31 min; Fri [S17](#s17) strength 26 min; Sat [S18](#s18) run 50 min | 147 min | Tue, Thu, Sun |
| 7 / 2026-11-23 | Practice within tolerated load | Mon [S11](#s11) run 40 min; Wed [S16](#s16) run 31 min; Fri [S17](#s17) strength 26 min; Sat [S18](#s18) run 50 min | 147 min | Tue, Thu, Sun |
| 8 / 2026-11-30 | Recovery and baseline review; review required | Mon [S10](#s10) run 25 min; Wed [S04](#s04) run 25 min; Fri [S03](#s03) strength 20 min; Sat [S15](#s15) run 30 min | 100 min | Tue, Thu, Sun |
| 9 / 2026-12-07 | Event-specific integration | Mon [S11](#s11) run 40 min; Wed [S16](#s16) run 31 min; Fri [S17](#s17) strength 26 min; Sat [S18](#s18) run 50 min | 147 min | Tue, Thu, Sun |
| 10 / 2026-12-14 | Reduced-load event preparation | Mon [S10](#s10) run 25 min; Wed [S04](#s04) run 25 min; Fri [S03](#s03) strength 20 min; Sat [S15](#s15) run 30 min | 100 min | Tue, Thu, Sun |
| 11 / 2026-12-21 | Event week; review actual response | Mon [S10](#s10) run 25 min; Wed [S04](#s04) run 25 min; Fri [S03](#s03) strength 20 min; Sat [S15](#s15) run 30 min; Sun event 2026-12-27; duration unknown | 100 min | Tue, Thu |
| 12 / 2026-12-28 | Post-event recovery and review; no assumed return; review required | No workouts prescribed pending actual recovery review | 0 min | Mon, Tue, Wed, Thu, Fri, Sat, Sun |

## Track sprint: acceleration foundation

Goal: track-sprint. Scope: supported_goal_example. Assumed recently tolerated ceiling: 180 min/week. Start: 2026-10-12.

Synthetic A event: 2026-12-27. Event readiness, duration and recovery are not established by this horizon.

### Baseline examples

- run, synthetic observation 2026-10-05: Coach-observed acceleration on a consistent safe surface with consistent timing method. Values: distanceMeters=20; bestSeconds=3.6; timing=Synthetic electronic timing example. A 20 m acceleration result informs only comparable acceleration practice. It is not maximal flying speed, 100/400 m ability or an endurance threshold.
- strength, synthetic observation 2026-10-05: Qualified review of familiar movements, comfortable loads and repetitions in reserve. Values: movement=goblet squat; loadKg=12; repetitions=6; reportedRepsInReserve=3. Synthetic technique example, not a 1RM estimate or automatic starting load. General strength is only partially supported; Olympic lifting remains outside scope.

### Full 12-week horizon

| Week / starting | Purpose | Sessions (allowance or exact time as noted in library) | Budget total, excluding event | Rest/review slots |
|---|---|---|---|---|
| 1 / 2026-10-12 | Baseline observation and familiarization; review required | Mon [S19](#s19) run 25 min; Wed [S03](#s03) strength 20 min; Fri [S19](#s19) run 25 min | 70 min | Tue, Thu, Sat, Sun |
| 2 / 2026-10-19 | Repeatable foundation | Mon [S20](#s20) run 40 min; Wed [S17](#s17) strength 26 min; Fri [S19](#s19) run 25 min | 91 min | Tue, Thu, Sat, Sun |
| 3 / 2026-10-26 | Controlled practice | Mon [S20](#s20) run 40 min; Wed [S17](#s17) strength 26 min; Fri [S19](#s19) run 25 min | 91 min | Tue, Thu, Sat, Sun |
| 4 / 2026-11-02 | Recovery and baseline review; review required | Mon [S19](#s19) run 25 min; Wed [S03](#s03) strength 20 min; Fri [S19](#s19) run 25 min | 70 min | Tue, Thu, Sat, Sun |
| 5 / 2026-11-09 | Event-relevant practice | Mon [S20](#s20) run 40 min; Wed [S17](#s17) strength 26 min; Fri [S19](#s19) run 25 min | 91 min | Tue, Thu, Sat, Sun |
| 6 / 2026-11-16 | Consolidate repeatability | Mon [S20](#s20) run 40 min; Wed [S17](#s17) strength 26 min; Fri [S19](#s19) run 25 min | 91 min | Tue, Thu, Sat, Sun |
| 7 / 2026-11-23 | Practice within tolerated load | Mon [S20](#s20) run 40 min; Wed [S17](#s17) strength 26 min; Fri [S19](#s19) run 25 min | 91 min | Tue, Thu, Sat, Sun |
| 8 / 2026-11-30 | Recovery and baseline review; review required | Mon [S19](#s19) run 25 min; Wed [S03](#s03) strength 20 min; Fri [S19](#s19) run 25 min | 70 min | Tue, Thu, Sat, Sun |
| 9 / 2026-12-07 | Event-specific integration | Mon [S20](#s20) run 40 min; Wed [S17](#s17) strength 26 min; Fri [S19](#s19) run 25 min | 91 min | Tue, Thu, Sat, Sun |
| 10 / 2026-12-14 | Reduced-load event preparation | Mon [S19](#s19) run 25 min; Wed [S03](#s03) strength 20 min; Fri [S19](#s19) run 25 min | 70 min | Tue, Thu, Sat, Sun |
| 11 / 2026-12-21 | Event week; review actual response | Mon [S19](#s19) run 25 min; Wed [S03](#s03) strength 20 min; Fri [S19](#s19) run 25 min; Sun event 2026-12-27; duration unknown | 70 min | Tue, Thu, Sat |
| 12 / 2026-12-28 | Post-event recovery and review; no assumed return; review required | No workouts prescribed pending actual recovery review | 0 min | Mon, Tue, Wed, Thu, Fri, Sat, Sun |

## Cycling

Goal: cycle. Scope: supported_goal_example. Assumed recently tolerated ceiling: 300 min/week. Start: 2026-10-12.

Synthetic A event: 2026-12-27. Event readiness, duration and recovery are not established by this horizon.

### Baseline examples

- bike, synthetic observation 2026-10-05: Previously completed, reviewed FTP protocol with calibrated meter. Values: reportedFtpWatts=220; protocol=20-minute-derived FTP, method explicitly recorded. 220 W is a synthetic FTP field estimate; CP needs its own test and field. No universal CP = FTP + 16 W conversion.
- strength, synthetic observation 2026-10-05: Qualified review of familiar movements, comfortable loads and repetitions in reserve. Values: movement=goblet squat; loadKg=12; repetitions=6; reportedRepsInReserve=3. Synthetic technique example, not a 1RM estimate or automatic starting load. General strength is only partially supported; Olympic lifting remains outside scope.

### Full 12-week horizon

| Week / starting | Purpose | Sessions (allowance or exact time as noted in library) | Budget total, excluding event | Rest/review slots |
|---|---|---|---|---|
| 1 / 2026-10-12 | Baseline observation and familiarization; review required | Mon [S02](#s02) bike 25 min; Wed [S02](#s02) bike 25 min; Fri [S03](#s03) strength 20 min; Sat [S21](#s21) bike 40 min | 110 min | Tue, Thu, Sun |
| 2 / 2026-10-19 | Repeatable foundation | Mon [S22](#s22) bike 35 min; Wed [S07](#s07) bike 31 min; Fri [S17](#s17) strength 26 min; Sat [S23](#s23) bike 75 min | 167 min | Tue, Thu, Sun |
| 3 / 2026-10-26 | Controlled practice | Mon [S22](#s22) bike 35 min; Wed [S07](#s07) bike 31 min; Fri [S17](#s17) strength 26 min; Sat [S23](#s23) bike 75 min | 167 min | Tue, Thu, Sun |
| 4 / 2026-11-02 | Recovery and baseline review; review required | Mon [S24](#s24) bike 25 min; Wed [S02](#s02) bike 25 min; Fri [S03](#s03) strength 20 min; Sat [S21](#s21) bike 40 min | 110 min | Tue, Thu, Sun |
| 5 / 2026-11-09 | Event-relevant practice | Mon [S21](#s21) bike 40 min; Wed [S07](#s07) bike 31 min; Fri [S17](#s17) strength 26 min; Sat [S23](#s23) bike 75 min | 172 min | Tue, Thu, Sun |
| 6 / 2026-11-16 | Consolidate repeatability | Mon [S21](#s21) bike 40 min; Wed [S07](#s07) bike 31 min; Fri [S17](#s17) strength 26 min; Sat [S23](#s23) bike 75 min | 172 min | Tue, Thu, Sun |
| 7 / 2026-11-23 | Practice within tolerated load | Mon [S21](#s21) bike 40 min; Wed [S07](#s07) bike 31 min; Fri [S17](#s17) strength 26 min; Sat [S23](#s23) bike 75 min | 172 min | Tue, Thu, Sun |
| 8 / 2026-11-30 | Recovery and baseline review; review required | Mon [S24](#s24) bike 25 min; Wed [S02](#s02) bike 25 min; Fri [S03](#s03) strength 20 min; Sat [S21](#s21) bike 40 min | 110 min | Tue, Thu, Sun |
| 9 / 2026-12-07 | Event-specific integration | Mon [S21](#s21) bike 40 min; Wed [S07](#s07) bike 31 min; Fri [S17](#s17) strength 26 min; Sat [S23](#s23) bike 75 min | 172 min | Tue, Thu, Sun |
| 10 / 2026-12-14 | Reduced-load event preparation | Mon [S24](#s24) bike 25 min; Wed [S02](#s02) bike 25 min; Fri [S03](#s03) strength 20 min; Sat [S21](#s21) bike 40 min | 110 min | Tue, Thu, Sun |
| 11 / 2026-12-21 | Event week; review actual response | Mon [S24](#s24) bike 25 min; Wed [S02](#s02) bike 25 min; Fri [S03](#s03) strength 20 min; Sat [S21](#s21) bike 40 min; Sun event 2026-12-27; duration unknown | 110 min | Tue, Thu |
| 12 / 2026-12-28 | Post-event recovery and review; no assumed return; review required | No workouts prescribed pending actual recovery review | 0 min | Mon, Tue, Wed, Thu, Fri, Sat, Sun |

## Pool swimming

Goal: swim-only. Scope: supported_goal_example. Assumed recently tolerated ceiling: 180 min/week. Start: 2026-10-12.

Synthetic A event: 2026-12-27. Event readiness, duration and recovery are not established by this horizon.

### Baseline examples

- swim, synthetic observation 2026-10-05: Reviewed same-stroke 200/400 m pool tests; not automatically scheduled. Values: t400Seconds=480; t200Seconds=220; cssSecondsPer100m=130; poolLengthMeters=25; stroke=freestyle. (480−220)/2 = 130 s/100 m, a CSS field estimate with measurement error. It is not directly measured LT2 or proof of open-water safety.
- strength, synthetic observation 2026-10-05: Qualified review of familiar movements, comfortable loads and repetitions in reserve. Values: movement=goblet squat; loadKg=12; repetitions=6; reportedRepsInReserve=3. Synthetic technique example, not a 1RM estimate or automatic starting load. General strength is only partially supported; Olympic lifting remains outside scope.

### Full 12-week horizon

| Week / starting | Purpose | Sessions (allowance or exact time as noted in library) | Budget total, excluding event | Rest/review slots |
|---|---|---|---|---|
| 1 / 2026-10-12 | Baseline observation and familiarization; review required | Mon [S01](#s01) swim 30 min; Wed [S01](#s01) swim 30 min; Fri [S03](#s03) strength 20 min; Sat [S01](#s01) swim 30 min | 110 min | Tue, Thu, Sun |
| 2 / 2026-10-19 | Repeatable foundation | Mon [S06](#s06) swim 40 min; Wed [S06](#s06) swim 40 min; Fri [S17](#s17) strength 26 min; Sat [S01](#s01) swim 30 min | 136 min | Tue, Thu, Sun |
| 3 / 2026-10-26 | Controlled practice | Mon [S06](#s06) swim 40 min; Wed [S06](#s06) swim 40 min; Fri [S17](#s17) strength 26 min; Sat [S01](#s01) swim 30 min | 136 min | Tue, Thu, Sun |
| 4 / 2026-11-02 | Recovery and baseline review; review required | Mon [S01](#s01) swim 30 min; Wed [S01](#s01) swim 30 min; Fri [S03](#s03) strength 20 min; Sat [S01](#s01) swim 30 min | 110 min | Tue, Thu, Sun |
| 5 / 2026-11-09 | Event-relevant practice | Mon [S06](#s06) swim 40 min; Wed [S06](#s06) swim 40 min; Fri [S17](#s17) strength 26 min; Sat [S01](#s01) swim 30 min | 136 min | Tue, Thu, Sun |
| 6 / 2026-11-16 | Consolidate repeatability | Mon [S06](#s06) swim 40 min; Wed [S06](#s06) swim 40 min; Fri [S17](#s17) strength 26 min; Sat [S01](#s01) swim 30 min | 136 min | Tue, Thu, Sun |
| 7 / 2026-11-23 | Practice within tolerated load | Mon [S06](#s06) swim 40 min; Wed [S06](#s06) swim 40 min; Fri [S17](#s17) strength 26 min; Sat [S01](#s01) swim 30 min | 136 min | Tue, Thu, Sun |
| 8 / 2026-11-30 | Recovery and baseline review; review required | Mon [S01](#s01) swim 30 min; Wed [S01](#s01) swim 30 min; Fri [S03](#s03) strength 20 min; Sat [S01](#s01) swim 30 min | 110 min | Tue, Thu, Sun |
| 9 / 2026-12-07 | Event-specific integration | Mon [S06](#s06) swim 40 min; Wed [S06](#s06) swim 40 min; Fri [S17](#s17) strength 26 min; Sat [S01](#s01) swim 30 min | 136 min | Tue, Thu, Sun |
| 10 / 2026-12-14 | Reduced-load event preparation | Mon [S01](#s01) swim 30 min; Wed [S01](#s01) swim 30 min; Fri [S03](#s03) strength 20 min; Sat [S01](#s01) swim 30 min | 110 min | Tue, Thu, Sun |
| 11 / 2026-12-21 | Event week; review actual response | Mon [S01](#s01) swim 30 min; Wed [S01](#s01) swim 30 min; Fri [S03](#s03) strength 20 min; Sat [S01](#s01) swim 30 min; Sun event 2026-12-27; duration unknown | 110 min | Tue, Thu |
| 12 / 2026-12-28 | Post-event recovery and review; no assumed return; review required | No workouts prescribed pending actual recovery review | 0 min | Mon, Tue, Wed, Thu, Fri, Sat, Sun |

## HYROX familiar-skill foundation

Goal: hyrox. Scope: supported_goal_example. Assumed recently tolerated ceiling: 240 min/week. Start: 2026-10-12.

Synthetic A event: 2026-12-27. Event readiness, duration and recovery are not established by this horizon.

### Baseline examples

- run, synthetic observation 2026-10-05: Recent familiar 5 km performance, consistent course; optional non-maximal alternative records minutes/effort only. Values: distanceMeters=5000; elapsedSeconds=1500; conditions=Synthetic flat-course example. 5:00/km is observed performance pace, not measured threshold. Do not silently write performance pace to a threshold field. Any explicitly chosen derived threshold estimate must retain its method and uncertainty; an aspirational goal never becomes an anchor.
- hyrox, synthetic observation 2026-10-05: Familiar non-maximal run–station observation with reviewed equipment/load. Values: rounds=2; runMinutesPerRound=3; stationTechniqueMinutesPerRound=2; effort=comfortable. Keep running, transitions, station load/repetitions and symptoms separate. No total-race prediction or division load is inferred.
- strength, synthetic observation 2026-10-05: Qualified review of familiar movements, comfortable loads and repetitions in reserve. Values: movement=goblet squat; loadKg=12; repetitions=6; reportedRepsInReserve=3. Synthetic technique example, not a 1RM estimate or automatic starting load. General strength is only partially supported; Olympic lifting remains outside scope.

### Full 12-week horizon

| Week / starting | Purpose | Sessions (allowance or exact time as noted in library) | Budget total, excluding event | Rest/review slots |
|---|---|---|---|---|
| 1 / 2026-10-12 | Baseline observation and familiarization; review required | Mon [S04](#s04) run 25 min; Wed [S03](#s03) strength 20 min; Fri [S25](#s25) hyrox 27 min; Sat [S10](#s10) run 25 min | 97 min | Tue, Thu, Sun |
| 2 / 2026-10-19 | Repeatable foundation | Mon [S08](#s08) run 35 min; Wed [S17](#s17) strength 26 min; Fri [S26](#s26) hyrox 35 min; Sat [S08](#s08) run 35 min | 131 min | Tue, Thu, Sun |
| 3 / 2026-10-26 | Controlled practice | Mon [S08](#s08) run 35 min; Wed [S17](#s17) strength 26 min; Fri [S26](#s26) hyrox 35 min; Sat [S08](#s08) run 35 min | 131 min | Tue, Thu, Sun |
| 4 / 2026-11-02 | Recovery and baseline review; review required | Mon [S10](#s10) run 25 min; Wed [S03](#s03) strength 20 min; Fri [S25](#s25) hyrox 27 min; Sat [S10](#s10) run 25 min | 97 min | Tue, Thu, Sun |
| 5 / 2026-11-09 | Event-relevant practice | Mon [S11](#s11) run 40 min; Wed [S17](#s17) strength 26 min; Fri [S26](#s26) hyrox 35 min; Sat [S08](#s08) run 35 min | 136 min | Tue, Thu, Sun |
| 6 / 2026-11-16 | Consolidate repeatability | Mon [S11](#s11) run 40 min; Wed [S17](#s17) strength 26 min; Fri [S26](#s26) hyrox 35 min; Sat [S08](#s08) run 35 min | 136 min | Tue, Thu, Sun |
| 7 / 2026-11-23 | Practice within tolerated load | Mon [S11](#s11) run 40 min; Wed [S17](#s17) strength 26 min; Fri [S26](#s26) hyrox 35 min; Sat [S08](#s08) run 35 min | 136 min | Tue, Thu, Sun |
| 8 / 2026-11-30 | Recovery and baseline review; review required | Mon [S10](#s10) run 25 min; Wed [S03](#s03) strength 20 min; Fri [S25](#s25) hyrox 27 min; Sat [S10](#s10) run 25 min | 97 min | Tue, Thu, Sun |
| 9 / 2026-12-07 | Event-specific integration | Mon [S11](#s11) run 40 min; Wed [S17](#s17) strength 26 min; Fri [S26](#s26) hyrox 35 min; Sat [S08](#s08) run 35 min | 136 min | Tue, Thu, Sun |
| 10 / 2026-12-14 | Reduced-load event preparation | Mon [S10](#s10) run 25 min; Wed [S03](#s03) strength 20 min; Fri [S25](#s25) hyrox 27 min; Sat [S10](#s10) run 25 min | 97 min | Tue, Thu, Sun |
| 11 / 2026-12-21 | Event week; review actual response | Mon [S10](#s10) run 25 min; Wed [S03](#s03) strength 20 min; Fri [S25](#s25) hyrox 27 min; Sat [S10](#s10) run 25 min; Sun event 2026-12-27; duration unknown | 97 min | Tue, Thu |
| 12 / 2026-12-28 | Post-event recovery and review; no assumed return; review required | No workouts prescribed pending actual recovery review | 0 min | Mon, Tue, Wed, Thu, Fri, Sat, Sun |

## General strength: partial supporting scope

Goal: general-strength. Scope: partial_supporting_strength. Assumed recently tolerated ceiling: 120 min/week. Start: 2026-10-12.

No event or standalone lifting progression is inferred.

### Baseline examples

- strength, synthetic observation 2026-10-05: Qualified review of familiar movements, comfortable loads and repetitions in reserve. Values: movement=goblet squat; loadKg=12; repetitions=6; reportedRepsInReserve=3. Synthetic technique example, not a 1RM estimate or automatic starting load. General strength is only partially supported; Olympic lifting remains outside scope.

### Full 12-week horizon

| Week / starting | Purpose | Sessions (allowance or exact time as noted in library) | Budget total, excluding event | Rest/review slots |
|---|---|---|---|---|
| 1 / 2026-10-12 | Baseline observation and familiarization; review required | Tue [S03](#s03) strength 20 min; Fri [S03](#s03) strength 20 min | 40 min | Mon, Wed, Thu, Sat, Sun |
| 2 / 2026-10-19 | Repeatable foundation | Tue [S17](#s17) strength 26 min; Fri [S17](#s17) strength 26 min | 52 min | Mon, Wed, Thu, Sat, Sun |
| 3 / 2026-10-26 | Controlled practice | Tue [S17](#s17) strength 26 min; Fri [S17](#s17) strength 26 min | 52 min | Mon, Wed, Thu, Sat, Sun |
| 4 / 2026-11-02 | Recovery and baseline review; review required | Tue [S03](#s03) strength 20 min; Fri [S03](#s03) strength 20 min | 40 min | Mon, Wed, Thu, Sat, Sun |
| 5 / 2026-11-09 | Event-relevant practice | Tue [S17](#s17) strength 26 min; Fri [S17](#s17) strength 26 min | 52 min | Mon, Wed, Thu, Sat, Sun |
| 6 / 2026-11-16 | Consolidate repeatability | Tue [S17](#s17) strength 26 min; Fri [S17](#s17) strength 26 min | 52 min | Mon, Wed, Thu, Sat, Sun |
| 7 / 2026-11-23 | Practice within tolerated load | Tue [S17](#s17) strength 26 min; Fri [S17](#s17) strength 26 min | 52 min | Mon, Wed, Thu, Sat, Sun |
| 8 / 2026-11-30 | Recovery and baseline review; review required | Tue [S03](#s03) strength 20 min; Fri [S03](#s03) strength 20 min | 40 min | Mon, Wed, Thu, Sat, Sun |
| 9 / 2026-12-07 | Event-specific integration | Tue [S17](#s17) strength 26 min; Fri [S17](#s17) strength 26 min | 52 min | Mon, Wed, Thu, Sat, Sun |
| 10 / 2026-12-14 | Reduced-load event preparation | Tue [S03](#s03) strength 20 min; Fri [S03](#s03) strength 20 min | 40 min | Mon, Wed, Thu, Sat, Sun |
| 11 / 2026-12-21 | Reduced practice and goal review | Tue [S03](#s03) strength 20 min; Fri [S03](#s03) strength 20 min | 40 min | Mon, Wed, Thu, Sat, Sun |
| 12 / 2026-12-28 | Reduced practice and goal review; review required | Tue [S03](#s03) strength 20 min; Fri [S03](#s03) strength 20 min | 40 min | Mon, Wed, Thu, Sat, Sun |

## Editable session library

All targets are open effort with explicit instructions. No numeric pace, power or HR target is derived from the synthetic results. Source IDs refer to the [existing evidence dossier](training-evidence.md); the cited studies support principles and do not validate these exact recipes.

### S01

**4 × 100 m technique practice (swim)**. Repeatable stroke quality; distance totals are exact but elapsed swim time is unknown.

Distance total: 700 m. Known timed steps: 90 s, including 90 s recovery. Elapsed session time: unknown. Scheduling allowance: 30 min.

1. Easy familiar stroke: 200 m (warmup; swim). Pool with appropriate supervision; use a familiar stroke and stop before technique fails.
2. Controlled 100 m 1/4: 100 m (active; swim). Comfortable technique-focused pace; no CSS target inferred from this example.
3. Rest at wall: 30 s (recovery; swim). Recover comfortably; extend rest or omit a repeat if needed.
4. Controlled 100 m 2/4: 100 m (active; swim). Comfortable technique-focused pace; no CSS target inferred from this example.
5. Rest at wall: 30 s (recovery; swim). Recover comfortably; extend rest or omit a repeat if needed.
6. Controlled 100 m 3/4: 100 m (active; swim). Comfortable technique-focused pace; no CSS target inferred from this example.
7. Rest at wall: 30 s (recovery; swim). Recover comfortably; extend rest or omit a repeat if needed.
8. Controlled 100 m 4/4: 100 m (active; swim). Comfortable technique-focused pace; no CSS target inferred from this example.
9. Easy finish: 100 m (cooldown; swim). Comfortable familiar stroke; no breath-holding challenge.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: S1, S2. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S02

**Comfortable baseline observation (bike)**. Non-maximal observation of familiar work; no threshold or VO2max measurement.

Exact timed total: 1500 s (25 min); active steps 900 s, recovery steps 0 s; warm-up/cool-down are included.

1. Gradual warm-up: 300 s (warmup; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Observe comfortable effort; record conditions and response: 900 s (active; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Easy finish: 300 s (cooldown; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: C1, Z1, Z2. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S03

**Familiar movement practice (strength)**. Supporting strength practice; load, reps and progression require individual review.

Exact timed total: 1200 s (20 min); active steps 360 s, recovery steps 360 s; warm-up/cool-down are included.

1. Familiar mobility and unloaded rehearsal: 300 s (warmup; strength). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Coach-reviewed familiar squat or supported sit-to-stand: 120 s (active; strength). Technique window, not continuous repetitions. Coach/athlete selects familiar load and reps; finish well before failure. No maximal lift or Olympic lift is assigned.
3. Full recovery / equipment adjustment: 120 s (recovery; strength). Rest; continue only with comfortable technique.
4. Coach-reviewed familiar hinge: 120 s (active; strength). Technique window, not continuous repetitions. Coach/athlete selects familiar load and reps; finish well before failure. No maximal lift or Olympic lift is assigned.
5. Full recovery / equipment adjustment: 120 s (recovery; strength). Rest; continue only with comfortable technique.
6. Coach-reviewed familiar row or press: 120 s (active; strength). Technique window, not continuous repetitions. Coach/athlete selects familiar load and reps; finish well before failure. No maximal lift or Olympic lift is assigned.
7. Full recovery / equipment adjustment: 120 s (recovery; strength). Rest; continue only with comfortable technique.
8. Easy mobility finish: 180 s (cooldown; strength). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: ST1, ST4. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S04

**Comfortable baseline observation (run)**. Non-maximal observation of familiar work; no threshold or VO2max measurement.

Exact timed total: 1500 s (25 min); active steps 900 s, recovery steps 0 s; warm-up/cool-down are included.

1. Gradual warm-up: 300 s (warmup; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Observe comfortable effort; record conditions and response: 900 s (active; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Easy finish: 300 s (cooldown; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: R1, R2. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S05

**Easy bike–run transition practice (brick)**. Combined easy load; neither an additional hard day nor evidence of race-distance readiness.

Exact timed total: 3180 s (53 min); active steps 2220 s, recovery steps 180 s; warm-up/cool-down are included.

1. Easy bike warm-up: 300 s (warmup; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Comfortable bike endurance: 1800 s (active; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Easy bike finish: 300 s (cooldown; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
4. Unhurried equipment transition: 180 s (recovery; brick). Safe venue; change equipment without rushing.
5. Comfortable run off the bike: 420 s (active; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
6. Walk or easy finish: 180 s (cooldown; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: T1. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S06

**6 × 100 m technique practice (swim)**. Repeatable stroke quality; distance totals are exact but elapsed swim time is unknown.

Distance total: 900 m. Known timed steps: 150 s, including 150 s recovery. Elapsed session time: unknown. Scheduling allowance: 40 min.

1. Easy familiar stroke: 200 m (warmup; swim). Pool with appropriate supervision; use a familiar stroke and stop before technique fails.
2. Controlled 100 m 1/6: 100 m (active; swim). Comfortable technique-focused pace; no CSS target inferred from this example.
3. Rest at wall: 30 s (recovery; swim). Recover comfortably; extend rest or omit a repeat if needed.
4. Controlled 100 m 2/6: 100 m (active; swim). Comfortable technique-focused pace; no CSS target inferred from this example.
5. Rest at wall: 30 s (recovery; swim). Recover comfortably; extend rest or omit a repeat if needed.
6. Controlled 100 m 3/6: 100 m (active; swim). Comfortable technique-focused pace; no CSS target inferred from this example.
7. Rest at wall: 30 s (recovery; swim). Recover comfortably; extend rest or omit a repeat if needed.
8. Controlled 100 m 4/6: 100 m (active; swim). Comfortable technique-focused pace; no CSS target inferred from this example.
9. Rest at wall: 30 s (recovery; swim). Recover comfortably; extend rest or omit a repeat if needed.
10. Controlled 100 m 5/6: 100 m (active; swim). Comfortable technique-focused pace; no CSS target inferred from this example.
11. Rest at wall: 30 s (recovery; swim). Recover comfortably; extend rest or omit a repeat if needed.
12. Controlled 100 m 6/6: 100 m (active; swim). Comfortable technique-focused pace; no CSS target inferred from this example.
13. Easy finish: 100 m (cooldown; swim). Comfortable familiar stroke; no breath-holding challenge.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: S1, S2. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S07

**3 × 4-minute controlled practice (bike)**. Practice repeatable effort; this moderate JMM dose is not the maximal-tolerable Seiler or Helgerud protocol.

Exact timed total: 1860 s (31 min); active steps 720 s, recovery steps 240 s; warm-up/cool-down are included.

1. Easy warm-up: 600 s (warmup; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Controlled repetition 1/3: 240 s (active; bike). Controlled repeatable effort, about 5/10. Reduce if form or repeatability deteriorates; this RPE is a coaching cue, not a measured physiological zone.
3. Easy recovery: 120 s (recovery; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
4. Controlled repetition 2/3: 240 s (active; bike). Controlled repeatable effort, about 5/10. Reduce if form or repeatability deteriorates; this RPE is a coaching cue, not a measured physiological zone.
5. Easy recovery: 120 s (recovery; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
6. Controlled repetition 3/3: 240 s (active; bike). Controlled repeatable effort, about 5/10. Reduce if form or repeatability deteriorates; this RPE is a coaching cue, not a measured physiological zone.
7. Easy cool-down: 300 s (cooldown; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: C1. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S08

**Easy endurance (run)**. Maintain repeatable tolerated endurance.

Exact timed total: 2100 s (35 min); active steps 1500 s, recovery steps 0 s; warm-up/cool-down are included.

1. Gradual warm-up: 300 s (warmup; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Comfortable continuous work: 1500 s (active; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Easy finish: 300 s (cooldown; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: R1, R2. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S09

**Easy bike–run transition practice (brick)**. Combined easy load; neither an additional hard day nor evidence of race-distance readiness.

Exact timed total: 4080 s (68 min); active steps 3120 s, recovery steps 180 s; warm-up/cool-down are included.

1. Easy bike warm-up: 300 s (warmup; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Comfortable bike endurance: 2400 s (active; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Easy bike finish: 300 s (cooldown; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
4. Unhurried equipment transition: 180 s (recovery; brick). Safe venue; change equipment without rushing.
5. Comfortable run off the bike: 720 s (active; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
6. Walk or easy finish: 180 s (cooldown; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: T1. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S10

**Easy endurance (run)**. Maintain repeatable tolerated endurance.

Exact timed total: 1500 s (25 min); active steps 900 s, recovery steps 0 s; warm-up/cool-down are included.

1. Gradual warm-up: 300 s (warmup; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Comfortable continuous work: 900 s (active; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Easy finish: 300 s (cooldown; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: R1, R2. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S11

**Easy endurance (run)**. Maintain repeatable tolerated endurance.

Exact timed total: 2400 s (40 min); active steps 1800 s, recovery steps 0 s; warm-up/cool-down are included.

1. Gradual warm-up: 300 s (warmup; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Comfortable continuous work: 1800 s (active; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Easy finish: 300 s (cooldown; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: R1, R2. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S12

**Easy bike–run transition practice (brick)**. Combined easy load; neither an additional hard day nor evidence of race-distance readiness.

Exact timed total: 4980 s (83 min); active steps 4020 s, recovery steps 180 s; warm-up/cool-down are included.

1. Easy bike warm-up: 300 s (warmup; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Comfortable bike endurance: 3300 s (active; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Easy bike finish: 300 s (cooldown; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
4. Unhurried equipment transition: 180 s (recovery; brick). Safe venue; change equipment without rushing.
5. Comfortable run off the bike: 720 s (active; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
6. Walk or easy finish: 180 s (cooldown; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: T1. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S13

**Easy bike–run transition practice (brick)**. Combined easy load; neither an additional hard day nor evidence of race-distance readiness.

Exact timed total: 5880 s (98 min); active steps 4920 s, recovery steps 180 s; warm-up/cool-down are included.

1. Easy bike warm-up: 300 s (warmup; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Comfortable bike endurance: 4200 s (active; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Easy bike finish: 300 s (cooldown; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
4. Unhurried equipment transition: 180 s (recovery; brick). Safe venue; change equipment without rushing.
5. Comfortable run off the bike: 720 s (active; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
6. Walk or easy finish: 180 s (cooldown; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: T1. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S14

**Easy bike–run transition practice (brick)**. Combined easy load; neither an additional hard day nor evidence of race-distance readiness.

Exact timed total: 6780 s (113 min); active steps 5820 s, recovery steps 180 s; warm-up/cool-down are included.

1. Easy bike warm-up: 300 s (warmup; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Comfortable bike endurance: 5100 s (active; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Easy bike finish: 300 s (cooldown; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
4. Unhurried equipment transition: 180 s (recovery; brick). Safe venue; change equipment without rushing.
5. Comfortable run off the bike: 720 s (active; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
6. Walk or easy finish: 180 s (cooldown; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: T1. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S15

**Easy endurance (run)**. Maintain repeatable tolerated endurance.

Exact timed total: 1800 s (30 min); active steps 1200 s, recovery steps 0 s; warm-up/cool-down are included.

1. Gradual warm-up: 300 s (warmup; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Comfortable continuous work: 1200 s (active; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Easy finish: 300 s (cooldown; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: R1, R2. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S16

**3 × 4-minute controlled practice (run)**. Practice repeatable effort; this moderate JMM dose is not the maximal-tolerable Seiler or Helgerud protocol.

Exact timed total: 1860 s (31 min); active steps 720 s, recovery steps 240 s; warm-up/cool-down are included.

1. Easy warm-up: 600 s (warmup; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Controlled repetition 1/3: 240 s (active; run). Controlled repeatable effort, about 5/10. Reduce if form or repeatability deteriorates; this RPE is a coaching cue, not a measured physiological zone.
3. Easy recovery: 120 s (recovery; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
4. Controlled repetition 2/3: 240 s (active; run). Controlled repeatable effort, about 5/10. Reduce if form or repeatability deteriorates; this RPE is a coaching cue, not a measured physiological zone.
5. Easy recovery: 120 s (recovery; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
6. Controlled repetition 3/3: 240 s (active; run). Controlled repeatable effort, about 5/10. Reduce if form or repeatability deteriorates; this RPE is a coaching cue, not a measured physiological zone.
7. Easy cool-down: 300 s (cooldown; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: R1, R2. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S17

**Familiar movement practice (strength)**. Supporting strength practice; load, reps and progression require individual review.

Exact timed total: 1560 s (26 min); active steps 720 s, recovery steps 360 s; warm-up/cool-down are included.

1. Familiar mobility and unloaded rehearsal: 300 s (warmup; strength). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Coach-reviewed familiar squat or supported sit-to-stand: 240 s (active; strength). Technique window, not continuous repetitions. Coach/athlete selects familiar load and reps; finish well before failure. No maximal lift or Olympic lift is assigned.
3. Full recovery / equipment adjustment: 120 s (recovery; strength). Rest; continue only with comfortable technique.
4. Coach-reviewed familiar hinge: 240 s (active; strength). Technique window, not continuous repetitions. Coach/athlete selects familiar load and reps; finish well before failure. No maximal lift or Olympic lift is assigned.
5. Full recovery / equipment adjustment: 120 s (recovery; strength). Rest; continue only with comfortable technique.
6. Coach-reviewed familiar row or press: 240 s (active; strength). Technique window, not continuous repetitions. Coach/athlete selects familiar load and reps; finish well before failure. No maximal lift or Olympic lift is assigned.
7. Full recovery / equipment adjustment: 120 s (recovery; strength). Rest; continue only with comfortable technique.
8. Easy mobility finish: 180 s (cooldown; strength). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: ST1, ST4. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S18

**Easy endurance (run)**. Maintain repeatable tolerated endurance.

Exact timed total: 3000 s (50 min); active steps 2400 s, recovery steps 0 s; warm-up/cool-down are included.

1. Gradual warm-up: 300 s (warmup; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Comfortable continuous work: 2400 s (active; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Easy finish: 300 s (cooldown; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: R1, R2. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S19

**Sprint technique review (run)**. Sprint technique review.

Exact timed total: 1500 s (25 min); active steps 600 s, recovery steps 0 s; warm-up/cool-down are included.

1. Easy warm-up: 600 s (warmup; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Familiar low-speed mechanics, pauses as needed: 600 s (active; run). Coach-led technique; no maximal velocity or aerobic HR target.
3. Easy finish: 300 s (cooldown; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: TRN-SPRINT-QUALITY-PRACTICE. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S20

**4 × 20 m acceleration practice (run)**. Quality and measured repeat time on consistent surface, not endurance conditioning.

Distance total: 80 m. Known timed steps: 1740 s, including 540 s recovery. Elapsed session time: unknown. Scheduling allowance: 40 min.

1. Easy warm-up and familiar drills: 900 s (warmup; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Controlled acceleration 1/4: 20 m (active; run). Technically prepared adult under qualified sprint coaching; build speed smoothly, never strain or chase HR.
3. Full walk / standing recovery: 180 s (recovery; run). Do not shorten recovery to increase difficulty; extend or stop if not ready.
4. Controlled acceleration 2/4: 20 m (active; run). Technically prepared adult under qualified sprint coaching; build speed smoothly, never strain or chase HR.
5. Full walk / standing recovery: 180 s (recovery; run). Do not shorten recovery to increase difficulty; extend or stop if not ready.
6. Controlled acceleration 3/4: 20 m (active; run). Technically prepared adult under qualified sprint coaching; build speed smoothly, never strain or chase HR.
7. Full walk / standing recovery: 180 s (recovery; run). Do not shorten recovery to increase difficulty; extend or stop if not ready.
8. Controlled acceleration 4/4: 20 m (active; run). Technically prepared adult under qualified sprint coaching; build speed smoothly, never strain or chase HR.
9. Easy cool-down: 300 s (cooldown; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: TRN-SPRINT-QUALITY-PRACTICE. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S21

**Easy endurance (bike)**. Maintain repeatable tolerated endurance.

Exact timed total: 2400 s (40 min); active steps 1800 s, recovery steps 0 s; warm-up/cool-down are included.

1. Gradual warm-up: 300 s (warmup; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Comfortable continuous work: 1800 s (active; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Easy finish: 300 s (cooldown; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: C1, Z1, Z2. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S22

**Easy endurance (bike)**. Maintain repeatable tolerated endurance.

Exact timed total: 2100 s (35 min); active steps 1500 s, recovery steps 0 s; warm-up/cool-down are included.

1. Gradual warm-up: 300 s (warmup; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Comfortable continuous work: 1500 s (active; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Easy finish: 300 s (cooldown; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: C1, Z1, Z2. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S23

**Easy endurance (bike)**. Maintain repeatable tolerated endurance.

Exact timed total: 4500 s (75 min); active steps 3900 s, recovery steps 0 s; warm-up/cool-down are included.

1. Gradual warm-up: 300 s (warmup; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Comfortable continuous work: 3900 s (active; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Easy finish: 300 s (cooldown; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: C1, Z1, Z2. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S24

**Easy endurance (bike)**. Maintain repeatable tolerated endurance.

Exact timed total: 1500 s (25 min); active steps 900 s, recovery steps 0 s; warm-up/cool-down are included.

1. Gradual warm-up: 300 s (warmup; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Comfortable continuous work: 900 s (active; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Easy finish: 300 s (cooldown; bike). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: C1, Z1, Z2. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S25

**2 controlled run–station rounds (hyrox)**. Practice familiar transitions; observational HYROX evidence does not validate this dose or full-race readiness.

Exact timed total: 1620 s (27 min); active steps 600 s, recovery steps 240 s; warm-up/cool-down are included.

1. Easy movement and familiar station rehearsal: 480 s (warmup; hyrox). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Comfortable run 1/2: 180 s (active; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Controlled transition: 60 s (recovery; hyrox). Walk, prepare equipment, do not rush.
4. Familiar row or carry technique: 120 s (active; hyrox). Reviewed movement and load only; no fixed repetitions, division load or race-equivalent target is assumed.
5. Easy recovery: 120 s (recovery; hyrox). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
6. Comfortable run 2/2: 180 s (active; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
7. Controlled transition: 60 s (recovery; hyrox). Walk, prepare equipment, do not rush.
8. Familiar row or carry technique: 120 s (active; hyrox). Reviewed movement and load only; no fixed repetitions, division load or race-equivalent target is assumed.
9. Easy cool-down: 300 s (cooldown; hyrox). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: H1, H2. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.

### S26

**3 controlled run–station rounds (hyrox)**. Practice familiar transitions; observational HYROX evidence does not validate this dose or full-race readiness.

Exact timed total: 2100 s (35 min); active steps 900 s, recovery steps 420 s; warm-up/cool-down are included.

1. Easy movement and familiar station rehearsal: 480 s (warmup; hyrox). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
2. Comfortable run 1/3: 180 s (active; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
3. Controlled transition: 60 s (recovery; hyrox). Walk, prepare equipment, do not rush.
4. Familiar row or carry technique: 120 s (active; hyrox). Reviewed movement and load only; no fixed repetitions, division load or race-equivalent target is assumed.
5. Easy recovery: 120 s (recovery; hyrox). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
6. Comfortable run 2/3: 180 s (active; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
7. Controlled transition: 60 s (recovery; hyrox). Walk, prepare equipment, do not rush.
8. Familiar row or carry technique: 120 s (active; hyrox). Reviewed movement and load only; no fixed repetitions, division load or race-equivalent target is assumed.
9. Easy recovery: 120 s (recovery; hyrox). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
10. Comfortable run 3/3: 180 s (active; run). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.
11. Controlled transition: 60 s (recovery; hyrox). Walk, prepare equipment, do not rush.
12. Familiar row or carry technique: 120 s (active; hyrox). Reviewed movement and load only; no fixed repetitions, division load or race-equivalent target is assumed.
13. Easy cool-down: 300 s (cooldown; hyrox). Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.

Provenance: JMM coaching heuristic; not a trial replication. Principle sources: H1, H2. Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.
