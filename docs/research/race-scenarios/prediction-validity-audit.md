# JMM prediction-validity audit

Audit date: 8 October 2026. Inspected checkout: `bedd0927060701ef9708294e6e2e869c76d5f9be`, PR #35. The PR was reported merged as `a9711731f3a2b800ec43d455864a15e156a838bd`; this audit did not independently inspect that merge tree or a deployed app. No repository edits, athlete-data transmissions, new tests, retrospective evaluation, or live-app validation were performed. This file is a review deliverable only.

## Bottom line

**The implemented feature is an explicit-target scenario calculator. It is not yet a validated race-day performance predictor.** Confidence in its transparent arithmetic is qualitatively stronger than confidence in any resulting athlete finish time. There is no honest numerical accuracy percentage to give. A test suite can show the equations were implemented consistently; it cannot establish that a person can sustain the entered effort or that their finish will fall within the selected range.

The legacy personalized forecast service remains disabled before athlete-data reads or forecast generation: [`forecast-availability.ts`, lines 1–9](https://github.com/Pablodd1/Jasmethod/blob/bedd0927060701ef9708294e6e2e869c76d5f9be/src/lib/forecast-availability.ts#L1-L9), [`race-forecast-service.ts`, lines 52–61](https://github.com/Pablodd1/Jasmethod/blob/bedd0927060701ef9708294e6e2e869c76d5f9be/src/lib/race-forecast-service.ts#L52-L61). Do not describe legacy heat/altitude/FTP heuristics as active capabilities of the new scenario feature.

## What actually changes a scenario

All references below are to the inspected commit.

| Input | Actual numerical consequence | What it does not establish |
|---|---|---|
| Selected running pace | Distance × selected flat-equivalent pace, modified by nonlinear grade cost, explicit time multiplier and speed caps | Sustainable race pace, running economy, fatigue, wind response |
| Run course grade and distance | Segment times change; automatic grade mapping stops beyond ±15%; downhill gets no extra speed unless an explicit cap is supplied | Technical-trail speed or safe descending ability |
| Selected cycling crank watts | Solves steady segment speed against entered mass, CdA, Crr, density, drivetrain efficiency, grade and axial wind; speed caps can reduce modeled power | Whether those watts are sustainable at this duration |
| Cycling segment headwind | Directly changes axial drag; may be negative for tailwind | Full direction-aware wind along a route, yaw effects, gusts, shelter, drafting |
| Entered air density | Changes bike drag | Automatic physiological altitude/heat response |
| Swim target pace and multiplier | Distance × selected pace × selected multiplier | Open-water current, navigation, wetsuit or fatigue effects |
| Transitions | Add to total duration | Actual transition skill or congestion |
| Baseline/reference value | Does not enter the timing equation; presence, sport/metric and recency gate calculation | A fitted athlete-capacity model |
| HR band and running watts | Copied as reference outputs if separately confirmed evidence is recent; run watts also require a device string | Predicted HR, physiological response, or power-derived running pace |
| Weather temperature, humidity and general wind | Stored/displayed; forecast validity can generate warnings | Automatic time, HR, power or air-density changes |
| Practiced carbohydrate rate | Rate × modeled bike/run time, evidence-gated | Required carbohydrate, absorption, performance improvement, safe tolerance on race day |
| Sensitivity percentage | Symmetric multiplication of total scenario time | Confidence interval, probability, asymmetric risk or calibrated uncertainty |

Equation/gating source: [`race-scenario.ts`, lines 170–259](https://github.com/Pablodd1/Jasmethod/blob/bedd0927060701ef9708294e6e2e869c76d5f9be/src/lib/race-scenario.ts#L170-L259). The code calls itself a scenario and explicitly warns sustainability is unestablished. The field named `actualAveragePowerW` is modeled required mechanical power, not telemetry; the UI correctly labels it “modeled average.”

Weather application copies only the selected weather sample to context fields. It does not populate each course segment's headwind: [`race-scenario-workspace.tsx`, lines 85–90](https://github.com/Pablodd1/Jasmethod/blob/bedd0927060701ef9708294e6e2e869c76d5f9be/src/components/race-scenario-workspace.tsx#L85-L90). Imported routes receive a single user-entered axial wind and speed cap: [`race-course.ts`, lines 106–128](https://github.com/Pablodd1/Jasmethod/blob/bedd0927060701ef9708294e6e2e869c76d5f9be/src/lib/race-course.ts#L106-L128). Applying a hot, humid or windy forecast therefore need not change the finish time at all.

## Measured, reported and assumed capacity

Saved completed 5 km tests become average pace, FTP records remain FTP, and swimming records remain threshold/CSS references. The code explicitly identifies them as reported, not independently verified. Undated profile thresholds, unsported CP and LTHR are unusable for automatic targets. See [`race-scenario-evidence.ts`, lines 7–20](https://github.com/Pablodd1/Jasmethod/blob/bedd0927060701ef9708294e6e2e869c76d5f9be/src/lib/race-scenario-evidence.ts#L7-L20).

This is good provenance hygiene, but no duration-power curve, CP/W′ fitting, individual running-distance scaling, fatigue/brick response, heat acclimation, training adaptation or injury/readiness model is fitted here. A current 5 km reference alongside a marathon target does not validate marathon capacity. Body mass in bicycle mechanics is a force parameter, not a fitness estimate. Bike CdA/Crr and metabolic efficiency are explicitly entered assumptions unless independently measured elsewhere.

### Event date and effort-duration mismatch

- The baseline schema has value/date/sport/metric/context/protocol but no structured tested duration, distance, maximal-effort status or fresh-versus-brick state (`race-scenario.ts` 7–10, 124–130). Comparable-duration applicability cannot be enforced from these fields.
- The 90-day check is relative to calculation time, not race day (`race-scenario.ts` 181–190). It is a review policy, not evidence that capacity persists for 90 days.
- A past race can be paired with evidence collected after that race but before today. This is valid scenario construction, but would contaminate retrospective prediction evaluation. A future event does not project fitness improvement or decline.
- Forecast coverage is checked through calculated finish (`race-scenario.ts` 252–255), but uncovered duration generates a warning rather than invalidating scenario arithmetic. The model retains a selected start-time sample, not time-varying race-window physiology.
- Date/offset consistency and weather request location/time are checked (`race-scenario-request.ts` 10–14). Those are provenance checks, not proof of race-day predictive relevance.

## Qualitative confidence matrix

| Claim | Confidence supported now | Remaining evidence |
|---|---|---|
| Inputs transparently drive deterministic planning arithmetic | Relatively strong from code inspection; prior test results are separate evidence | Independent formula fixtures and full execution evidence, if not already audited |
| Bike speed under known steady solo conditions | Mechanistically plausible; conditional | Measured CdA/Crr/wind, field segment residuals and independent rides |
| Running grade-to-time mapping | Limited, exploratory | Matched field trials; the treadmill metabolic-cost fit is not a validated race-time mapping |
| Target watts/pace can be maintained throughout this race | Not established | Comparable-duration actuals, fatigue/brick evidence and held-out races |
| Weather-adjusted athlete performance | Not implemented automatically | Individual or externally validated response model and weather-error evaluation |
| HR or running watts on race day | No predictive claim supported | Synchronized, same-device, same-sport evidence under matched conditions |
| Exact finish time or selected range coverage | Unvalidated | Pre-race frozen predictions and independent ground truth; empirical coverage |
| Triathlon finish | Arithmetic composition only | Leg-specific capacity and post-bike running validation, transitions and execution |
| Research is exhaustive | Not established | Reproducible search protocol, inclusion/exclusion log and ongoing review |

The research scope is explicitly a bounded review, not a systematic review. Targeted checks of foundational papers support mechanisms and limitations, not JMM-specific accuracy. App completeness, production behavior and scientific validity are different questions.

## Falsifiable validation plan

### 1. Freeze scope and collect ground truth

Begin with separate cohorts: nontechnical road running and solo cycling time trials. Do not pool swimming, technical trail, triathlon or road-pack racing into one accuracy claim. Pre-register the eligible population, horizon, output and unacceptable error before examining held-out outcomes.

For each consented athlete/race, retain a pseudonymous athlete ID, official event edition/distance, elapsed finish and splits (distinguish chip/gun and moving time), pre-race timestamped evidence, device/source, course quality, intended and realized execution, and weather source/issue/valid times. Record DNF/DNS, route changes, stops and sensor gaps explicitly; do not remove difficult outcomes merely because they worsen accuracy. Exclusions must be specified in advance and reported with counts.

Scenario snapshots already preserve model/input/output revisions, but the scenario state does not select actual `resultMin` or calculate residuals; storage alone is not validation (`race-scenario-store.ts` 8–21; `api/race-scenarios/route.ts` 16–23). Build an evaluation export/join in a separately authorized task; do not relabel after-the-fact user-entered targets as forecasts.

### 2. Retrospective evaluation without leakage

Replay only records available before a fixed pre-race cutoff. Use a historical `asOf` for evidence freshness, and exclude post-race baselines or targets. If original pre-race targets/forecast vintages are absent, report that limitation rather than reconstructing them from results.

Keep two experiments distinct:
1. **Mechanics diagnostic:** predict segment time with measured realized power/weather. This isolates course/mechanics error but is not pre-race prediction.
2. **Prospective-information replay:** use only the target and weather information actually available at the cutoff. This measures useful race-planning performance and includes execution/weather error.

Fit athlete-specific parameters only on earlier training/races. Hold out entire athletes for population-generalization testing, and later races for returning-athlete testing. Keep a final chronological holdout untouched after model/threshold selection. Cluster uncertainty estimates by athlete and event; repeated splits from one race are not independent participants.

### 3. Comparators, outcomes and failure criteria

Compare against frozen simple baselines: selected flat pace × distance; nearest comparable prior race; and, only in appropriate running distance strata, a transparently specified generic distance-scaling formula. Compare cycling against a flat/no-wind mechanics baseline and previous comparable TT. Compare course and condition components by ablation.

Report sample counts, missing-data/abstention rates, signed error, absolute error in minutes, median absolute relative error, upper-tail error, segment drift and errors by sport, distance/duration, grade, heat, wind, forecast lead time, ability and prior-evidence quality. Show all-stratum results even when unfavorable. A component adds predictive value only if its preregistered held-out comparison improves the selected metric without an unacceptable tail/stratum degradation.

If probabilistic intervals are later introduced, evaluate nominal-versus-empirical coverage, interval width and calibration by stratum. A selected ±percentage range is not eligible to be called calibrated. Set a practical minimum improvement and acceptable error/coverage bounds with the product owner and qualified coaching reviewer before unblinding; choose sample size from desired precision and independent-event variability, not an invented universal race count.

### 4. Prospective confirmation and release decision

Freeze the chosen model version and timestamp predictions before subsequent races. Do not edit the frozen record after seeing results. Separate target adherence from model error and investigate mismatches. Publish the evaluation protocol, cohort limits, residual summaries and abstentions. Continue labeling outputs scenarios unless independent prospective outcomes meet the preregistered criteria. Any recalibration starts a new version and requires a new untouched evaluation period.

## Primary evidence and accessible data

These sources were checked on the audit date. No athlete records were uploaded or sent to any provider.

- [Vickers & Vertosick, 2016](https://link.springer.com/article/10.1186/s13102-016-0052-y): recreational-running prediction study with a training/validation split; generic scaling was substantially optimistic for marathon performance. Useful baseline design and failure-mode evidence. The article states supporting data are in the article/additional files; CC BY 4.0 article and CC0 data unless otherwise stated. Supplementary raw-data completeness and practical reuse were not independently downloaded/verified here.
- [Martin et al., 1998, institutional paper copy](https://collections.lib.utah.edu/dl_files/b4/8e/b48ef26086091662c561e673d7bd990d77868437.pdf): controlled road-cycling mechanical power validation. Supports physical modeling, not sustainable power or generic finish-time accuracy. No open raw dataset or code-reuse license was established here; link and summarize, do not copy figures/code.
- [Minetti et al., 2002](https://doi.org/10.1152/japplphysiol.01177.2001): treadmill running/walking metabolic cost over slopes; field downhill speed also faces safety constraints. Supports the grade-cost basis, not this engine's fixed-effort field-time adaptation. Publisher copyright applies; no reusable raw field-validation dataset was established.
- [Imbach et al., 2020](https://pubmed.ncbi.nlm.nih.gov/32698464/): six-runner submaximal device study found strong associations alongside absolute-power underestimation. Supports preserving device provenance; no license to treat running watts as interchangeable with cycling watts.
- [Emig & Peltonen, 2020](https://www.nature.com/articles/s41467-020-18737-6): large real-world running/model study. The Polar data are explicitly restricted and require permission; do not call this an openly downloadable validation cohort. Linked research code availability does not grant access to the athlete dataset.
- [PhysioNet treadmill maximal-exercise dataset v1.0.1](https://physionet.org/content/treadmill-exercise-cardioresp/1.0.1/): publicly listed files from 992 tests/857 participants, with cardiorespiratory and treadmill measurements. Useful for measurement/threshold-method development, not race finish validation. Current page specifies a Contributor Review Health Data License and Data Use Agreement, not unrestricted reuse. Includes minors; review conditions and use an appropriate adult-only research subset if justified. No files were downloaded or agreement accepted.
- [Trinity graded-incremental dataset](https://zenodo.org/records/6325735): anonymized cycling/running/rowing/kayaking test data, useful for physiological-method checks rather than outdoor race results. The retrieved page did not resolve a concrete license label; reuse remains pending license verification.
- [NASA POWER methodology](https://power.larc.nasa.gov/docs/methodology/): official historical environmental-data reference. Can provide course-location environmental context, not athlete outcomes or local course truth. Provider attribution/terms must be retained. Daily historical values must not masquerade as observed start-hour conditions or archived forecasts.

For end-to-end JMM validity, consented paired pre-race inputs and official post-race outcomes are more directly relevant than unrelated lab datasets. Public result pages are not blanket permission to scrape, republish or link identifiable medical/training data. Keep evaluation local/access-controlled and pseudonymized. Weather requests should contain public event location/time only; the current adapter rejects athlete fields (`race-weather.ts` 1–49). No athlete transmission is needed to review papers or develop a protocol.

## Safe immediate corrections to consider, not applied

1. Prominently state: “Reference only; selected effort has not been checked for this race duration or race date.” Add structured tested duration/distance and fresh/brick applicability before offering capacity inference.
2. Make “weather wind, context only” distinct from “entered axial wind used by the bike model.” Avoid any implication that applying forecast wind updates course mechanics.
3. Prefer “modeled required power” in exported schemas over `actualPowerW`; preserve backward compatibility if renamed. Keep HR/run watts explicitly user-entered observed references.
4. Round endurance finish scenarios to minutes and pace to useful planning precision, while retaining exact arithmetic internally. Current UI formats seconds (`race-scenario-workspace.tsx` 25–26, 176–179), which exceeds the evidence resolution.
5. Explicitly gate or warn for unsupported sprint/ultra/event contexts. Generic run input currently permits 1 m–1,000 km (`race-scenario.ts` 137, 161–166); choosing `run_road` does not establish endurance-domain applicability.
6. Build evaluation eligibility separately: pre-race evidence cutoff, unchanged saved prediction version, comparable-duration metadata and actual-result join. Do not turn scenario snapshots into apparent validation retrospectively.

None of these changes creates empirical accuracy. The decisive next step is a preregistered, leakage-free evaluation with held-out and then prospective races.
