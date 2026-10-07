# Reviewed performance evidence: runtime implementation

This draft integrates selected reviewed principles; it is not a claim that every
source in the dossier is executable or that the model was trained on the papers.
Huberman/Galpin material is expert education, distinct from trial/synthesis
findings. No affiliation or endorsement is claimed.

## Implemented in this change

- `reviewed-evidence.ts`: curated claim identity, source URLs, review status,
  applicability, limitations and principle-only numerical authority. Protocol
  builds fail closed for unknown/inactive/unverified claim references. Exact
  JMM menu quantities retain a separate `jmm_starting_template` origin.
- Corrections to the legacy Schoenfeld volume, Helgerud trial and Schumann
  concurrent-training entries; inactive claims are excluded from citation
  validation. This does not certify every legacy bibliography entry.
- Protocol API checks missing/uncertain adult status, experience and goal;
  beginner maximal-speed/anaerobic work needs review. Old protocol revisions are
  held by the effective-session boundary, not silently reactivated on export.
- Canonical load review holds two demanding or unassessed sessions on a day,
  including existing hard replacements, actual sport/duration and expanded
  steps/explicit targets. Urgent symptoms retain priority. This is a conservative
  product guard, not medical clearance or a validated biological threshold.
- Unknown sprint evidence filters fail closed. The coach cannot invent a workout
  merely because readiness looks good when there is no assigned session.
- Versioned `AthleteProfile.nutritionContext` plus a structured optional Settings
  editor. Writes use the existing athlete-scoped optimistic-revision transaction
  and audit. Explicit null clears; unrelated updates preserve the field.
- Strict dated practice, measurement and session-bound turnaround validation.
  A 90-day review window is app policy. Missing current conditions constrain
  practice-guided carbohydrate examples to at most 60 g/hour (or lower recorded
  tolerance/selection); the current daily workflow does not collect conditions.
  Self-reported high-intake review never authorizes >90 g/hour. Stored flags are
  not qualified review or clinical approval.
- One effective-session nutrition result supplies `/api/today`,
  `/api/v1/training/today`, training reminders, Google Calendar sync and the
  training ZIP/ICS export. It uses the canonical profile/session snapshot and
  is absent for held/rest sessions. Nutrition context participates in the
  canonical revision. Recovery PER HOUR wording and non-compulsory hydration
  examples survive downstream formatting; private GI/free-text records do not
  appear in routine reminders/calendar text. Supplements are not auto-added.

## Deployment and migration

The additive migration adds one nullable text field. This PR does not apply it
to production, deploy, merge, edit athlete plans or create production records.
Apply migrations through the normal reviewed release process before deploying
code that queries the new field.

## Remaining work and limits

- Optional weekly double days now have athlete-owned weekday, purpose, times,
  prior-tolerance, food/fluid and between-session recheck confirmations. Plan
  generation moves one existing easy bout, adds no weekly load, preserves daily
  limits/rest rules, and records both session IDs/snapshots after explicit athlete
  preview acceptance. If no safe pair fits, the single-session schedule and
  specific reason remain visible. No weekly quota or double-hard assignment.
- The optional second bout waits for explicit first-session actual duration,
  sport and effort plus a later check-in. Setup/consent changes, skipped first
  bouts, changed snapshots and prescription edits hold it. Imported completion
  without explicit comparable actuals is not automatically sufficient. The
  current supported order keeps the priority session first and the easy bout
  second; reversing priority or double-demanding pairs needs a separate review.
- Standalone planned sessions and reported actuals are included in same-day load
  review. New plans keep single-session days unless an eligible pair was expressly
  selected. Existing untagged easy pairs are unchanged; demanding/unassessed pairs
  remain held. Authenticated synthetic acceptance tests exercise the new workflow.
- This is not a complete five-sport protocol expansion, full legacy generator
  rewrite, sprint-prescription replacement, or unified race/supplement engine.
  `sprint-prescription.ts` currently has no runtime consumers and remains an
  unaudited legacy template. Race forecast/fuel and supplement-library surfaces
  are outside the five shared daily consumers enumerated above.
- Birth year alone cannot verify a person's eighteenth birthday in that year;
  those accounts remain held pending a suitable age-review workflow.
- Equipment competency, population eligibility, individual contraindications,
  anchor provenance and practice context still need relevant athlete/coach input.
  A citation, checkbox, review timestamp or performance goal never substitutes
  for these facts.
- No provider/device delivery or hardware execution is established by unit tests,
  a successful build, an encoded FIT file or GitHub CI.

The source dossier's `implementation-contract.md` records the broader proposal;
this file distinguishes the subset implemented here from remaining requirements.
