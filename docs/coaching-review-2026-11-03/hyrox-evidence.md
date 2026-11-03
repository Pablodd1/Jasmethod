# HYROX evidence, channel review and JMM capability audit

Reviewed November 3, 2026. Scope: read-only research/source audit plus focused synthetic tests. No real athlete history, account credentials or health data was sent to research sites. No account, subscription or paid plan was created. This is a focused needs analysis, not a systematic review or an individualized prescription.

## Findings that matter first

1. JMM already has useful HYROX building blocks: a four-division station reference, timed run/station structure, periodized weekly allocation, two supporting strength opportunities, explicit source/date handling, and private split-result persistence. Preserve these.
2. The executable coaching recipe remains introductory: `coaching-prescription.ts:97–112` alternates squat/lunge preparation. It does not consume the eight-station registry or equipment/division/tolerance information. Calling that a complete race-specific program would overstate capability.
3. The optional compromised-density builder names a 240-second block as 1 km running or 1000 m on an erg without a corresponding athlete anchor. The endpoint is time, so the label invents a distance/pace relationship. Root assigned a narrowly scoped label fix after this audit; doses and thresholds must remain unchanged.
4. The dormant `compromisedRunSession(legsLoaded:true)` wrapper swaps running to an erg but retains lower-body station work. Its protection wording does not establish protection from burpees, lunges, sleds or wall balls. Current grep finds this wrapper called only by tests, not an established live athlete route. It is an enablement blocker, not evidence of a live injury event.
5. Non-power energy code returns MET-estimated kcal unchanged as `kj` and appends a kJ label. The code calls this work-equivalent energy; it is not measured mechanical work or metabolic kJ. Keep the current calculation isolated pending an explicit units review; a standard kJ label must not imply a measurement or a 1:1 physical conversion.

## Instagram: actual coverage and limits

The supplied link is the `hyrox.engine` profile, not one specified post. Direct web fetch was throttled today. I did not claim to inspect the full archive or watch every video. Root owns shared browsers; this subtask did not use them.

The existing local report `.local/hyrox-research-2026-11-02/review.md` documents 11 unique public reel captions exposed on November 2, not a proven full-channel archive. It covers SkiErg technique/drag, sled pull, knee-assisted burpee exits, penalties, four-minute aerobic intervals, wall-ball geometry, and rowing cadence/sequence. I inspected that report and independently checked the principal manufacturer/science/rule sources. That is inherited caption evidence, not a fresh video biomechanics assessment.

Root's browser audit subsequently unlocked the public grid and reports 12 currently exposed reel links, including `DfQY04ePm7X` and `DfQVMvPP_gY`. Root is inspecting those captions and archive pagination separately; this subtask does not turn that intermediate count into a full-channel claim.

Reusable ideas are concise station technique cards, output-versus-cost comparisons, valid-rep awareness, and reviewing the run after a station. Do not import social-media claims of universal damper settings, exact time savings, anatomical power percentages, height-derived training dose or guaranteed injury prevention. Social posts should be candidate references, not automatically trusted training/RAG content. Do not bulk-copy captions, videos or paid plans.

## Official rules are now verifiable

Yesterday's report could not verify the current seasonal PDF. Today this official regional HYROX URL opens as a 46-page 2026/27 Singles rulebook:

