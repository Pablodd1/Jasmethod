# JMM coaching structure: implementation contract

Date: November 1, 2026. Status: implementation contract with a reproduced pre-change generator audit. Runtime `coaching-structure-v1` implements the allocation, complete-unit scheduling, reviewed optional pairs, relative-target prescriptions, ordered bike/run bricks and explicit introductory support described below. Deployment and acceptance evidence must be checked separately; this document does not certify a live release or an approved athlete prescription.

Implemented scope: swim/bike/run/triathlon/HYROX allocation within reported capacity, two supporting strength opportunities when feasible, explicit omitted components, short introductory alternatives, recovery/event shaping, dated target resolution, exact custom triathlon legs, saved recipe persistence and daily reduction. Existing completed history is retained and replacement requires preview confirmation. Advanced loaded strength/plyometric eligibility and full eight-station HYROX division/equipment prescriptions remain incomplete; current unloaded work is preparatory. The broader fueling, knowledge and progression requirements below are a contract, not a claim that every requirement is implemented by this change. Provider permissions are unchanged.

Revision: v2, enriched training, strength/power, preparation, fueling and recovery contract. Knowledge review date: November 1, 2026. Numerical examples below are adult educational references or explicitly labelled JMM programming examples, not personalized orders or promises of adaptation.

## Outcome

An athlete selects a sport and receives a coherent, executable program even without a race, device or measured threshold. Goals, recent tolerated training, restrictions, availability and verified event demands personalize the program. Results and response inform subsequent decisions. Missing data remain unknown. The program must work without an external model.

The coaching objective is recoverable training stress and adaptation over time. JMM must not claim to know an athlete's physiological functional limit, maximal recoverable volume, injury probability or future improvement from a score. Do not maximize every session or use absence of reported symptoms as proof of readiness.

## Reproduced pre-change implementation gaps

Audit executed against the existing source using synthetic advanced athletes, eight available weekly hours, four weeks starting November 2, 2026, and reviewedCycle=true. Counts below describe raw generator output before availability, recovery, event and execution guards; they do not describe completed training or live athletes.

| Generator | Observed raw structure | Consequence |
| --- | --- | --- |
| Triathlon, half-distance | Six endurance bouts; zero strength and zero bricks in all four weeks | The reviewed branch returns before legacy strength/brick construction. Presence of swim/bike/run is not a complete triathlon program. |
| Swimming only | Three swims, one strength, one mobility session weekly | Two strength exposures are not represented by the current template; dose needs deliberate allocation, not appended minutes. |
| Cycling only | Three rides, one strength, one mobility session weekly | Same supporting-strength allocation gap. |
| Running only | Three runs, one strength, one mobility session weekly | Same allocation gap; additional quality appears from week three and must be assessed together with lifting. |
| HYROX | Three runs and three strength-labelled bouts; hybrid session appears in weeks three/four | Labels alone cannot establish distinct station skills, lifting dose or recoverable hybrid work. Review the final bounded schedule, not only raw counts. |

Source trace:
- `src/lib/science.ts`: reviewed triathlon dispatch, single-sport/HYROX generation.
- `src/lib/triathlon-template.ts`: six-bout allocation, no supporting strength or ordered brick.
- `src/lib/planning-bounds.ts`: one primary session per day; collision removal; optional pairs mostly move existing easy endurance work. It cannot simply retain an appended two-session strength program.
- `src/app/api/plan/generate/route.ts`: generation -> bounding -> event/recovery shaping -> prescription and target projection -> coverage assessment.
- `src/lib/cycle-sport-coverage.ts`: presence checks, not sufficient frequency, complete components or an individually appropriate dose.
- `src/lib/reviewed-cycle-samples.ts`: useful examples explicitly excluded from production generation. Examples are not proof the production calendar uses that structure.

## Coaching policy

