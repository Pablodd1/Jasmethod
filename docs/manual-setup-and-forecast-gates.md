# Manual setup, plan confirmation and optional forecast exclusion

Implementation candidate, 2026-10-02. This is not release approval or medical certification.

## Setup and planning

- `manual-setup-v1` requires an explicit supported goal, experience/time confirmation, adult eligibility, dated recent tolerated weekly training, interruptions, current restrictions, qualified-review scope, actual available days, per-day time and equipment/venue context. Weight, HRV, devices and maximal benchmarks are not prerequisites.
- Optional structured goals support pace, power/FTP, speed, completion and fitness, with explicit sport, value/unit and optional target date. Numeric performance goals remain separate from current capacity; target-driven progression requires coaching review and is excluded from this pilot. An explicit baseline-only planning choice may retain the aspiration without using it as capacity.
- Unknown fields remain unknown. A zero/absent/stale baseline and unresolved restrictions block individual planning; no Olympic goal, event date, 12-week horizon or demographic physiology is synthesized.
- Source and actor are recorded separately: athlete reports versus coach-set setup. Setup is stored in existing immutable, athlete-scoped `AuditLog` rows (`profile.setup`), with its own optimistic revision. No schema migration is needed.
- Seven-day setup reconfirmation applies only to plan creation/replacement. Daily safety uses the confirmed current check-in; the dated recent-baseline and scope gates still apply.
- The `/onboard?redo=1` flow can edit goals and context. Wizard completion does not assign a plan. `/training` previews all weeks and requires explicit confirmation. A content hash binds confirmation to inputs, setup/profile revisions and current active plans; the transaction rechecks those records.
- Replacement archives the prior plan and marks uncompleted future sessions `superseded-plan`, preserving their prescriptions and all completed history. Existing benchmark records are not erased or automatically scheduled.
- Reduction-only planning constraints never exceed the smaller of the reported recent weekly load and available time. Unavailable days are omitted, not made up. Hard work is not stacked on the same or adjacent days including generated week boundaries. These are conservative implementation limits pending coaching review, not a validated progression algorithm.
- Track sprint requires the actual 100 m, 200 m or 400 m event. An imminent event under four weeks, interrupted training, minors, pregnancy/postpartum or significant restrictions require a qualified, separately reviewed pathway. The app does not supply medical clearance.

## Forecast scope

Personalized numeric race forecasts are disabled unconditionally for the pilot in `forecast-availability.ts`. Both forecast endpoints return an honest unavailable reason. The service stops before health-data assembly, weather network requests, forecast snapshot writes and numeric GPX pacing. Existing saved records remain intact. There is no environment switch that can silently restore unsupported forecasts.

The isolated `illustrativeRaceScenario` function retains arithmetic regression coverage, is labelled illustrative/unvalidated, rejects missing required sport anchors, and is not called by athlete APIs. Enabling any personal prediction requires dated anchor provenance, relevant training/event/course evidence, empirically evaluated error, qualified scientific review and release-owner acceptance. A supplied goal time is not evidence of capacity.

## Nutrition

No hidden 70 kg fallback remains in fueling, calorie calculations or bike physics. Unknown weight yields null pre/post gram totals and general food guidance. Caffeine needs an explicit opt-in plus supplied valid weight; enabled supplement preferences without an explicit caffeine selection are insufficient. Fluids are examples, not obligatory replacement volumes. Saved sweat numbers without date/context are labelled reported/unverified; measurements are not silently heat-multiplied. Text warns against overdrinking and that sodium cannot make it safe, and counts drink/gel carbohydrate once.

Supplied weight and nutrition examples remain general education; existing profile fields do not establish clinical context or a validated nutrition prescription. Clinical nutrition, medication-dependent advice, dietary restrictions and unsafe energy-intake concerns need qualified review.

## Narrow evidence corrections

Editorial check of primary PubMed abstracts, 2026-10-02:

- [PMID 34489178](https://pubmed.ncbi.nlm.nih.gov/34489178/): HRV-guided training showed a nonsignificant pooled performance effect; this does not validate automatic readiness-driven progression.
- [PMID 37414459](https://pubmed.ncbi.nlm.nih.gov/37414459/): healthy-adult resistance training strength/hypertrophy outcomes, not mortality or functional-capacity outcomes.

Other registry entries were not comprehensively re-audited. Schema tests cannot establish scientific validity.

## Verification and outstanding review

Focused unit/regression checks cover missing inputs, stale/unsupported setup, adult/no-device eligibility, nullable nutrition, caffeine opt-in, sweat provenance, forecast service exclusion, and reduction-only day/time constraints. Full shared-checkout tests/typecheck/build and application tests are reported by the aggregate release report. Hardware, actual device delivery, qualified coaching/clinical review and production behavior are separate gates. No production migrations, external sends or deployment are authorized here.

## Transparent target tracking and baseline-only choice (follow-up)

- Numeric targets may now remain as aspirations alongside an explicitly selected `baselinePlanOptIn` conservative plan. The setup/onboarding checkbox is off unless actually chosen. Target-specific progression still requires coaching review; existing adult, current restrictions, baseline age, interruption, available-day and load gates remain blocking.
- `/training` shows source-backed current-versus-target arithmetic, separate benchmark and manual-report cards, observation/entry dates, chosen plan horizon and target date. No confidence, success probability or predicted success date is calculated. Target fields never become current capacity or planning load.
- Exact comparison requires an explicitly selected matching sport and context: run 5 km average, cycling FTP, swimming threshold/CSS, or a described custom context. A run 5 km result is divided by five for average sec/km only; no 1.06 threshold estimate enters progress tracking. CP/LTHR/other-sport anchors are not substituted. Legacy goals with unknown context ask for clarification.
- The 90-local-calendar-day benchmark freshness window is an implementation policy requiring coaching sign-off, not physiological validity. Future timestamps, incomplete/skipped tests, missing, stale and incompatible evidence remain unavailable with reasons. No maximal testing is required.
- `GET /api/target-progress` is authenticated and athlete-scoped, with private/no-store responses. `POST` records optional manual reports in existing immutable `AuditLog` records (`target.measurement`) after current progress/setup revision checks inside a serializable transaction. Results preserve original value/unit, context, observation date, entry time and actor-derived source. Corrections append a new record and retain the original. Cross-athlete correction IDs and already corrected rows fail closed. Manual reports do not update benchmarks, profile capacity, or workouts.
- Units use exact SI/international definitions: minute = 60 seconds, mile = 1609.344 metres, yard = 0.9144 metres. Decimal-minute entry is labelled; speed/pace range conversion correctly reverses bounds. Power is never converted to speed or pace. Conversion is arithmetic only, not a model of training response.
- This feature adds no schema migration, external send or forecast enablement. Numeric progression, reviewed coaching/clinical rules, personalized forecast validation and hardware testing remain separate release gates.
