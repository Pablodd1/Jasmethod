# JMM evidence to prescription contract

Review date: 7 October 2026. Baseline: Pablodd1/Jasmethod main at d185170ba02eba7d5c50087252a06e28166e6ecb. This is an implementation proposal. Except for the separately supplied local sprint-filter and no-session coach patches, the rules below have not been implemented or activated.

## What an executable protocol must contain

Keep sources, claims, example sessions and athlete eligibility separate. A scientific paper is not itself an executable prescription, and its study design is not a guarantee of applicable or high-certainty results.

A proposed protocol record needs:

- Stable protocol ID, version, reviewer and reviewed date; active, needs-review, superseded or withdrawn status.
- Source IDs with verified title, authors/year, DOI/PMID/official URL; primary trial, evidence synthesis, consensus, observational, expert practice or regulatory classification.
- Atomic claim IDs. Each claim records the studied population, modality, intervention, comparator, outcomes, limitations, certainty assessment and applicability. Store null where the paper does not report a field.
- Exact source-supported dose separately from JMM's proposed starting dose. Each number needs units, origin and uncertainty. A source that supports a principle must not be used to imply that it tested the entire JMM workout.
- Work repetitions, duration/distance, intensity anchor, recovery duration/intensity, warm-up, cool-down and total-time accounting. Unknown recovery is not zero recovery. A zone requires a named zone model and a valid sport-specific anchor.
- Preconditions, contraindication/review triggers, monitoring, stop criteria, progression evidence, alternative when ineligible, and an explicit athlete-consent requirement for optional additions.
- Mappings to consumer functions, source session revision, last assessment and trace output explaining every adjustment.

## Three states instead of false certainty

An eligibility result is eligible, blocked or insufficient-data, with machine-readable reasons. Missing data must never be silently converted to a favorable answer. Do not infer adulthood, supplement consent, equipment competency, recovery, experienced status, measured threshold or injury absence.

Where quantitative prescription is unavailable, retain useful general educational guidance and explain what is missing. Do not manufacture a body mass, FTP, race time, lactate threshold, sweat measurement or daily readiness value. Estimates must retain an estimated label downstream.

## Candidate integration map

| Surface | Existing inspected behavior | Required next step |
| --- | --- | --- |
| src/lib/research.ts | Legacy bibliography | Retain IDs; reconcile claims with verified source metadata and unsupported wording. |
| src/lib/evidence-registry.ts | Structured claims with tier/certainty/status | Add source verification and population applicability; do not let the existence of an ID authorize a numeric prescription. |
| src/lib/protocols.ts | Eight executable protocol categories for run, bike, swim and strength | Add explicit principle-versus-dose provenance and population review. Extend sport-specific libraries only with verified records. |
| src/lib/sprint-protocols.ts | Retrieval library plus hardcoded sprint menus | Fail closed for unknown evidence filters; audit numeric confidence, rest and claim-to-menu mapping separately. |
| src/lib/science.ts | Multiple sport generators and zone calculations | Route proposed protocols through supported sport/event and goal-specific eligibility. Do not treat session-label percentages as measured physiological time-in-zone. |
| src/lib/protocol-scheduling.ts | Cross-sport demanding-session caps and adjacency checks | Preserve existing safety checks. An optional double-day needs a separate eligibility/consent flow, not an exception that bypasses load accounting. |
| src/lib/fueling.ts | General-education fueling plus detailed practice/turnaround inputs | Persist and wire contextual records end to end before saying these inputs personalize the product. |
| src/lib/sprint-prescription.ts | Legacy standalone sprint arc | Audit unconditional ergogenics, fixed recovery urgency and exact stop thresholds against the new evidence catalog. Do not assume the general fueling engine already governs this path. |
| src/lib/race-fuel.ts and supplement-db.ts | Separate race and supplement surfaces | Unify source IDs and preference/safety semantics without erasing sport/format distinctions. |
| src/app/api/protocols/route.ts | Athlete-scoped preview/apply transaction and revision token | Preserve isolation, preview freshness, audit history and time-budget validation; validate missing age explicitly before adult-only advanced work. |
| Today, check-in, race, J Koach, messages and export | Multiple downstream outputs | All must consume the same canonical revision and verified eligibility result; stale caches cannot reintroduce superseded prescriptions. |

## Missing data rules