1. Start from observed/reported tolerated work and available time, not the race distance or experience label alone. Planned minutes are not completed minutes. Use a distinct conservative introductory pathway when history is absent.
2. Use one clear development objective per block. Select a small number of appropriate quality exposures across all sports; count demanding lifting, station work and long sessions when arranging recovery. Do not add every research protocol to one week.
3. Two supporting strength exposures per week are a JMM development default where appropriate and feasible, not a universal scientific requirement. Reduce, combine, regress or omit with an explicit reason for introduction, time constraints, restrictions, competition/taper or poor tolerance. Never silently delete them or add them outside the budget.
4. Plyometrics are a separately eligible component. Experience, familiar movements, surface/equipment, landing control and current tolerance matter. Specify contacts/repetitions, recoveries and progression when eligible; otherwise provide controlled non-jumping practice. Do not equate a strength slot with permission for jumps.
5. Preserve explicit rest and recovery. An experience label may propose a schedule, but no-fixed-rest must not imply compulsory seven-day training. Do not require professional athletes to train through fatigue or symptoms.
6. Polarized and pyramidal distributions are context-dependent options. Do not force hard minutes or convert recovery into quality to satisfy an arbitrary percentage. Report intended work/recovery distribution from actual steps; do not treat session-zone labels as measured physiological time in zone.
7. Progress one dimension at a time after demonstrated tolerance: frequency, duration, work repetitions, target intensity or strength load. No compulsory weekly percentage increase and no automatic catch-up.
8. Event preparation and recovery apply once. Keep normal progression, event taper, test preparation and post-event recovery distinct; do not multiply reductions without review or auto-assign maximal tests.

## Sport-specific structure

| Sport | Development components | Supporting strength emphasis | Race/venue considerations |
| --- | --- | --- | --- |
| Swim | Technique, repeatable aerobic sets, longer sustained swimming, eligible threshold/quality sets | Appropriate pulling/pushing, shoulder/scapular control and trunk/whole-body support; exercise selection based on experience | Pool length/stroke, exact swim distance, open-water skills, verified water conditions and safe supervision |
| Bike | Easy endurance, longer endurance, selected tempo/threshold/VO2/short-interval or over-under work, pacing/fueling | Squat/hinge/unilateral patterns and trunk support, as appropriate | Distance, climbing/descending, surface, turns, equipment and position; watts do not imply a speed |
| Run | Easy frequency, longer easy running, selected threshold/interval/hill or short-speed work | Appropriate lower-body and calf/soleus capacity, trunk; eligible plyometric progression | Distance, surface, elevation and turns; preserve device-specific running-power references |
| Triathlon | Separate swim/bike/run exposures, deliberate combined bike-run practice, T1/T2, race rehearsal | Two appropriately integrated supporting exposures when feasible; do not multiply strength independently for each leg | Custom distances per leg, ordered components/transitions, equipment, course and fueling |
| HYROX | Running endurance/quality, station technique, strength, controlled run-station practice and pacing | Strength and station work overlap: count the actual movement dose, not two extra gym sessions on top of all stations | Exact current division/rulebook, station distances/reps/loads and movement standards; venue-specific Roxzone/lap details only when verified |

Each component must have an assigned purpose. A short ride cannot be labelled the athlete's principal long-endurance session merely because the template calls it long. A brick must contain independently validated legs and transition instructions. A generic strength duration must not pretend to establish executable sets/reps/load.

## Knowledge, athlete records and executable contracts

Reuse existing protocol/evidence registries, canonical prescriptions, current-anchor projection, result logging and ownership protections. Do not introduce a second source of truth.

- Evidence registry: source, population, intervention, finding, applicability, limitation, review date and version. Separate trial-derived work/rest from JMM programming choices.
- Protocol: adaptation objective, eligible sport/phase/experience, prerequisites, complete ordered steps, endpoints, effort/target method, work/recovery, minimum viable budget, progression/regression, stop/review conditions and evidence IDs.
- Athlete references: sport, metric, unit, value, test method/date, actual source, measurement/estimate classification, coach approval and any unresolved conflicts. Peak CPET workload is not FTP; observed peak HR is not automatically maximum HR.
- Cycle: objective, event anchor or general-development status, block phases, planned review points, weekly sport/strength/recovery allocation and reasons for deviations.
- Daily session: immutable planned revision, current effective prescription, source evidence and change reason. Proposed, saved, exported, provider-accepted and device-received remain distinct states.
- Results: actual sport/duration/distance, interval execution, HR/power where present, effort, symptoms, notes and optional pre/post weight. Preserve corrections, ancestry and duplicate reconciliation.
- RAG: only approved explanatory knowledge and permitted context. Numerical prescription remains owned by reviewed calculations and validated tools. No athlete fine-tuning, shared athlete knowledge base or restricted-provider data in external context by default.

## Daily decision loop