[HYROX 2026/27 Singles rulebook](https://hyrox.mx/wp-content/uploads/2026/07/26_27_HYROX_RulebookSingles_EN_240626.pdf).

The registry in `science.ts:828–840` matches the checked Singles division loads and target heights. Each station follows a 1 km run. Sled push/pull weights include the sled; carries require clearly distinguishing mass per hand. Women Pro shares listed loads with Men Open, but the wall-ball target is 2.70 m for Women Pro and 3.00 m for Men Open. Ergs start at damper 6, adjustable by the racer. The rulebook permits a knee-assisted burpee exit; broad-jump takeoff/landing requirements still apply. These are competition references, not automatic training loads. Singles rules must not be silently applied to Doubles, Relay or Adaptive formats.

Useful page references: divisions page 8; SkiErg page 26; sleds pages 27–28; burpees pages 29–30; rowing page 30; wall balls pages 34–36. Main `hyrox.com/rulebook/` returned 403 during this subtask; the regional official PDF succeeded.

## Science: relevant findings and limits

| Source | Useful inference | Boundary |
| --- | --- | --- |
| [Brandt et al. 2025](https://pmc.ncbi.nlm.nih.gov/articles/PMC11994925/), DOI 10.3389/fphys.2025.1519240 | Eleven recreational competitors in a simulation: running occupied more time than stations, and aerobic capacity/endurance volume correlated with completion time. Build running durability alongside station capacity. | Small observational simulation; no causal optimal weekly dose, injury threshold or body-composition target. |
| [HYScience 2026](https://pubmed.ncbi.nlm.nih.gov/42697540/), DOI 10.1123/ijspp.2026-0098 | Study of running intensity/pacing in an official PRO MEN competition; useful context for studying pacing deterioration. | Male PRO evidence cannot define a woman's or novice's numerical pace. PubMed opened inconsistently today; do not add unverified numerical estimates. |
| [Schwalm et al. 2026](https://link.springer.com/article/10.1007/s12662-026-01162-0) | Single-champion simulation indicates that station work can change subsequent running physiology/biomechanics. Review fresh and station-following running separately. | One athlete, four tested stations, descriptive case; no universal cadence or ideal session dose. |
| [Paavolainen et al. 1999](https://pubmed.ncbi.nlm.nih.gov/10233114/), DOI 10.1152/jappl.1999.86.5.1527 | Small controlled endurance-athlete intervention supports replacing some endurance volume with explosive work to improve running economy/performance. | Not HYROX, not a reason to assign unreviewed jumps or copy its replacement percentage. |
| [Schumann et al. 2022](https://pubmed.ncbi.nlm.nih.gov/34757594/), DOI 10.1007/s40279-021-01587-7 | Concurrent strength/endurance development is feasible; explosive-strength adaptation can be attenuated when modalities compete in a session. | Synthesis of other sports; it does not establish an exact universal HYROX rest interval or two heavy sessions for every athlete. |
| [Monitoring consensus](https://pubmed.ncbi.nlm.nih.gov/28463642/) | Integrate internal/external load, subjective response and contextual information. | No single score proves readiness or guarantees injury prevention. |
| [Nutrition position statement](https://pubmed.ncbi.nlm.nih.gov/26920240/) | Individualize intake to training demand, tolerance and recovery needs. | Broad sports consensus, not a HYROX trial validating a new universal carbohydrate, sodium or supplement dose. |
| [Concept2 SkiErg guidance](https://www.concept2.com/skierg-start) | Coordinated core/hip/arm technique; damper changes feel and should be individualized. | Manufacturer guidance, not proof that one setting minimizes race time or subsequent running cost. |

Performance goal: a meaningful recoverable stimulus based on demonstrated capacity, not exhaustion as a goal. Increasing aerobic quality, strength or plyometrics is a coach-reviewed progression decision. Preserve the exact population/protocol/source date so a case report cannot become a universal training rule.

## What to reuse in JMM

### 1. A station capability record, rather than more generic questions

Reuse profile, availability, recent actual work and equipment first. Ask only for the missing fact that changes the next session. Store: station ID; equipment present; familiar movement/skill; measured or separately athlete-reported load; repetitions/distance; time; breaks/no-reps; effort/symptoms; date; source; review status. Division must remain unknown until chosen. Surface/traction matters for sled comparisons.

Ski/row use time, distance, pace per 500 m and power when measured. Sleds use load, whether total includes sled, distance and surface. Carries distinguish each-hand load from total. Wall balls separate ball mass, target height and valid repetitions. Running uses km/h or mph, min/km or min/mi, distance and clock-formatted time. Raw seconds can remain internal; athletes should not have to convert values.

### 2. A complete weekly architecture with explicit purpose

Preserve the current weekly allocation: easy running, selected run quality, station skill, strength A/B, and a station/run combination, plus recovery/taper. Provide complete station recipes after equipment, skill and tolerated-load review. Generic squat/lunge preparation remains a labeled fallback, not a completed HYROX program. Station fatigue and lower-body strength count in the same demand-spacing decision as hard running and plyometrics.

Progress one supported dimension at a time: repeat count, tolerated load, running pace/output, work time, recovery or combination density. Compare actual execution and subsequent response before progression. Do not prescribe an entire race simulation simply because a race was selected or a wearable score is high.

### 3. A chat workflow that changes the product, not just its prose

Example: athlete says “I have a rower but no sled today.” JMM reads equipment/source information locally, shows a reviewed substitution proposal and its retained purpose, and clearly states whether it is proposed or saved. A station-result request opens an inline clock/load/repetition card. The card saves only after a validated successful backend receipt; a failure retains the draft. Completion must not create extra capacity automatically. Protected device-derived results stay in direct-rendered cards and out of external model memory.

### 4. Fuel and recovery share one canonical calculation

Today, plan, chat cards and export should render the same pre/during/post fueling calculation for the effective prescribed session. Actual intake/tolerance and optional pre/post weight are separate observations. Unknown drink/urine/intake data cannot produce a measured sweat-rate claim. Do not equate cycling mechanical kJ with HYROX metabolic estimates or infer a supplement dose from an Instagram post.

## Existing implementation map

| File/surface | Keep | Gap |
| --- | --- | --- |
| `science.ts:828–840` | Eight-station/four-division reference and official URL | Reference does not drive a full station prescription. Some focus prose makes unverified general claims, e.g. burpees always causing the largest HR spike; the small direct study instead found highest values at wall balls. |
| `coaching-week-template.ts:60–65` | Run/technique/strength/hybrid week roles and bounded budgets | Station/equipment/tolerance information not consumed. |
| `coaching-prescription.ts:97–112` | Complete timed introduction, honest preparatory label | Squat/lunge-only output is not a complete eight-station program. |
| `sport-structure.ts` | Typed run/station/rest, explicit endpoints and optional load | No first-class format/season/division or per-hand versus total load semantics. |
| `hyrox.ts` | Exact scenario accounting, missing splits stay missing, no fabricated sex coefficients | Fixed station weights/96-second transition allowance remain illustrative, not an athlete prediction. |
| `hyrox-results.ts` and `/api/hyrox/results` | Owner-only private reports, dated partial results, stale revision conflict, no implied verified results | Results are audit snapshots; saving does not currently adapt the training cycle. |
| `workout-energy.ts` | Method/availability handling | Work-equivalent labels need a unit audit before using them as physiological energy. |

## Concrete acceptance tests

1. Sport HYROX with incomplete details immediately yields a clearly provisional usable plan view, not a blank page or invented division/equipment.
2. Reviewed equipment/division yields the selected actual station; missing equipment yields a labeled alternative with the original purpose and no claim of an official simulation.
3. Women Pro/Men Open loads may match while wall-ball target height remains distinct; unknown season/format never defaults silently.
4. A timed four-minute run/erg effort has a time endpoint and no invented 1 km/1000 m label. Changing the label must not change dose, thresholds or flags.
5. A “legs protected” substitution must not retain unreviewed high-impact/eccentric station work. Until the policy is reviewed, the dormant wrapper cannot be enabled by marketing or a chat request.
6. Every generated session includes warm-up, complete station/run/rest bouts and cooldown inside both daily and weekly availability; no bonus rounds or compressed maximal effort.
7. Repeated results distinguish prescribed versus actual dose; partial splits do not create a finish time, capacity increase or confirmed rest.
8. A known 500 m/1000 m erg performance can inform an explicitly reviewed target; an unmeasured damper/cadence choice cannot become a power or time-saving estimate.
9. Changing division, equipment, result revision or baseline after preview invalidates a stale confirmation. Cross-athlete reads/writes fail before personal data is fetched.
10. Chat claims “Saved” only from the real result/plan receipt; failures retain the draft and duplicate requests do not create duplicate records.
11. Pre/during/post fueling agrees across all views, including units. Estimates and mechanical work cannot share an ambiguous measured-kJ label.
12. Device/imported data and derivatives stay out of external AI, Telegram and legacy memory even when athlete-facing cards are displayed. No silent provider fallback.

## Tests executed in this subtask

`node --import tsx --test src/lib/hyrox.test.ts src/lib/hyrox-route.test.ts src/lib/hyrox-results.test.ts src/lib/hyrox-results-route.test.ts src/lib/hyrox-page.test.ts src/lib/coaching-prescription.test.ts src/lib/coaching-week-template.test.ts`

Result: **27/27 pass**, synthetic/in-process. Log: `hyrox-tests.log` in this directory. These checks cover scenario math, private result persistence, input validation and current recipe contracts. They do not demonstrate a complete eight-station advanced plan, a live provider connection, equipment telemetry, a real athlete's adaptation or injury prevention. Passing tests cannot resolve the missing capability by themselves.

## Narrow correction assigned after the audit

Updated only the compromised-density run/erg labels and the first-round explanatory note in `performance-engine.ts`; matching tests added in `performance-engine.test.ts`. A fixed four-minute effort now says four minutes rather than inventing 1 km/1000 m. All time endpoints, zones, repeats, station doses, total duration, thresholds and flags are unchanged. The lower-body station-substitution policy remains a documented enablement blocker; this correction does not activate the wrapper.

Focused performance-engine suite: **20/20 pass**. It verifies three time-defined 240-second efforts at the tested 50-minute budget, unchanged 3000-second session total, matching run/erg dose/endpoints and no assumed distance or race pace in the effort names. Log: `hyrox-label-tests.log`. Targeted ESLint and `tsc --noEmit` passed. No commit or deployment was made by this subtask. Root separately owns the energy-units correction.