| Missing or unreliable input | Required behavior |
| --- | --- |
| Age/adult status | No automated adult-only high-intensity or supplement protocol. Ask for eligibility data without assuming adulthood. |
| Pain, illness, medical limitations, concussion status or clearance | Pause relevant high-risk progression and seek appropriate qualified review; no diagnostic automation. |
| Sport/event/goal | No event-specific numeric prescription by guessing from recent activity. |
| Threshold or maximum-speed anchor | Use clearly labeled general effort cues where appropriate; withhold falsely precise measured zones. |
| Test date/protocol/modality/units | Treat the anchor as unverified until reconciled; never interchange running pace, swim pace, cycling power and HR cutoffs silently. |
| Training history or prior tolerance | No automatic advanced volume, maximal sprint, heavy technical lift or double-hard assignment. |
| Session duration or work/rest definition | Do not export an executable protocol whose total load or time cannot be calculated. |
| Body mass | Withhold g/kg- and mg/kg-derived totals; provide qualitative food-first guidance. |
| Carbohydrate-practice record | Do not infer high-intake readiness from a gutTrained boolean alone; record dated dose, mixture, sport, duration, intensity, conditions and symptoms. |
| Next-session time | Do not assert a short-turnaround recovery window. Ask or provide ordinary recovery meal guidance. |
| Sweat rate/sodium | Label any educational example as unmeasured. Do not present it as measured replacement or force a fluid target. |
| Supplement consent, current use, contraindication review | No automatic individualized supplement stack. Opt-out and known contraindications win over all defaults. |
| Athlete agreement for two sessions | Keep the single-session plan. An inferred performance goal is not consent to an extra session. |
| Coach review for a proposed double-hard day | Withhold it. No universal weekly double-hard rule. |

## Optional double-session state machine

This is a proposed product safety design, not a validated medical eligibility algorithm.

1. Explain the purpose and alternatives. Distinguish easy plus skill, strength plus endurance, and two demanding sessions.
2. Obtain specific athlete agreement on the day and both sessions. Permission must not be inferred from an unselected default.
3. Check reliable age, relevant training history, previous tolerance, recent and scheduled load across sports, symptoms, recovery, logistics, food/fluid access, available separation and near-term competition.
4. Reject or request review when material information is missing, when symptoms suggest risk, or when total load/time exceeds the agreed plan. Two hard sessions require explicit qualified-coach review and are not an automatic default even after consent.
5. Preserve the priority session's quality; account for both bouts in weekly load and the next-day plan. Do not prescribe a universal separation interval as a biological guarantee.
6. Link food/recovery guidance to the actual interval between sessions and the athlete's practiced intake.
7. Reassess after session one. Cancellation or downscaling is a normal outcome; the athlete can decline without punitive motivational language.
8. Save provenance, agreement, edits and outcomes against one canonical plan revision. If the first session or readiness changes, invalidate the prior preview.

## Acceptance test matrix

These are required future tests, not tests claimed to have passed.

- Reject unknown, blank, case-mismatched and misspelled evidence tiers; unknown source/claim/protocol IDs cannot authorize an executable dose.
- A recognized tier with an unverified source or incompatible population still cannot pass prescription eligibility.
- No evidence filter requested retains retrieval behavior, but retrieval never implies permission to schedule.
- For every supported generator, verify warm-up plus work plus rest plus cool-down fits time and frequency budgets after scaling.
- Unknown age, pain flag, novice status, missing competency and unavailable equipment block their relevant advanced protocols.
- Confirm all zone model boundaries with test type/date/sport/unit provenance; time-in-zone is not inferred from one label per session.
- Zero, negative, nonfinite and implausible nutrition inputs cannot produce apparently valid doses. Missing mass yields no weight-derived total.
- Missing practice, GI symptoms, inconsistent target or outdated context suppress unsupported high-intake progression.
- Missing turnaround does not trigger urgent restoration. Actual short turnaround changes relevant guidance on all consumer surfaces together.
- Missing supplement consent, opt-out, duplicate caffeine sources, known adverse reactions and unresolved contraindications suppress automated recommendations consistently.
- Double-day refusal, missing consent, unavailable separation, missing history, poor recovery and changed first-session actuals block/revise the second session.
- Double-hard is never inserted by a universal weekly quota. Hard work from boxing, HYROX, sprinting, lifting and endurance is counted according to explicit documented rules.
- Revision conflicts invalidate previews; multi-athlete authorization and audit records remain correct; no route success before durable verified write.
- UI, API, messages, race guidance and device export agree on the same approved session revision. Provider API acceptance is not watch receipt.

## Release gates

Run the repository's full TypeScript check, tests, lint, build, integration tests and authenticated scenario acceptance in an authorized checkout. Review the final diff for security, athlete isolation and false-success states. CodeRabbit review was not available in this local workspace. No deployment or remote repository write is included in this package. A reviewed document is not a live product update.