1. Match actual results to the prescription without replacing actual values with planned ones. Resolve duplicates and mark incomplete observation coverage.
2. Assess recent sport-specific and combined load, execution quality, response and upcoming demands. Keep mechanical cycling kJ separate from nutritional kcal; use estimates only when justified and labelled.
3. Check relevant fresh recovery trends alongside symptoms, effort and availability. HRV measurement methods remain separate; a provider readiness score is supporting evidence, not clearance or an automatic dose multiplier.
4. Keep the plan when no meaningful change is supported. Otherwise select retain/reduce/substitute/rest/review, with the exact trigger and affected session revision recorded.
5. Missing recovery data alone do not prove fatigue; missing training records do not prove rest. Use a brief relevant question or an appropriate unadapted/introductory path rather than inventing normal values.
6. Recompute the remainder of the week when needed without adding catch-up work or silently rebuilding the entire cycle. Escalate material baseline/cycle changes for review. Future auto-adjustment requires clearly bounded athlete authorization.
7. Render the decision and protected results directly in chat/calendar. External model prose is optional and cannot bypass provider permissions.

## Evidence hierarchy and Galpin/Huberman framework

Use Andy Galpin's adaptation-first approach to select the goal, assess starting capacity, choose appropriate exercises/protocols, allocate frequency and volume, and plan progression and recovery. Distinguish skill, speed, power, strength, hypertrophy, muscular endurance and different endurance objectives. Do not apply every adaptation at full dose in the same block. Huberman's hosted series is expert education; neither a guest's credentials nor a podcast mnemonic establishes an exact all-athlete prescription. No affiliation or endorsement is implied. [G1, G2]

For recovery, distinguish the immediate response to a session, recovery between sessions and longer-term adaptation. Feeling less sore is not evidence of restored performance. Sleep, nutrition, training response and stress belong in the same review; optional relaxation is not a replacement for recovery. [G3, REC1]

Evidence precedence: applicable current consensus/position statements and relevant trials/syntheses -> population-specific findings -> transparent JMM coaching defaults -> individual response review. Record disagreement and uncertainty instead of hiding them behind an expert's name. A small study or youth sprint-swimming trial cannot directly prescribe an adult triathlete's entire program. New findings should change a versioned rule only after review; do not let live web search silently alter a workout.

## Individual challenge, progression and fatigue management

### Establish the starting point

- Baseline combines actual recent sport-specific work, consistency, experience, movement competence, current restrictions and realistic time. Fitness-test results inform targets but do not establish tolerance for a new weekly volume or unfamiliar loading.
- Build a repeatable submaximal observation before maximal testing when data or experience are absent. A baseline test is a structured protocol with eligibility, preparation, units, execution, interpretation and a review date; no compulsory maximal battery to unlock training.
- Ask about unfamiliar heavy lifting or impact exposure only when the proposed program needs it. Lack of a jump measurement does not block easy swimming or cycling.
- Performance goals, measured physiological references, estimates and provider settings are different records. A goal cannot become a baseline; disagreement prevents an unsupported exact target, not all training.

### Choose the stress deliberately

| Objective | Prescription must control | What counts as success |
| --- | --- | --- |
| Aerobic durability | Tolerated time/distance, effort stability, environment, feeding opportunities | Repeatable work without disproportionate effort or poor subsequent tolerance |
| Tempo / race-specific practice | Explicit intended effort domain, work bouts, full recoveries and cumulative dose | Sustainable repeatable work with an appropriate response; race pace is demonstrated, not assumed |
| Threshold development | Named reference/method and sport, bout/recovery structure, target range | Controlled repeatability; no claim that one FTP percentage establishes VT2 or lactate steady state |
| VO2-oriented intervals | Full warm-up, repeatable high-aerobic bouts, sufficient recovery and technical control | Completing appropriate quality; the workout does not itself measure VO2max |
| Short intervals / over-unders | Work/recovery targets and complete repetitions; cumulative hard time | Intended exposure without turning recovery into more hard work; no HR chasing during brief efforts |
| Strength | Exercise competence, load, sets/reps, rest, repetitions in reserve | Stable technique and completed dose with tolerable subsequent fatigue |
| Power / plyometrics | Movement speed or landing quality, repetitions/contacts and generous recovery | High-quality outputs while fresh; never maximum exhaustion |

