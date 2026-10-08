# JMM race-planning comparative audit

Research date: **8 October 2026 (UTC)**. Read-only, bounded review of primary repositories and official product documentation. No applications installed, athlete data uploaded, accounts created, code incorporated, or JMM application files changed.

## Decision in brief

The inspected JMM implementation is a defensible **scenario engine**, not a demonstrated individualized race-capacity forecast. The newly completed comparison covers **19 candidates: 10 GitHub repositories and 9 commercial product/features**. It does not establish that every relevant internet project has been researched, nor does it measure JMM race-time accuracy.

Best next moves are (1) a chronological real-race evaluation harness, (2) clearer target-execution splits and aid-station logistics, and (3) calibrated athlete/course parameters. Copying a larger model or adding more physiological coefficients is not the first priority. Two MIT-licensed repositories merit limited component evaluation; several others are useful references but unsuitable for direct reuse.

### Status correction

[PR #35](https://github.com/Pablodd1/Jasmethod/pull/35) was **closed and merged** when checked, with merge SHA `a9711731f3a2b800ec43d455864a15e156a838bd`. Its description still contains earlier statements that it is draft/open. This audit compares the PR's inspected head `bedd0927060701ef9708294e6e2e869c76d5f9be`; it does not infer production deployment from merging.

## Search strategy and coverage

Discovery queries combined GitHub with cycling race pacing, power/wind models, running race prediction, Riegel, GPX pacing optimizers, triathlon simulators, and fueling planners. Named primary sources were checked for Best Bike Split, myWindsock, Garmin PacePro and Race Predictor, Stryd Race Power, GoldenCheetah, Runalyze, Precision Fuel & Hydration, and Fuelin. Follow-on discoveries included RacePacer, GPX Pacer, a personalized trail predictor, lightweight Riegel tools, and a synthetic triathlon ML project. Maurten's official planner was also screened.

For GitHub candidates, the review fetched repository metadata and recursive trees, checked actual source and license files for the strongest or riskiest candidates, and looked for test/evaluation artifacts. The inventory records branch-head SHAs and last-push dates. Maintenance is reported as metadata, not as a claim that an algorithm is correct. GitHub stars were not used as evidence. Commercial findings concern documented behavior, not reverse-engineered algorithms or tested accounts.

Coverage limitations: English-language and named-product discovery is not a systematic literature review; not all forks, languages, paid account flows, mobile apps, or course registries were evaluated. Repository tests and benchmark scripts were **not executed**. No athlete-specific held-out dataset was available. Runalytics received metadata/tree/README screening rather than deep code review. Dynamic commercial planner shells reveal less than complete flows. Motorsport, horse racing, trucking fuel planners and generic AI demo results were rejected as outside this endurance-racing scope. Search hits without adequate primary evidence were not used to claim accuracy.

Machine-readable evidence and decisions: `candidate-inventory.json` accompanies this report.

## What JMM actually implements

The [head-pinned engine](https://github.com/Pablodd1/Jasmethod/blob/bedd0927060701ef9708294e6e2e869c76d5f9be/src/lib/race-scenario.ts) calculates explicitly selected running, cycling and swimming targets, triathlon totals, signed segment geometry, bicycle steady-state mechanics, optional metabolic-efficiency sensitivity, and practiced carbohydrate-rate logistics. Running uses a grade-cost polynomial under additional field assumptions and limits. Weather is context; no automatic individualized heat, humidity, altitude or acclimation penalty is applied. Cycling omits dynamic acceleration and full crosswind/yaw treatment. Swimming is selected-pace arithmetic, not an open-water capability model.

The [forecast gate](https://github.com/Pablodd1/Jasmethod/blob/bedd0927060701ef9708294e6e2e869c76d5f9be/src/lib/forecast-availability.ts) explicitly disables personalized numeric forecasts. The [workspace specification](https://github.com/Pablodd1/Jasmethod/blob/bedd0927060701ef9708294e6e2e869c76d5f9be/docs/race-scenario-workspace.md) distinguishes observed evidence, selected targets, mechanical work, intake logistics, provider forecasts and seasonal history. Its selected sensitivity band is not a calibrated prediction interval.

The [verification report](https://github.com/Pablodd1/Jasmethod/blob/bedd0927060701ef9708294e6e2e869c76d5f9be/docs/race-scenario-verification.md) reports 784 unit tests plus integration checks, but also says authenticated visual QA and real-race predictive validation are outstanding. Those checks were not rerun here. Software correctness, scientific plausibility and forecast accuracy are separate claims.

## Commercial comparisons: product ideas, not reusable code

| Product / feature | Verified useful idea | Difference from JMM and evidence boundary |
|---|---|---|
| [Best Bike Split](https://www.bestbikesplit.com/) | Course, weather, equipment and power inputs produce variable-power bike pacing; device/export execution | JMM has segment mechanics but not a fitted sustainable-power model or optimized effort distribution. The site's typical 2–3% prediction claim is a vendor claim; no reproducible held-out protocol was audited. It cannot become JMM's accuracy promise. |
| [myWindsock](https://mywindsock.com/page/discussion/how-does-a-mywindsock-forecast-actually-work/) | Conditions vary along time/distance; mechanical parameters and forecast error matter | JMM currently keeps forecast magnitude separate from explicitly signed segment wind. Route/time interpolation and parameter-calibration UX are valuable follow-ups. [API access](https://mywindsock.com/page/api/) requires application and exposes proprietary metrics; it is not a free source-code component. |
| [Garmin PacePro](https://support.garmin.com/en-GB/?faq=svpm2I38YB2sU5CiqFXyfA) | User goal time/pace drives course-aware execution splits | This is the closest conceptual analogue to target planning. [Grade guidance](https://www.garmin.com/en-CA/garmin-technology/maps-for-smartwatches/pacepro/) does not itself establish that a target is achievable. JMM can improve split UX without pretending to estimate capacity. |
| [Garmin Race Predictor](https://support.garmin.com/id-ID/?faq=HUB4yrzJkg1BbgmozWkBm7) | Distinguishes generic from event-specific estimates using training history and other inputs | Separate from PacePro. Event-specific documentation includes course/environment factors. Formula, calibration data and reproducible error estimates were not established; do not imitate numerical adjustments from UI behavior. |
| [Stryd Race Power](https://help.stryd.com/en/articles/6879547-race-power-calculator) | Uses recent power-duration history and fatigue characteristics; missing-data gates and course uploads | Real capacity estimation beyond selected-target arithmetic. Official documentation uses a 90-day history and minimum-data conditions; this does not justify JMM's arbitrary evidence review window as a validated physiological threshold. [FAQ](https://help.stryd.com/en/articles/8955821-stryd-race-calculations-faq) describes environmental comparison and limitations for ultra/fueling. No accuracy transfer or interchangeable running-watt assumption. |
| [Runalyze hosted](https://runalyze.com/help/article/marathon-shape?_locale=en) | Training volume and long-run preparation adjust optimistic long-distance estimates | Helpful durability concept, but Runalyze itself says [marathon shape is not scientifically based](https://blog.runalyze.com/features/new-marathon-shape-for-other-distances/). Do not transplant heuristic weights as established coefficients. Current hosted functionality is not equivalent to the archived repository. |
| [Precision Fuel & Hydration](https://www.precisionhydration.com/planner/) | Separates carbohydrate, fluid and sodium execution; [physical strategy reminders](https://www.precisionhydration.com/us/en/products/strategy-stickers/?currency=USD&variant=45867579834587) | Useful logistics inspiration. Planner shell was readable but underlying decision algorithm was not audited. JMM should retain practiced intake and feeding-window boundaries rather than derive intake from mechanical work. |
| [Fuelin](https://fuelin.com/articles/the-magic-behind-fuelin) | Changed duration/intensity/start time recomputes a plan; explicit planned-versus-completed distinction | Useful recalculation and explanation UX. Article also exposes discontinuous thresholds: a reason to test boundary behavior, not to copy prescriptions. No independently validated race-forecast algorithm established. |
| [Maurten Fuel Planner](https://planner.maurten.com/) | Official planner supports running, cycling and triathlon | Scope confirmed from public shell only. Formula, personalization and performance outcomes not verified. Secondary inspiration, not a selected implementation dependency. |

All commercial implementations remain proprietary for this review: reading documentation grants no copying or API/data-use permission. No accounts or integrations were created.

## Open-source/source-visible candidates: actual inspection findings

### 1. GoldenCheetah: strong reference; copyleft review required

The inspected [PDModel.cpp](https://github.com/GoldenCheetah/GoldenCheetah/blob/852c821ef53df1ad8d5790b06d7ecdd0542a21e2/src/Metrics/PDModel.cpp) contains CP2, CP3, extended and multi-component power-duration models. [PhysicsUtility.cpp](https://github.com/GoldenCheetah/GoldenCheetah/blob/852c821ef53df1ad8d5790b06d7ecdd0542a21e2/src/Train/PhysicsUtility.cpp) implements mechanical/air-density utilities; repository trees include aero field-test fixtures. Last push checked: 2026-10-06. This is substantive maintained analytical code, not proof that its curves predict every race.

Inspected file headers permit GPLv2 or later; top-level COPYING is GPLv2. Use as an independent benchmark/reference first. Do not port functions into JMM client bundles without license compatibility review. No held-out finish-time validation or test execution was established here.

### 2. Runalyze legacy: historical reference, not current implementation

[Repository](https://github.com/Runalyze/Runalyze) is archived, last push 2019-11-08. Its current default branch is `support/4.3.x`, not master. [Legacy VO2max prognosis](https://github.com/Runalyze/Runalyze/blob/5669237a78c7d3512df969052fd0d97e5dca6820/inc/core/Sports/Running/Prognosis/VO2max.php) includes an endurance adjustment explicitly described as the developers' own approach. Relevant PHPUnit prognosis tests exist; dependencies are legacy PHP/Symfony versions. No current top-level reuse license was established from the inspected branch, so do not assume GPL/AGPL based on related projects. Study concepts; defer reuse until exact revision/file rights are resolved.

### 3. danielissing/race-predictor: best evaluation scaffold candidate, with caveats

[MIT license](https://github.com/danielissing/race-predictor/blob/421adc894477fc396066f7561cb36a8a9de973ac/LICENSE) verified. Last push: 2026-05-02. [validate.py](https://github.com/danielissing/race-predictor/blob/421adc894477fc396066f7561cb36a8a9de973ac/validate.py) genuinely excludes each evaluated race in its LOOCV mode and reports MAE, bias, RMSE and P10–P90 coverage. The default quick mode reuses the saved training model. [pace_builder.py](https://github.com/danielissing/race-predictor/blob/421adc894477fc396066f7561cb36a8a9de973ac/utils/pace_builder.py) fits grade-bin behavior, fatigue/rest features and variance scale; variance calibration is explicitly leave-none-out.

Selected for **evaluation design and prototype comparison**, not wholesale adoption. LOOCV can train on chronologically later races; a future-race product needs rolling-origin evaluation. Its within-training calibration and manually bounded variance scale do not guarantee nominal coverage. No published generalizable empirical score or automated test suite was established. Local plain-JSON credential persistence is also not a pattern to copy into a multi-user service.

### 4. rygao/racepacer: useful target-conserving splits, not predictions

[MIT license](https://github.com/rygao/racepacer/blob/10df2ee83ca37e992a0c55a0174f975cc58cee42/LICENSE) verified; last push 2026-05-11. [paceCalc.js](https://github.com/rygao/racepacer/blob/10df2ee83ca37e992a0c55a0174f975cc58cee42/src/lib/paceCalc.js) allocates a chosen finish time over route cost and a fade profile, interpolating exact split boundaries. This is a good small, inspectable UX/arithmetic candidate.

[minetti.js](https://github.com/rygao/racepacer/blob/10df2ee83ca37e992a0c55a0174f975cc58cee42/src/lib/minetti.js) actually defaults to a claimed Strava-distillation polynomial, not the backup Minetti function. It clamps grade at ±30%; JMM has different explicit bounds/downhill safety assumptions. No scientific provenance for the fitted default or test files were established. Reuse allocation ideas independently of its physiological coefficients.

### 5. dyfan-davies/cycling-performance-model: ambitious, but do not import defaults

[Source](https://github.com/dyfan-davies/cycling-performance-model/blob/74278051ad4c34de005995f7fc64a95691fa983a/physics_engine.py), GPLv3; last push 2026-08-15. It contains a one-second dynamic simulation, corner heuristics, position-related CdA changes and W′ logic. No test files or held-out race benchmark were found in the inspected tree. Source also approximates mechanical kJ as metabolic kcal, infers carbohydrate fractions from intensity, supplies duration-based intake recommendations, and triples modeled corner speed on uphill sections. Those are concrete reasons not to adopt it as a validated/safe physiological or cornering engine. Useful research comparison for dynamics only; separate equations from heuristics and review GPL obligations.

### 6–10. Other repositories and reasons not selected for immediate reuse

| Candidate | Verified finding | Decision |
|---|---|---|
| [Zettt/gpx-pacer](https://github.com/Zettt/gpx-pacer/tree/9773dba1be8365af88cc092c801d99cdde5ef559) | Aid-station/distance splitting, CSV/JSON, post-race analysis; unit/integration test paths present; last push 2026-05-13 | Good logistics/export reference. README says MIT but no LICENSE file or pyproject license field found; clarify before copying. Tests not run. |
| [BarnBedford/PowerClimb](https://github.com/BarnBedford/PowerClimb/blob/66c4286dc80ddbe779b189614d0c230692b26acd/power_curve.py) | Default CP=1.02×FTP and W′=75×FTP, source's indefinite-duration language; no license/test files found; last push 2026-02-23 | Reject direct reuse and capability claims. Its distance-weighted fourth-power estimate is not enough evidence for a valid standard normalized-power implementation. |
| [alexgasconn/RaceTimePredictor](https://github.com/alexgasconn/RaceTimePredictor/blob/1a972ebd333a9eb309e617666c08f826617f2292/scripts/manual.js) | Fixed 1.06 distance exponent, date weighting and range from min/max of trimmed entries; last push 2025-05-07 | Useful naive baseline only. Range is not an empirical prediction interval. README MIT claim without license file; no tests found. |
| [Fransandi/Runalytics](https://github.com/Fransandi/Runalytics) | Riegel-based prediction script, metadata/tree screening; last push 2025-10-22, no detected license | Overlaps simpler baseline; not selected for deeper implementation work. Accuracy and code reuse not established. |
| [Hamadispolar/triathlon-predictor](https://github.com/Hamadispolar/triathlon-predictor/blob/main/model.py) | `generate_dataset` creates 600 synthetic athletes/targets; default training uses these; splits are fixed 18/50/32%; metrics file reports 4.99-minute MAE and R² .9806 | Reject as evidence of real-race accuracy. A held-out synthetic sample tests its generator, not triathletes. README MIT claim without license file; no safe adoption clearance. |

## License and attribution gate

Verified MIT files permit reuse subject to retaining copyright and permission notices in copies/substantial portions. Pin exact revisions, retain original notices, review dependencies/assets separately, and add third-party provenance for any copied component. A README label alone is not complete component clearance; a missing detected license is not proof that no historical grant ever existed, but this audit does not grant permission.

GPL is not a ban on commercial use. Distribution/combination and browser-delivered code create obligations that require architecture-specific review. Server-only GPL use differs from distributed JavaScript, and AGPL has additional network-use conditions. See the [FSF's official FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#UnreleasedMods). No legal compatibility conclusion for JMM is claimed here; safest immediate path is original implementation from independently documented equations or reviewed permissive components. Public copy can omit optional product comparisons, but required license notices and data attribution cannot be removed to hide source names.

## Prioritized feasible follow-up

1. **P0: build an evaluation contract before enabling capacity forecasts.** Freeze dated athlete inputs and forecast timestamps; prohibit post-race or future-training leakage. Use rolling-origin holdouts and athlete-level holdouts where learning across users. Compare selected-target arithmetic, recent-comparable-performance baseline, generic distance scaling in a narrow supported domain, and candidate individualized methods. Report sample sizes, missing-data exclusions, MAE/median absolute percentage error, signed bias, tail errors and interval coverage by sport, distance, terrain and condition. Include DNFs/invalid targets as explicit outcomes rather than silently selecting successes. Predefine acceptable errors with domain reviewers; do not invent an accuracy threshold from a vendor claim.
2. **P1: improve execution planning without changing prediction claims.** Add target-conserving kilometer/mile/aid-station split allocation, explicit stops, elapsed versus moving time, and per-leg feeding opportunities. Preserve JMM's no-automatic-downhill-credit and input provenance. Tests should cover boundary-crossing segments, route gaps, empty/malformed course, positive/negative splits and total conservation. RacePacer's MIT allocation structure and GPX Pacer's interface concepts are useful comparisons.
3. **P1: make calibration inspectable.** Show comparable actual efforts, recency and device/protocol, duration support and residuals; distinguish measured from default CdA/Crr. Prototype empirical grade-bin or power-duration fitting behind disabled forecast output. Validate temporal generalization before exposing a personalized finishing time. Never infer unlimited endurance or W′ from FTP alone.
4. **P2: route/time weather mechanics.** Independently implement wind-FROM projection onto verified segment headings, sample forecast time along modeled progress, preserve provider coverage and uncertainty, and test speed/time iteration and tailwind signs. Crosswind/yaw, shelter and local exposure need separate assumptions/validation. Avoid temperature-to-capacity coefficients merely to match competitor breadth.
5. **P2: safe pacing feasibility/optimization.** Only after calibrated duration capacity, bounded W′/recovery behavior and course mechanics: evaluate optimization against constant/selected-power baselines. Treat corners and descents as explicit constraints, not promises of a safe maximum. Triathlon needs bike-to-run carryover and comparable brick evidence, not independent-leg PB sums.
6. **P2: close the real-race loop.** Compare saved pre-race scenarios with consented actual splits and executed power/pace; separate parameter/input error, execution deviation and model error. Keep user-selected sensitivity ranges until genuine out-of-sample interval calibration exists. Finish authenticated visual QA and provider operational gates separately.

## Bottom line

The comparison supports confidence in JMM's honest planning boundaries and identifies concrete improvements. It does **not** support saying that all projects were reviewed, that JMM matches mature proprietary systems, or that its race predictions are accurate. The most consequential missing asset is a leakage-resistant, representative real-race validation dataset and protocol, not another unverified formula.
