# Initial assessments and post-workout review

## What was already working

Today already saved outcome, actual minutes, session effort, actual sport, notes, optional before/after weight and optional fueling through the existing audited, revision-checked workout update. The fields were reached through the general result action and were easy to miss. Imported measurements are reused for review rather than copied into a new activity. Planned minutes are never actual minutes.

Saved minutes and RPE already enter the source-permitted daily execution review. The existing integration scenario verifies that a dated hard-effort report changes a subsequent adaptation. The scenario now also verifies persistence of optional before/after weights and notes on that same record. This change does not introduce new training-dose formulas.

Weight is stored for the session and supports the existing net mass-change and reported mass-balance hydration calculations. Sweat-rate estimation requires actual time, explicit fluid and urine reports as well as before/after weights. Weight alone does not establish sweat sodium, recovery, body composition, performance capacity or a higher training load. Notes remain available for review and do not independently diagnose or change a dose.

## Updated athlete flow

- A visible After training section beneath the workout opens the existing report. Basics and notes precede optional weight and fueling. Already recorded basics lead to review wording rather than another mandatory questionnaire.
- One unambiguous actual record can open directly. Multiple records, or a different unmatched plan, still require explicit selection. A plan linked to an imported activity continues to use the exact linked record. No duplicate activity is created.
- Saves retain existing ownership/revision checks, failure drafts and verified receipts. An in-flight guard prevents duplicate submissions from repeated clicks.

## Assessments

Baseline recording is grouped by running, cycling, swimming, multisport, and the running component of HYROX. Multisport retains independent sport references; it has no combined invented result. HYROX station results remain in their existing owner-only editor. Manual measured-result recording and explicit baseline application remain separate.

The authenticated benchmark read checks stored performed-activity presence, manual personal-record status and completed measured tests. An empty-history assessment offer is shown only when all three are absent. Malformed personal records are a review condition, not an empty history. Presence is not proof of usable capacity or threshold validity. Reads are athlete-scoped and private/no-store; these counts do not enter external AI.

New athletes are directed to review the existing bounded observation-week preview, which must be explicitly confirmed before it is saved. Existing activity/event days and active plans are preserved. Comfortable observations are not maximal FTP/VO2 tests and do not create physiological anchors. Existing cycles already contain sport-specific comfortable observations when eligible; their safety, event and availability constraints remain in force. This change does not silently schedule a maximal battery or replace an athlete's cycle. Choosing a measured protocol or adding an assessment to an existing cycle still requires review.

## Acceptance scope

Checks cover sport filtering, independent multisport selection, absent versus unreadable evidence, result targeting, EN/ES mobile result entry and reload, optional weight conversion/preservation, failed saves, and the existing real HTTP/database late-feedback adaptation scenario. No production athlete records, credentials, provider integrations or schema migrations are changed. Engineering acceptance does not establish clinical validity or optimal individual coaching.