JMM must maintain separate cardiovascular, muscular/mechanical and technical exposure summaries. A low average HR does not make heavy lifting or plyometrics an easy day. Session-RPE x actual minutes can be labelled an estimated internal-load index; it is not equivalent to measured cycling work, TSS, jump contacts or an injury predictor.

### Decision policy

| Evidence | Default action | Required record |
| --- | --- | --- |
| Work completed as intended, repeatability and recovery acceptable across observations | Retain dose or propose one small progression when consistent with block objective | Which variable changes and why; source/date of observations |
| Unexpectedly hard execution, declining repeatability or accumulating soreness/fatigue | Hold progression; shorten work, reduce intensity or substitute appropriate easy practice | Actual problem, retained recovery and follow-up |
| Isolated unusual wearable score without corroborating problems | Check freshness/method and relevant athlete report; no automatic extra work or blanket rest | Conflicts, coverage and decision uncertainty |
| Missing device records | Ask whether training occurred or use manual actuals; do not assume rest | Sync status and actual-data gap |
| New/worsening pain, illness or concerning symptoms | Stop automatic progression; apply existing symptom/review pathway | No model-created diagnosis or unsupported clearance |
| Continued performance decline despite reduced load or signs of inadequate fueling | Escalate to qualified coach/clinician/sports dietitian as appropriate | Review reason; no chatbot diagnosis of overtraining or REDs |

Exact dose steps and review windows are versioned JMM defaults requiring evaluation. No universal +10% rule, fixed HRV percentage, pain score, workload ratio or calendar recovery week guarantees safety. Do not prescribe deliberate functional overreaching automatically. A qualified coach may authorize a bounded overload block with a recovery plan and monitoring; neither a pro label nor a high VO2peak grants that authorization.

## Strength, weights and plyometric execution

### Integrated supporting strength

Reserve two development exposures where appropriate; account for both inside total weekly time. Each must be selected for the sport and athlete rather than duplicating a generic gym circuit. Suggested emphasis below is a programming design choice, not a mandatory exercise list:

| Sport | Exposure A emphasis | Exposure B emphasis |
| --- | --- | --- |
| Swim | Familiar pulling/pushing, scapular/shoulder control and trunk | Whole-body support and appropriate lower-body force; avoid damaging fatigue before priority swimming |
| Bike | Familiar squat/hinge and unilateral force | Complementary lower-body/trunk patterns; optional power only when eligible |
| Run | Familiar lower-body strength, calf/soleus and trunk | Complementary unilateral/ankle capacity; eligible low-volume landing/reactive practice |
| Triathlon | Whole-body support chosen around key swim/bike/run sessions | Complementary maintenance/development without duplicating three separate strength programs |
| HYROX | Force capacity for relevant stations | Complementary strength plus station technique; count carries, lunges and sled work already performed |

Start novices with familiar controllable patterns and a smaller dose. For a trained, movement-competent adult, a possible JMM starting example is 2-3 work sets of 4-8 controlled repetitions on selected main lifts, about 2-3 repetitions in reserve and 2-3 minutes between main sets. This is a coach-reviewed example, not an automatic default for every movement or athlete. Choose accessories separately, include warm-up/ramp sets and account for actual recovery time. If the complete structure cannot fit the time budget, remove sets or exercises explicitly; never compress rests to fake a complete session. [STR1, STR2]

Log exercise, side where relevant, equipment, sets, reps, load/unit, effort/RIR, technique and symptoms. Advance load only when the athlete repeatedly completes the current dose with acceptable execution/response; never invent kilograms from body mass, age or an endurance test. Training to failure is not required by default. A controlled trial in trained participants found more acute fatigue with momentary failure than with 1-2 RIR; this does not prove an exact optimal RIR for all sports. [STR3]

Place priority skill/speed/power work while fresh. Coordinate demanding lifting with endurance objectives and next-session recovery. Separate sessions when feasible, but neither three hours nor 48 hours guarantees readiness. During taper or congested competition, reduce lifting volume and retain only familiar tolerable maintenance; do not introduce heavy eccentric work, maximal lifts or new jumps. [CON1]

### Plyometric progression contract

Eligibility requires athlete/coach confirmation of familiar movement, appropriate setting/equipment and current tolerance; unknown eligibility selects non-jumping alternatives. Running already contributes impact, so jump contacts must be considered alongside running, hills, sprinting and race demands.

