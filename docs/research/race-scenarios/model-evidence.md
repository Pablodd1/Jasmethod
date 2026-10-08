# JMM deterministic race scenario models

Research cutoff: 8 October 2026. This is an engineering recommendation, not a claim of systematic-review completeness or a validated JMM predictor. Scientific citations belong in research/developer documentation; public marketing copy can use neutral descriptions, but must not remove legally required attribution from reused licensed material. Do not reproduce journal figures, source code or copyrighted tables without a license check.

## Release recommendation

Ship an editable, provenance-rich **scenario planner**, with independent modules for (1) athlete capacity, (2) course mechanics, (3) environment, (4) execution and (5) intake logistics. Calculate useful targets from explicit baselines or user-selected targets. Label every output as observed, user-selected, scenario estimate, or individually calibrated estimate. Unknown is a valid output; never silently replace missing actuals with examples.

A single athlete profile does not determine exact race pace, watts, HR, substrate use, heat response or fueling. Age/sex/weight/VO2max are descriptive inputs, not a substitute for a recent sport-specific performance. User changes must immediately recalculate results and disclose affected assumptions.

### Athlete baseline priority

1. Recent comparable actual race/time trial, with distance, elapsed time, date, mode, terrain, conditions and whether maximal/representative.
2. Recent sport-specific duration-power or duration-speed curve with testing provenance and held-out validation.
3. Explicitly selected target pace/power/splits. Useful for planning, but not evidence that the athlete can sustain it.
4. Otherwise return missing-baseline guidance and permit scenario construction, without an invented personalized finish time.

Store training exposure, longest comparable effort, fatigue/brick performance, threshold method, equipment, practiced intake and self-reported acclimation separately. No arbitrary age penalty; no gender inference; no acclimation inferred from residence, nationality, weather or a single workout.

## Running road and nontechnical trail

### Baseline distance scaling

The transproject empirical form is T2=T1*(D2/D1)^b, seconds and matching distance units. Fit b=ln(T2/T1)/ln(D2/D1) only from comparable maximal performances. A conventional b=1.06 may be offered as a visibly named generic assumption, never personalized truth. Product rule: without athlete calibration, restrict automatic scaling to endurance road comparisons 5 km–half marathon and distance ratio 0.5–2; these limits are conservative product gates, not validated scientific cutoffs. Marathon, ultra, sprint and materially different terrain require explicit target/comparable evidence.

