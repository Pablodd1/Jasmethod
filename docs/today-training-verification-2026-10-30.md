# Today, readiness and cycle verification

## Finding

The supplied live screenshots do not justify claiming that every athlete has a coherent, executable prescription. They show a swim record retaining a running headline and an unavailable saved structure. Repeated readiness controls also obscure the planned session.

The sport-edit writer changes the selected sport and invalidates the old structured prescription. It previously retained the old title. This change gives an implicitly renamed sport edit a neutral sport-specific title, repairs recognized contradictory generated prefixes in the canonical display, and keeps missing steps unavailable. It does not reconstruct a swim from running steps, rewrite completed history, approve a workout or replace a cycle.

## Athlete flow

1. Show usable health readings first, with the stored source and local observation date. A connected provider or recent sync is not proof of fresh, complete measurements. Stale, conflicting, offline and unavailable readings are not displayed as current. Apple Health is named as the stored source; no Apple Watch delivery/import certification is implied.
2. Keep cycle/week context expandable, including saved cycle name, dates and event date when supplied. Past totals are recorded work; ahead is the saved plan.
3. Reuse valid imported numeric values. An optional check-in can adapt to current subjective recovery, symptoms and available time; measurements do not answer those questions.
4. When same-day usable sleep duration, resting HR and one HRV method are present, the initial view opens the saved plan; this does not establish readiness or approve an adaptation. Athletes can open daily review. When those measurements are incomplete, offer check-in or skip. Skip changes presentation only: show the actual saved planned structure, hide repeated readiness controls, and keep the view read-only. No POST, automatic answers, approval, export or delivery. Known illness/injury/urgent holds remain visible and cannot be hidden by this path.
5. If structure is missing, show the saved sport/time when available and one structure-review action. Keep the detailed explanation expandable instead of a large repeated warning. No pace, power, distance, repetitions or readiness is invented.

## Code path reviewed

- `api/plan/generate`: requires reviewed planning setup, the saved goal, dated baseline evidence and availability; reads events, recent activity, benchmarks and source audits. It bounds weekly volume, shapes the cycle around events/recovery, produces a preview and requires a current preview token before saving. Rechecks source/profile/setup state in its transaction. Race days and completed training remain protected.
- `training-cycle`, `cycle-events`, `cycle-review`: periodization, event priorities, recovery/taper constraints, dated sport-specific references and baseline observations.
- `daily-input-context`, `checkin-safety`, `effective-prescription`, `canonical-session`: separate objective readings from subjective safety/time; resolve daily execution locally; validate structure, targets and revisions. HRV rMSSD and SDNN remain separate. Skipping does not establish normal recovery.
- `training-week-review`: reconciles actual records and preserves missing/overlapping/restricted history; planned minutes are not completed minutes.
- `canonical-fit`, advanced triathlon and fueling tests: sport-specific numerical targets, bounded generic swim duration, five-zone decisions, unit calculations, and decoded export structure.

These are implemented/tested engineering rules, not clinical validation or proof that a specific athlete's plan is optimal.

## Remaining limits

- Existing saved cycles are not automatically rebuilt after profile, goal, race or availability edits. A freshly reviewed preview is required to replace future training. This change does not certify every older cycle against the athlete's current goals.
- The affected swim record still needs an explicit structure review or a newly reviewed session. Changing its headline does not supply its missing workout.
- No real WHOOP/Oura/Apple/Garmin account was connected or exercised for this verification. Synthetic health records establish UI and freshness behavior, not provider transport acceptance.
- Full individual coaching acceptance still requires reviewing that athlete's current profile/baseline, race priorities, weekly schedule, saved cycle and representative daily workouts, including pre/during/post targets, fueling and completed-work feedback. Restricted device/derived records stay inside JMM and are not sent to external AI for that review.
- External chat configuration is separate from deterministic plan generation. This work adds no provider, AI fallback, credentials, migration or external transmission.

## Evidence

Local initial suite: 2,114 tests passed. New tests cover current/stale/conflicting/offline health sources, skipped display, actual safety holds, sport-edit identity and missing-structure behavior. Browser acceptance adds EN/ES planned-view screenshots and asserts that skipping creates no mutation or approval. Exact-head CI, browser evidence, review and production acceptance are reported in the accompanying PR; local checks alone are not target acceptance.