Progression order is a JMM teaching framework: controlled landing/deceleration -> low-amplitude familiar bilateral actions -> more demanding reactive/unilateral actions if justified. Progress one of complexity, amplitude, speed, resistance or contacts at a time. An introductory example after eligibility review might be two sets of three low-amplitude familiar jumps with full recovery; it is not a validated minimum or a universal prescription. Depth jumps, weighted jumps and exhaustive jump circuits are never silently introduced.

Specify exercise, surface, sets, repetitions, contact-count convention, recovery, intended quality and stopping criteria. Stop or regress when pain, loss of landing control or clear deterioration occurs. Contact counting must state whether each landing, each foot or each repetition is counted; do not aggregate incompatible conventions. Benefits vary by population and protocol; do not promise injury prevention or faster racing from a fixed contact quota. [PLY1]

## Preparation, fueling during training and recovery meals

### Shared nutrition calculation contract

One calculated nutrition object supplies Today, workout details, chat cards, calendar, email and export views. Store rule/source version, session revision, calculation inputs, units, chosen target/range, assumptions, confidence and measured-versus-estimated status. Regeneration must not leave another view displaying an older target.

Use actual reviewed body mass for mass-based guidance with its date; a historical CPET weight is not automatically current weight. If it is unknown, provide food-based/general guidance instead of fabricated gram targets. Ask about relevant GI tolerance, allergies/preferences and previously practiced intake. Adult sports-nutrition references are not automatic protocols for children, pregnancy or medical nutrition needs.

Fuel the planned work and the next session; do not promote chronic energy restriction as a shortcut to performance. Do not calculate a diagnosis or exact energy availability from incomplete food/activity logs. Persistent unexplained fatigue, recurrent illness/injury, disrupted menstrual function where relevant or concerning restriction merit qualified assessment. Optional body weight tracking must not reward weight loss or dehydration. [N1, EA1]

### Before

Show session purpose, expected duration/intensity, equipment, setting and a progressive sport-specific warm-up. For swimming include safe setting and familiar stroke; for lifting include ramp sets; for running/power include appropriate movement preparation. Do not chase target HR immediately or include breath-holding/hyperventilation challenges.

For demanding/prolonged exercise, an established pre-event reference is 1-4 g carbohydrate/kg in the 1-4 hours before, selected according to timing, tolerance and event needs. This is a broad reference envelope, not a linear formula or an instruction to eat its upper end before every workout. Smaller familiar snacks may fit short lead times; consider prior meals and training. Avoid unpracticed high-fat/high-fibre meals when they cause symptoms. Do not force fasted quality work. [N2]

### During

| Session demand | Educational carbohydrate reference | JMM personalization |
| --- | --- | --- |
| Brief exercise under about 45 minutes | Usually no carbohydrate needed during the session when appropriately fed | Consider prior intake and another session; no mandatory gel |
| Sustained high intensity around 45-75 minutes | Small amounts can be useful | Familiar intake and practical opportunity; mouth rinse is optional, not a compulsory ritual |
| Endurance around 1-2.5 hours | 30-60 g/hour | Choose a practiced amount according to intensity, gut tolerance and total work |
| Prolonged endurance beyond about 2.5-3 hours | Up to approximately 90 g/hour, often with mixed carbohydrate sources | Progressive practice and review; do not jump to a high target or automatically prescribe >90 g/hour |

These are broad AIS reference bands, not hard physiological cutoffs or evidence that every session of that duration needs the same intake. [N3]

For bricks/races, plan feeding across the complete sequence and actual opportunities: swim access is limited; bike and run opportunities differ. Do not restart the clock for each leg or double-count a transition snack. Higher carbohydrate needs need not imply more fluid: account for gels, foods and drink together. For strength/plyometric sessions, adequate meals and water access often suffice; long/demanding hybrid sessions may require a different plan. Practice fueling during suitable training, log actual intake and GI response, and rehearse familiar products before racing.

### After

Show the next training opportunity and choose normal meal recovery versus rapid turnaround. Protein references commonly use about 0.25-0.4 g/kg per feeding, roughly 20-40 g in many adult examples; select an appropriate amount rather than adding both targets. Distribute intake through the day. When a genuinely short recovery window requires rapid glycogen restoration, approximately 1.0-1.2 g carbohydrate/kg/hour in the early recovery period is a reference strategy, not an obligation after every easy workout. With ample recovery time, ordinary carbohydrate-containing meals and sufficient daily protein can meet needs. [N4]

