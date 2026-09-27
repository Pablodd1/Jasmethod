# JMM coaching and device integration contract

27 September 2026. Product specification based on the owner's clarification. This document is a target contract, not a claim that these functions are implemented or validated.

Working branch: `codex/jmm-coaching-integration`, isolated checkout based on original `origin/science-v2-shadow` at `4e2ae95`. Original working directory and production unchanged. Existing main remains a separate, older deployment reference.

## Product responsibility

JMM is the athlete's primary coaching interface. It owns its prescriptions, athlete-entered profile, check-ins, coaching decisions and feedback. Supported manufacturer connections supply observations and receive supported workouts. Every external datum retains source, consent, permitted use, retention and deletion requirements. Storing a datum in JMM does not erase its provider restrictions.

The athlete should see a clear session, why it is prescribed, changes from the cycle, how to execute it, fuel/recovery instructions and actual delivery status. Technical complexity stays behind this flow. Missing data never becomes invented physiology.

## Historical intake and athlete context

- Import the available, authorized history with pagination, backfill progress, rate-limit handling and correction/deletion processing. Do not promise a universal number of months: access windows and retention vary by source.
- Support athlete-supplied original activity files with provenance and permission review; do not use a file-import route to launder restricted API data.
- Record goal/event/date/priority, sport disciplines, experience, availability, equipment, injury restrictions, relevant health constraints, timezone, sleep schedule and nutrition preferences. Request sensitive information only where needed and with clear consent.
- Analyze historical frequency, volume, intensity, interruptions, recent performance, strength/plyometric exposure and subjective response. Distinguish completed sessions from prescribed sessions and adherence from physiological adaptation.
- Baselines and zones are sport-specific and versioned: units, measurement/test method, date, confidence, source, applicability and reviewer. Never silently equate cycling power zones, running pace zones and generic heart-rate zones.
- Imported, manually reported, estimated and laboratory-measured values remain distinguishable. Apply comparable HRV method/device baselines; do not merge SDNN and RMSSD into one baseline.
- Onboarding may finish with incomplete history; use an explicitly conservative provisional plan and targeted baseline assessment rather than fabricated precision.

## One coaching loop

1. Collect permitted observations and reconcile duplicate representations of the same exercise.
2. Build an as-of athlete context with data freshness, uncertainty and available history.
3. Define a goal-specific cycle: phase, intended adaptations, sport balance, load distribution, recovery, baseline/retests and taper where applicable.
4. Select an eligible reviewed protocol and instantiate its exact dose, intensity, repetitions, recovery and progression within athlete constraints.
5. At daily check-in, combine recent response, yesterday's actual session, cumulative history, today's symptoms/readiness and available time. Maintain the cycle purpose unless a justified replacement/rest is needed. Do not chase daily HRV or change everything each day.
6. Save one versioned prescription. Coach changes, every UI, exports, nutrition and reminders use that version. Persistent injury/day-off restrictions apply everywhere. Preserve skipped/partial/completed history.
7. Publish the approved version to a supported provider, retain its external ID and schedule, and reconcile updates/cancellations. Do not alter an underway/completed session automatically.
8. Import execution, compare with intended steps where data permits, resolve uncertain matches conservatively and collect session RPE, completion, pain and tolerance feedback.
9. Reassess recovery and progress. Record the reason and inputs for the next decision. Compare forecasts with outcomes; do not label data completeness as prediction accuracy.

## Device and runtime contract

- Prioritize Garmin Training API delivery with separately approved activity/health ingestion; implement COROS partner delivery next. TrainingPeaks is an optional approved interoperability route. Strava is not assumed to publish planned sessions to watches. Oura/WHOOP supply available observations; do not invent workout-push capabilities.
- Require exact registered callback URI, expiring single-use OAuth state, correct scopes, encrypted tokens, refresh, durable initial sync and visible revocation/reconnection state.
- User browser closure must not stop server jobs. Monitor queue age, worker heartbeat, retries, rate limits and data freshness. Mobile/watch cloud availability is outside JMM's direct control.
- Delivery states distinguish local draft, approved, queued, provider accepted, scheduled, device confirmed where observable, unknown, failed and superseded. A download, email or share sheet is not device receipt.
- Export fidelity includes short sprint durations, repeats, warm-up, recoveries, cooldown, pace/power/heart-rate targets and units. Mark unsupported target types explicitly rather than silently converting them.
- Strength and plyometric instruction may require JMM display when a device cannot represent exercise, technique, sets, reps or rest accurately.
- Select one primary outbound route per session to prevent duplicate Garmin/COROS deliveries through direct and TrainingPeaks paths.
- Athletes can stop using Strava as their interface; automatic new watch data still requires a supported live connection. Disconnection stops that feed and may require deletion of provider-derived data.