Evidence: Vickers & Vertosick (2016), 2,303 recreational runners, training/validation split, found conventional scaling substantially optimistic for marathons: at least ten minutes too fast for half the runners. Reported MSE was 381 versus 228/208 for their alternative models. These are population results, not an individual prediction interval. [Primary study](https://pubmed.ncbi.nlm.nih.gov/27570626/), DOI 10.1186/s13102-016-0052-y. Do not copy its alternative regression coefficients until full methods, units and implementation license are checked.

### Nonlinear grade model

Published running metabolic cost polynomial, grade g=rise/horizontal run (5%=0.05), C in J/kg/m:

C(g)=155.4g^5−30.4g^4−43.3g^3+46.3g^2+19.5g+3.6.

The model was derived from ten treadmill runners over −45% to +45%. Its laboratory fit is not race-time validation. Downhill field speed is constrained by coordination/safety despite low metabolic cost. [Minetti et al., 2002](https://pubmed.ncbi.nlm.nih.gov/12183501/), DOI 10.1152/japplphysiol.01177.2001; equation in Figure 1 caption of the [author paper copy](https://www.softrun.fr/J%20Appl%20Physiol-2002-Minetti-1039-46.pdf), page 1041. Avoid extrapolation outside study range.

Engineering adaptation, explicitly unvalidated: equivalent flat distance Deq=sum(surface_segment_m*C(g)/C(0)); with selected flat pace p0 (s/m), segment time=surface_segment_m*p0*C(g)/C(0)*selected_time_modifiers. This assumes constant metabolic effort and comparable running economy. Do not count elevation twice by also adding an ascent penalty. For production automatic pace mapping restrict |g|<=0.15; outside this conservative product range require segment run/hike target. Positive and negative elevation must be separate, not netted. Downhill target requires athlete/coach cap, or use flat speed as conservative default cap explicitly labeled “no downhill speed credit.” Technicality, mud, steps, snow, crowds and darkness require manual time/cap assumptions or comparable actuals. Never present the metabolic optimum as a safe downhill pace.

For a baseline with its own course, compare target/base equivalent distances rather than treating the hilly baseline as flat. This still does not establish duration sustainability. Walking is a separate mode; do not switch using an undocumented universal run/walk threshold.

### Sprint boundary

100–400 m racing involves acceleration, maximal speed, speed endurance, start reaction, wind legality and surface. No endurance power-law/grade engine. Offer actual event splits and editable target splits; timing sum only. Track middle-distance also needs event-specific calibration. No pace estimate from VO2max alone.

### Running power

Keep device/model/firmware/source and calibration in the data contract. Never transfer a watt threshold between device ecosystems or equate a wearable's running watts with cycling crank watts. A six-runner submaximal study showed strong associations but systematic absolute-power underestimation, illustrating that correlation is not interchangeability. [Imbach et al., 2020](https://pubmed.ncbi.nlm.nih.gov/32698464/), DOI 10.3390/sports8070103. A separate 15-runner study found running economy could not be inferred from running watts alone: [primary study, 2023](https://pubmed.ncbi.nlm.nih.gov/37960430/). Recommend reporting same-device observed watt ranges or user-selected targets only; no synthesized running watts from body mass and road pace.

## Cycling road and time trial

### Mechanical layer

At steady positive ground speed v, grade angle theta=atan(g), total mass m, drivetrain efficiency eta_d:

P_crank = [m*g0*sin(theta) + Crr*m*g0*cos(theta) + 0.5*rho*CdA*u*abs(u)]*v/eta_d,

where u=v+h and h is headwind component (positive opposing travel). g0=9.80665 m/s² is conventional gravity. This one-dimensional version handles axial head/tail wind. For crosswind, either require yaw-dependent CdA/aerodynamic treatment or explicitly mark axial-only approximation; do not add crosswind speed directly as headwind. Wind meteorological direction is FROM; project onto segment heading carefully. Negative resisting force denotes coasting/braking/acceleration, not negative rider effort. Add acceleration/rotational inertia only in an explicitly dynamic solver. Segment-steady estimates are not suitable for technical corners, stops or sprinting.

Solve bounded speed from selected power, then apply user-selected corner/descent/legal speed caps, stops, traffic and transition time. On capped descents solve required positive crank power or set zero and report braking/coasting; do not charge target power regardless. Failing root bracketing returns a diagnostic, never an extreme extrapolated speed. Missing CdA/Crr/equipment must be entered as explicit scenario assumptions. Fit CdA/Crr only with identifiable field calibration: one flat ride cannot uniquely distinguish all confounded parameters.

Evidence: [Martin et al., 1998](https://pubmed.ncbi.nlm.nih.gov/28121252/), DOI 10.1123/jab.14.3.276, controlled validation R²=.97 and standard error 2.7 W. This error does not transfer to unknown winds/CdA/route or finish times. [Olds et al., 1995](https://pubmed.ncbi.nlm.nih.gov/7615475/), DOI 10.1152/jappl.1995.78.4.1596, 41 cyclists over a 26-km TT: correlation .89, mean absolute time difference 1.65 minutes (3.87%). Both support physical modeling, not universal accuracy guarantees. Road races with drafting, attacks and pack constraints must be labeled solo-equivalent unless the user supplies tactical scenarios; TT is the strongest initial use case.

### Capacity, threshold and durability

For measured maximal efforts, P(t)=CP+W'/t (watts, joules, seconds). Fit CP and W' with at least three suitable severe-domain efforts, retain residuals and duration bounds, reject nonpositive parameters. Three points is a product calibration rule, not proof of validity. Do not extrapolate toward zero seconds or use the asymptote as unlimited-duration race power. FTP, CP, lactate threshold and maximal lactate steady state are not interchangeable labels. [Jones & Vanhatalo, 2017](https://pmc.ncbi.nlm.nih.gov/articles/PMC5371646/), DOI 10.1007/s40279-017-0688-0; [Poole et al., 2016](https://pubmed.ncbi.nlm.nih.gov/27031742/).

For a useful first release: select sustainable target watts explicitly or interpolate the athlete's observed comparable-duration envelope; show percent of the named threshold only as descriptive arithmetic. Do not hardcode “Ironman = X% FTP.” If no tested long-duration baseline, display “sustainability not established.” CP/W' use is an optional feasibility flag, not an optimizer promising fastest pacing. Without calibrated recovery kinetics, accumulated work above CP is only gross exposure, not remaining W'.

Durability is not a universal percent loss per hour or per kJ. [Spragg et al., 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11235642/), DOI 10.1002/ejsc.12077, studied 14 professional men: prior-work intensity changed subsequent short-duration performance despite similar work totals; CP did not significantly differ across conditions. Keep matched fresh/fatigued tests or manual stage-specific targets. Do not transfer elite coefficients to all users. This article has a noncommercial/no-derivatives license; link and summarize findings in original words rather than reuse figures/tables.

### Work versus energy versus carbohydrate

Mechanical work kJ=sum(P_crank_W*dt_s)/1000. If gross metabolic efficiency eta_g is measured or explicitly assumed, metabolic energy kJ=mechanical_kJ/eta_g, and kcal=metabolic_kJ/4.184. Keep drivetrain eta_d separate from physiological eta_g. Gross efficiency depends on workload/cadence; it is not universally 25%. [Ettema & Lorås, 2009](https://pubmed.ncbi.nlm.nih.gov/19229554/), DOI 10.1007/s00421-009-1008-7. A primary experiment reported differing ranges across loads/cadences, not a fixed conversion: [study](https://pubmed.ncbi.nlm.nih.gov/8933490/). Prefer null metabolic energy without explicit efficiency; permit an editable exploratory 0.20–0.25 scenario band, labeled a product assumption and not a population bound. At 200 W for 3,600 s: work 720 kJ; eta_g=.25 yields 2,880 metabolic kJ or 688.34 kcal. Neither number prescribes carbohydrate grams.

## Environment and global support

Persist weather type: observation / forecast / climatology / manual / unknown. Store coordinates, elevation, timezone, start timestamp with offset, issue time, valid time, provider/model, units and uncertainty. A future calendar date does not create a forecast. Forecast only when provider valid times cover race window; beyond horizon use explicitly historical climatology or editable scenarios. Historical race-day data is an observation of that year, not this year's forecast. [ECMWF official medium-range description](https://www.ecmwf.int/en/forecasts/documentation-and-support/medium-range-forecasts) describes forecasts to 15 days and ensemble spread; inspect the actual selected product horizon rather than hardcode a universal limit.

Mechanical wind/density effects and physiological capacity effects are distinct. Higher altitude can reduce aero drag while impairing aerobic capacity; do not infer a net benefit. Prefer entered/measured density or a separately tested moist-air-density function from actual pressure, temperature and humidity. Pressure at station and sea-level pressure are different. Missing pressure must not be silently treated as sea level. Explicit standard-atmosphere scenarios are acceptable if labeled.

Heat/humidity/solar radiation/wind/clothing affect thermoregulation together. Air temperature + RH is not measured WBGT. Do not use heat index as exercise physiology or a safe-to-race certificate. [Racinais et al. consensus, 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4473280/) supports repeated heat exposure over 1–2 weeks, cooling and hydration considerations; it does not provide a universal individual pace correction. [Ely et al., 2007](https://pubmed.ncbi.nlm.nih.gov/17473775/) documents population marathon slowing over WBGT categories, with ability-dependent effects; its course-record comparisons are not an athlete-specific coefficient. [Acute-altitude experiment](https://pubmed.ncbi.nlm.nih.gov/34171484/) used 14 recreational athletes and specific exposure conditions, insufficient for a universal altitude penalty.

Therefore use clearly editable relative time modifiers for running and capacity modifiers for cycling, or individually calibrated condition response. Default unknown adjustment is “not modeled,” not 0% physiological impact. Compare condition scenarios without claiming probabilities. Avoid stacking multiple heat/humidity/altitude penalties learned from overlapping evidence. Acclimation requires reported exposure duration, recency and conditions; no automatic credit. Forecast ensemble percentiles represent weather uncertainty, not athlete prediction accuracy.

## HR, intensity and fuel outputs

HR is a monitoring target, not derivable exactly from watts, VO2max or age. Return athlete-entered sport-specific HR band, or an empirical matching-conditions band supported by actual synchronized sessions. Preserve threshold method/date. HR lag, drift, heat and measurement error mean no second-by-second predicted trace. Avoid translating %FTP to %HRmax. RPE prompts can accompany user-selected targets without a falsely precise physiology model.

Intake module: duration × explicitly chosen practiced g/h, split into clock-time portions, product carbohydrate content and available feeding windows. [Jeukendrup 2014](https://pubmed.ncbi.nlm.nih.gov/24791914/) supports duration-dependent guidance, roughly 30–60 g/h for prolonged exercise and around 90 g/h for longer endurance with multiple-transportable carbohydrates; [2017 gut-training paper](https://pubmed.ncbi.nlm.nih.gov/28332114/) emphasizes practice/tolerance. These are guidance ranges, not universal safety ceilings or guaranteed oxidation. Product suggestion bands: <45 min generally no scheduled carbohydrate needed; 45–75 min small amounts/mouth rinse option; 75–150 min 30–60 g/h; >150 min 60–90 g/h only if practiced/tolerated. Exact band boundaries are implementation conventions informed by guidance, not discrete physiological switches. Higher intakes require explicitly practiced expert-guided input; do not auto-escalate. No automatic glucose/fructose ratio mandate and no conversion of total metabolic calories into exogenous carbohydrate demand.

Hydration must not prescribe replacement from temperature alone. Use athlete measurements/plan and accessible aid stations; no universal sodium dose or encouragement to overdrink. Medical history, GI symptoms or unusual restrictions should route to qualified individualized advice rather than optimizer rules.

## Triathlon, swim and HYROX

Triathlon total=sum(swim,bike,run,T1,T2,stops). Preserve each sport's baseline and accumulated fatigue state. Fresh standalone running time is not a brick prediction. Require comparable brick/triathlon actuals or explicit run target after bike. Feeding windows cannot place intake during swimming; carry planned delivery into permitted bike/run opportunities without an unsafe bolus. Event distance/division/rules are explicit inputs.

Swimming: CSS=(Dlong−Dshort)/(Tlong−Tshort), same stroke/pool length/start method. Require positive denominator and proper trials. A 13-swimmer primary study found trial selection matters: [study](https://pubmed.ncbi.nlm.nih.gov/32614153/). Pool CSS is not an open-water finish predictor. Offer user-selected pace / comparable swim actuals; current, waves, navigation, wetsuit, crowding and distance uncertainty remain explicit scenarios. No universal swim watt estimate or safety judgment from temperature alone.

HYROX: additive run splits + eight station splits + transition/Roxzone time, specific to division/loads and comparable actuals. No converting fresh 8-km road pace into compromised running. First small simulated study involved 11 recreational athletes, exploratory associations rather than a validated population predictor: [Brandt et al., 2025](https://pubmed.ncbi.nlm.nih.gov/40230601/), DOI 10.3389/fphys.2025.1519240. Missing station or transition time makes full total unavailable; user can still build a plan.

## Uncertainty and acceptance

For initial release, report a deterministic central scenario and low/high **scenario range** made from explicitly named bounded inputs. It is not a confidence/prediction interval. Use coherent scenario bundles, not independently combined temperature/wind quantiles implying nonexistent joint probability. A user-specific calibrated prediction interval requires held-out races, error stratification by sport/duration/terrain/conditions and coverage testing. Do not recycle paper R² or SEM as JMM accuracy.

Release gates: units, provenance, missing-data behavior, grade signs, wind FROM semantics, weather horizon, mode boundaries, coast/brake handling and numeric tests in model-contract.json. Output precision should match evidence: pace typically 5 s/km, target power 5 W, finish time rounded to a minute for endurance scenarios; these are presentation rules, not measurement uncertainty. Preserve full calculation precision internally.

## Implemented subset handoff

The initial engine implements explicitly selected run, bike and swim targets; triathlon composition; nonlinear bounded run grade scenarios; steady bicycle mechanics; optional evidenced HR and same-device run watts; practiced intake arithmetic; per-segment outputs; and editable time sensitivity. It does not yet implement the research options of CP fitting, running-distance extrapolation, HYROX/sprint splits or calibrated weather responses. The strict TypeScript parser is the exact API, while model-contract.json records research requirements and the implementation subset.

Explicit product gates now include a 90-day reference-review window, confirmed flat/zero axial wind assumption when no route is supplied, no future observations, and separately evidenced optional intensity/fueling targets. The 90-day window is not a biological expiry. Bicycle time multipliers are disabled (must equal 1); selected target watts remain distinct from realized model watts. Segments use surface/path distance and grade rise/horizontal run, so GPX horizontal distances must be converted before use. Standalone swim fueling is withheld because swim feeding windows are not modeled.

Verification: 23 focused engine tests passed using node --import tsx --test src/lib/race-scenario.test.ts. CLI tsx's IPC socket was unavailable; Node's module-loader test route succeeded. See the verification report for full-app integration/build and publication evidence. No claim of scientific or clinical validation follows from software tests.