Ask whether the session was completed, actual effort, symptoms and any fueling/GI issue relevant to the next decision. Optional weight before/after supports a qualified hydration estimate, not a training-clearance score or a weight-loss objective. For two-a-days, review the first session and available refueling/recovery before the second; neither the calendar nor an eaten meal establishes readiness.

## Hydration, sodium and body-mass calculations

Use individually practiced fluids, access, conditions and measured observations where available. Never require an athlete to drink beyond need to hit carbohydrate or sodium targets. Avoid exercise-associated weight gain from excessive drinking; sodium does not make overdrinking safe. No universal fluid or sodium target fits every athlete. [H1]

Optional short-session field estimate under reasonably comparable measurement conditions:

`estimated sweat loss (L) = pre mass (kg) - post mass (kg) + fluid consumed (L) - urine passed (L)`

`estimated sweat rate (L/hour) = estimated sweat loss / actual exercise hours`

Require complete inputs and positive duration; missing urine/fluid must remain unknown unless explicitly reported as zero. Flag implausible/negative results and measurement problems instead of clamping them into a normal value. Account for clothing/wetness, food intake and other mass-change limitations; prolonged exercise makes the simple proxy less reliable. Sweat rate is an estimate, not a measured sweat sodium concentration. [H2, H3]

Keep three quantities distinct: drink sodium concentration (mg/L), planned intake rate (mg/hour), and measured sweat sodium concentration (mg/L). Do not infer sweat sodium from a salt mark, body-mass change or a generic population value.

`drink sodium intake (mg/hour) = drink concentration (mg/L) x drink intake (L/hour)`

`total sodium intake = drink sodium + separately consumed food/gel/capsule sodium`

Example calculation, not a recommendation: 700 mg/L x 0.750 L/hour = 525 mg/hour. Add other sodium only once. The same result must appear in all views. Show calculated total carbohydrate/fluid/sodium for the relevant duration and actual consumed amounts separately. Post-exercise replacement considers the remaining deficit, food, time to next session and tolerance; no forced rapid drinking or unreviewed fixed replacement multiplier.

## Recovery as part of the prescription

- Schedule adequate sleep opportunity around work, travel and training. Review the athlete's usual need and perceived sleep alongside device estimates; no single mandatory nightly number for every athlete. Wearable sleep stages/scores are estimates and can increase anxiety if treated as verdicts. [REC1]
- Separate expected training fatigue from persistent deterioration. One poor night or unusual metric does not diagnose overtraining; repeated poor response prompts a lower dose and review. Recovery must be planned at session, week and block levels.
- Easy movement is optional and must fit the athlete's response. A rest day must not become a compulsory recovery workout. Gentle breathing/relaxation may support winding down, but earns no readiness bonus and never replaces sleep or fueling. [G3]
- Massage, compression, temperature interventions and supplements are optional with modality-specific evidence and suitability, not prerequisites for progress. Do not promise faster adaptation because soreness falls or import commercial recommendations from podcast advertising.
- Persistent pain, systemic symptoms, recurrent injury or poor fueling require appropriate professional assessment rather than more automatic loading. Any clinical restriction overrides a generic training template.

## Athlete-facing contract: concise with expandable detail

Each workout must offer a short primary view: what, why, complete steps/targets and the relevant preparation/fuel/recovery summary. Expandable details contain calculations, evidence, uncertainty and alternatives. Do not place a research essay or repetitive disclaimers above the workout.

The athlete can ask in text/voice: why this session, what changed, can I move it, what if I have less time, what did I complete, what should I eat, and what do we do next. Answers must use authorized validated tools, preserve provenance and distinguish the saved plan from proposals. Uncertain voice numbers/units require correction before consequential saves. Protected data cards do not automatically become model context.

## Additional acceptance examples for this enrichment

These are required future checks, not tests executed by editing this document:

