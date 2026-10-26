# Mobile training, races and venues

## Interface contract

The athlete should find their plan, understand the next required action, and
save a race without navigating a wall of optional technical inputs. Preserve
existing reviewed preview/confirmation, tenant isolation and provenance gates.

- Shared navigation: Your basics → Your plan → Races. These are destinations,
  not an enforced sequence; a race and a device remain optional.
- Race minimum: name, explicitly selected distance/format, date. Venue may be
  added later. Missing venue remains visible, never inferred from the name.
- Timing/goal, course/weather and swim details expand on request. Empty numeric
  fields remain empty. Weather still requires the explicit sourced workspace.
- Saved races retain date/priority editing and now support venue corrections.
- Existing training stays primary. Export explanation and targets/rest controls
  are secondary disclosures. Plan preview and confirmation stay explicit.
- Phone inputs use 16px text and 44px minimum height; disclosures are touch sized.
- Targets: 390×844 phone and 1280×844 desktop, English and Spanish.

## State checks

Loading: announce saved-race loading and disable new saves. Empty: explain that
training does not require a race. Error: retain rejected drafts; failed list
reads offer retry and disable creation. Partial: explicitly show missing venue
and unknown course/weather. Success: confirm the returned record receipt and
reload saved state. Permission: preserve existing sign-in protection and explicit
provider lookup/AI consent boundaries; navigation does not grant access.

`scripts/jmm-mobile-organization-browser.cjs` exercises these states using
synthetic browser API fixtures, captures ten steps per language/viewport, and
fails on overflow, browser errors or unexpected provider requests. Existing
PostgreSQL workflow acceptance independently checks actual persistence and
ownership. Screenshots are UI fixtures, not evidence of production athlete data.

## Attached addendum review (A → E)

The attachment also asks for a separate data/engine redesign. This interface
change does **not** claim that redesign is implemented. The following mapping
records what exists and what remains to be implemented/reconciled:

| Section | Existing source of truth | Remaining work / ambiguity |
| --- | --- | --- |
| A: entities | AthleteProfile + reviewed PlanningSetup; DailyMetrics, MetricObservation, DailyCheckin; BenchmarkTest; BloodPanel/BloodResult; GeneticResult/GeneticVariant | No new parallel profile/signals/baseline tables were created. Define migration/backfill and owner-scoped APIs before introducing completeness, decline counters and extra fields. Preserve HYROX and existing sports; preserve adult-pilot eligibility. Birth year cannot silently become a precise age. |
| B: readiness | daily-input-context.ts, checkin-safety.ts, daily-recovery.ts, effective-prescription.ts | A new normalized readiness contract is not wired into the engine. Device sleep 0–100 and check-in sleep 1–5 cannot be interchangeable bare numbers. HRV requires a compatible dated baseline and provenance. Staleness cannot convert unknown safety to clear. Replacing the current interfaces requires regression coverage of all canonical consumers. |
| C: completeness/deferrals | Missing/review lists from assessPlanningSetup; editable drafts and optional disclosures | No computed score, session-count trigger or seven-day/two-decline persistence was added. “Best guess” may only be a hypothetical sensitivity comparison, never saved athlete truth. Empty profiles must render a held state, not an executable guessed workout. Calibration level 3 is not validated from an empty profile. |
| D: blood/DNA | Existing optional result models | No new biomarker dose rules or DNA-driven volume changes were enabled. The proposed thresholds omit units, assay/context and abnormal ranges; retest/reminder timing and load effects require a reviewed specification. Explicit clinician restrictions must remain distinct from inferred diagnoses. Low confidence does not by itself validate a genetic prescription. |
| E: AI contract | ai-data-policy.ts, coach-personal-context.ts, coach-text-provider.ts | External AI remains fixed topic/language/reviewed catalogue only. Rich readiness/profile/sessions/blood/DNA context is not approved for outbound processing. A future rich context builder must be local-only and provenance-aware; it cannot bypass the current policy by renaming a derived summary. No legacy memory was re-enabled. |

These are implementation blockers for the addendum, not reasons to block the
mobile layout improvements. No schema migration, credential, provider permission,
connector activation or production athlete record is changed by this PR.

## Daily structure follow-up

Today now leads with one compact section: the current cycle week, recorded
minutes before today, upcoming planned minutes, and the canonical daily review
status. A disclosure lists the next three saved sessions. The check-in questions
come before devices, recent activity correction, voice input and the optional
focus task. Existing safety/recovery questions remain unanswered until the
athlete answers them; device readings do not fill subjective symptoms.

The optional week reader uses the athlete's timezone, Monday–Sunday bounds,
current-plan ownership and existing source/reconciliation rules. No-data actuals
stay unknown; missing durations, duplicate identifiers, unresolved overlaps,
restricted sources or truncated reads withhold totals. Upcoming minutes come
only from unfinished sessions in the current cycle. Query failure or foreign
disclosure restrictions omit this optional context without hiding the saved
session. Week summaries are local display only and do not enter external AI.

This is a clearer view of the existing canonical adaptation and plan-review
workflow. It does not introduce a new readiness score, use week totals to
silently increase dose, or automatically replace future training. Changes to a
cycle still require the existing reviewed preview and explicit confirmation.
The optional Stroop task is task history, not physical readiness or clearance;
unsupported comparative labels were removed. Its save indicator now requires
an actual saved-record receipt, with a visible failure state.

Additional verification: seven week/context/store tests cover real versus
planned minutes, missingness, duplicates, source restrictions, timezone bounds,
owner scoping and unavailable storage. The existing EN/ES daily-flow browser
journeys now capture device/no-device/skip states and exercise failed and
successful optional-task receipts. Full check-in and plan-review boundary tests
remain in CI.