## Evidence and nutrition contract

- Each executable protocol has population, sport/event, goal, phase, study design, source, dose, progression, applicability limits and review date. Distinguish completed human trials, reviews/consensus, study protocols and coaching inference.
- Evidence that a component improves performance does not establish that JMM's assembled cycle has itself been tested. Keep both claims separate.
- Cover endurance, speed, strength/power and plyometrics through explicit compatible protocols and workload constraints. Do not give identical specialist sessions to beginners and professionals merely under different labels.
- Fuel planning considers session type/intensity/duration, body mass where relevant, total daily intake, timing of the next session, environmental/sweat context where available, gut tolerance, allergies and preferences. Link before/during/after servings to the same prescription version.
- Distinguish acute use from chronic loading/maintenance and nutrition adequacy from performance supplementation. Caffeine, creatine monohydrate, dietary nitrate, beta-alanine and bicarbonate have different evidence and use cases; no universal stack.
- Product catalogue stores verified regional label, serving size, carbohydrate/sugar/protein/sodium/caffeine amounts, date and source; account for combined products to avoid double-counting. Brands are options, not proof of efficacy. Store independently verified batch-certification information where available, without claiming zero contamination risk.
- Enforce opt-outs and suitability checks on every recommendation path. Consider sleep timing, medication/health restrictions and adverse responses. Route cases requiring clinical/dietetic judgment for review.
- Treat tart cherry or other recovery aids separately according to the actual evidence and outcome; do not infer universal effectiveness from marketing. Dietary nitrate is not equivalent to every product labeled nitric-oxide booster.
- No promises to prevent all injury/illness, maximize HRV, continually lower resting heart rate or identify the single best plan for every athlete.

## AI, coach and administrator

AI may explain and propose only within a validated prescription schema, evidence and data-permission boundary. Deterministic invariants govern injury constraints, units, dose limits, permitted evidence and export fidelity. Ineligible provider data and derivatives must not enter model context. Coach overrides require authorization, version checks and an audit trail. Athlete/organization access, consent revocation and administrator assignment need cross-user isolation tests.

## Release acceptance

First gate: repair original Calendar authorization, shared-demo access, dependency exposure, WHOOP error handling, observation provenance and prescription consistency identified in the September 26 audit.

The first complete vertical journey must demonstrate with authorized test accounts: history intake -> reviewed profile/zones -> purpose-specific cycle -> day-before actual response -> today's check-in -> unchanged or justified updated session -> exact Garmin structured workout -> observed watch execution -> imported result -> correct match and feedback -> auditable next decision.

Include two-athlete isolation, token expiry, lost callback, duplicate/out-of-order webhook, stale measurements, missing history, manual/device conflict, failed/ambiguous delivery, timezone/DST, skipped session, correction/deletion, revoked consent and worker restart. Do not report release readiness based only on build/unit-test counts.

## Sources checked 27 September 2026

- Garmin Training API: https://developer.garmin.com/gc-developer-program/training-api/
- COROS Partner API: https://support.coros.com/hc/en-us/articles/53181766856724-Partner-API-Access
- TrainingPeaks API: https://help.trainingpeaks.com/hc/en-us/articles/234441128-TrainingPeaks-API
- Strava API policy, including AI, retention and revocation: https://www.strava.com/legal/api_policy
- Oura API/MCP agreement: https://cloud.ouraring.com/legal/api-agreement
- AIS supplement evidence framework: https://www.ausport.gov.au/ais/nutrition/supplements/group_a
- IOC supplement consensus: https://pmc.ncbi.nlm.nih.gov/articles/PMC5867441/
- ACSM/Academy/DC Nutrition and Athletic Performance position: https://pubmed.ncbi.nlm.nih.gov/26891166/

Provider agreements and evidence need periodic review. This specification supplies architecture and acceptance criteria, not individualized medical or supplement prescriptions.