1. A 30-minute easy session does not receive the same compulsory carbohydrate plan as a three-hour rehearsal.
2. Unknown current body mass does not produce mass-derived meal grams; old laboratory weight is visibly dated.
3. Fueling accounts for consecutive legs and transitions once; gel plus drink carbohydrate and sodium totals reconcile.
4. 700 mg/L at 750 mL/hour produces 525 mg/hour in every surface; g/mg and mL/L conversions cannot silently differ.
5. Pre/post mass without fluid/urine inputs cannot claim a measured sweat rate; negative estimates trigger review.
6. A time-reduced strength session reduces complete sets/exercises rather than preserving impossible reps and removing rest.
7. A low-HR lifting or jump session still counts toward mechanical recovery; HYROX stations do not create uncounted extra strength.
8. Missing plyometric eligibility produces a usable controlled alternative, not automatic jumps or an empty program.
9. A good readiness score does not add hard work; a stale/missing score does not prove fatigue; poor symptoms override a good score.
10. A shorter workout updates fueling and subsequent-week context through the same saved revision, without claiming provider/watch delivery.
11. Proposed progression changes one identified variable; failed execution or concerning response prevents automatic escalation.
12. Two-a-day fueling/recovery is considered together; no duplicate post-session targets or blanket permission for a second threshold session.
13. No research citation is represented as approval of the full generated plan, injury prevention, an exact individual limit or guaranteed adaptation.
14. All examples remain valid for manual-only athletes and expose uncertainty when data are incomplete; no external AI/provider permission is inferred.

## Delivery order and release gates

### 1. One complete triathlon vertical slice

Implement custom per-leg event inputs, a shared weekly allocation including strength and real bricks, supported multi-session days and rest, and complete canonical steps. Show a four-week/month view plus the final event/taper weeks. Use synthetic fixtures before any athlete replacement. No automatic rewrite of existing plans or retroactive changes to completed work.

Acceptance: race/no-race/no-history modes; novice through professional; limited-time and full-availability schedules; supporting strength retained or explicitly accounted for; separate brick components and T1/T2 where applicable; no budget violations; baseline conflicts cannot invent targets; no unexplained loss of a required sport; save/reload/calendar/export preserve the same prescription. If constraints cannot fit the desired structure, present an honest smaller program and reason rather than a full-cycle success claim.

### 2. Single-sport and HYROX parity

Apply the same allocation, evidence and execution contract to swim, bike, run and HYROX with sport-specific protocol selection, strength integration, tests and event logic. Verify the season/division rules rather than hard-coding an outdated HYROX standard. Do not promote source examples directly to live prescriptions without review.

### 3. Daily adaptation and coach conversation

Test results -> next-session decision -> proposed change -> save/reload -> revised remaining-week view. Cover device outage, stale/conflicting recovery, missed/partial/substituted sessions, pain/illness, duplicate actions, rejected save and cross-athlete access. Keep the text interface usable without voice or external AI. Provider activation remains independent of the coaching-engine release.

### 4. Release proof

For each of five sport families and four experience labels, evaluate race, no-race and no-history scenarios (60 base scenarios), then add availability, taper, symptoms, protocol eligibility and provider-origin cases. Verify scheduling across week boundaries. Human coaching review of complete examples is additional to software tests.

Run typecheck, lint, all tests, clean production build, database/browser regression and live read-only smoke of the exact deployed version. Test numerical/structural invariants, not just snapshots. Document any failed or unperformed checks. A generated plan is not proof of positive physiological adaptation, legal permission, real provider delivery or watch acceptance.

## Evidence informing the policy

- Endurance distribution: individual-participant network meta-analysis, 2025: https://pubmed.ncbi.nlm.nih.gov/39888556/ . Does not establish one universal polarized/pyramidal winner or a JMM dose.
- Endurance resistance training: umbrella review, 2025: https://pubmed.ncbi.nlm.nih.gov/40153564/ . Supports strength as a component, not mandatory identical frequency/exercises for every athlete.
- Runner strength methods, 2024: https://pubmed.ncbi.nlm.nih.gov/38627351/ . Population/intervention differences matter for high-load and plyometric transfer.
- Cyclist primary study: https://pubmed.ncbi.nlm.nih.gov/27486014/ . Performance-related improvements do not mean all outcomes or all populations improve; do not promise a time-trial benefit from every prescription.
- Swimmer primary trial: https://pmc.ncbi.nlm.nih.gov/articles/PMC8508303/ . Adolescent sprint-swimming population limits direct transfer to adult open-water triathlon.
- Concurrent training: https://pubmed.ncbi.nlm.nih.gov/34757594/ . Scheduling and fatigue management matter; separation is not proof of recovery.
- Taper synthesis: https://pubmed.ncbi.nlm.nih.gov/37163550/ . Reduce volume with appropriate retained familiar quality; no exact universal taper duration.
- Combined monitoring: https://pubmed.ncbi.nlm.nih.gov/36940300/ and https://pubmed.ncbi.nlm.nih.gov/28463642/ . Support context-sensitive monitoring, not a validated universal readiness score.
- HYROX official rulebook entry point: https://hyrox.com/rulebook/ . Verify season and division before encoding loads or standards; rules describe competition, not an optimal training dose.

### Enrichment source registry

| ID | Source | Role and limits |
| --- | --- | --- |
| G1 | [Galpin/Huberman: program design](https://www.hubermanlab.com/episode/dr-andy-galpin-optimize-your-training-program-for-fitness-and-longevity) | Expert educational framework; not a universal dose or endorsement |
| G2 | [Galpin/Huberman: strength and muscle](https://www.hubermanlab.com/episode/dr-andy-galpin-optimal-protocols-to-build-strength-and-grow-muscles) | Distinguish adaptations and execution; numerical JMM choices need independent review |
| G3 | [Galpin/Huberman: recovery](https://www.hubermanlab.com/episode/guest-series-dr-andy-galpin-maximize-recovery-to-achieve-fitness-and-performance-goals) | Recovery concepts; not validation of every supplement, modality or readiness metric discussed |
| STR1 | [Endurance strength umbrella review, 2025](https://pubmed.ncbi.nlm.nih.gov/40153564/) | Endurance transfer; heterogeneous populations and interventions |
| STR2 | [Runner strength methods, 2024](https://pubmed.ncbi.nlm.nih.gov/38627351/) | Method/population specificity; not automatic adult triathlon dosing |
| STR3 | [Failure versus RIR controlled study, 2024](https://pubmed.ncbi.nlm.nih.gov/38393985/) | Acute fatigue and training response in studied participants; no universal optimal RIR |
| CON1 | [Concurrent training synthesis, 2022](https://pubmed.ncbi.nlm.nih.gov/34757594/) | Strength/endurance interaction and scheduling; no guaranteed separation interval |
| PLY1 | [Running economy and strength methods, 2024](https://pubmed.ncbi.nlm.nih.gov/38165636/) | Supports method-specific review; contact quotas and progression above are JMM teaching choices |
| N1 | [AND/DC/ACSM: Nutrition and Athletic Performance, 2016](https://pubmed.ncbi.nlm.nih.gov/26920240/) | Individualized sport-nutrition framework; not a universal meal prescription |
| N2 | [Gregory Cox: Nutrition for Endurance Sports, accepted book-chapter manuscript](https://pure.bond.edu.au/ws/portalfiles/portal/84627138/AM_Endurance_Sports.pdf) | Pre-event reference envelope; event, timing and tolerance determine application |
| N3 | [AIS: sports-drink use](https://www.ausport.gov.au/ais/nutrition/supplements/group_a/sports-foods2/sports-drink/how-and-when-do-i-use-it) and [USADA nutrition guide, 2026](https://www.usada.org/wp-content/uploads/2026-TS-Nutrition-Guide.pdf) | Broad during-exercise carbohydrate bands; no automatic high-intake escalation |
| N4 | [ISSN nutrient timing, 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5596471/) and [Endurance recovery nutrition, 2015](https://pubmed.ncbi.nlm.nih.gov/26166054/) | Protein distribution and rapid-turnaround carbohydrate strategies; distinguish ordinary meal recovery |
| EA1 | [IOC REDs consensus, 2023](https://bjsm.bmj.com/content/57/17/1073) | Health/performance consequences and clinical context; JMM does not diagnose REDs |
| H1 | [ACSM fluid replacement, 2007](https://pubmed.ncbi.nlm.nih.gov/17277604/) | Individual replacement context; not mandatory complete replacement during exercise |
| H2 | [NATA fluid replacement position statement, 2017](https://www.nata.org/sites/default/files/fluid_replacement_for_the_physically_active.pdf) | Field sweat estimate and variability; no sweat sodium inference from body mass |
| H3 | [Errors in hydration estimates from body mass, 2007](https://pubmed.ncbi.nlm.nih.gov/17454547/) | Explains limits of the simple mass-change proxy |
| REC1 | [Athlete sleep consensus, 2021](https://pubmed.ncbi.nlm.nih.gov/33144349/) | Individual sleep needs and monitoring limitations |

No production changes, real athlete plan edits, messages, provider grants or credentials were made while preparing this contract. Coaching-engine implementation and release acceptance remain outstanding.
