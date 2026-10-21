# Athlete daily-flow contract and verification

Confirmed product contract reviewed 21 October 2026. This document records the user's daily-flow requirements for future maintainers; it is repository memory, not a claim that draft changes are deployed. It does not establish validated race predictions, device receipt, or unrestricted AI coaching.

## Daily training: saved plan versus execution

1. Open Today: read the owner-scoped current plan for the athlete-local day first. Show its saved sessions while richer context loads. Viewing a plan does not require a questionnaire and does not approve exercise.
2. Refresh supported providers in the background, with visible failure/partial status. A successful sync means provider contact, not proof of current measurements, complete history or watch receipt.
3. Use current, quality-checked, permitted observations before asking for numbers. Keep provider, units, observation/import dates and limitations. Conflicting readings, unknown provenance and stale data remain unresolved. Sleep hours do not answer sleep quality; wearables do not answer illness, new pain or urgent symptoms.
4. The full check-in remains available. An eligible, unchanged, timed easy session can instead use a **short review**: the athlete explicitly confirms current symptoms, unchanged recovery concerns and displayed remaining daily time. The five subjective scales stay null; no readiness score or additional training is invented. This is a scoped confirmation for one session, not medical clearance or a new coaching engine.
5. Hard or uncertain sessions, setup gaps, insufficient activity provenance, actual-work uncertainty, known safety/recovery/time restrictions and changed context require the fuller review. Resetting a form must not erase a known restriction. Zero available minutes is an explicit no-training-time answer; an unanswered field is unknown.
6. Review/edit the existing session, then separately approve the exact current canonical revision. Editing, reconciliation or new actual feedback can invalidate approval. Repeated reads, confirmations and retries must not create another workout. Supported FIT/file export is distinct from automatic delivery and destination receipt.
7. For imported completion, show known actual duration and ask only for missing effort/outcome. Corrections use the shared revision-aware writer. Never substitute planned duration for performed duration. Feed permitted actual work through the existing execution/readiness services; no automatic intensity increase or catch-up debt follows a completion.
8. Keep one authoritative plan, existing cycles and canonical instructions across Today, coach, calendar, messages and exports. Preserve real multiple sessions, bricks and reported history. Duplicate review starts with a dry run; ambiguous records require explicit review, not deletion or added capacity.

Executable boundaries: `daily-input-context.ts`, `effective-prescription.ts`, `existing-workout-review.ts`, `checkin-review-service.ts`, the shared workout writer and existing canonical/export services. These additions retrieve evidence and authorize an existing easy session; they do not replace generation, safety scoring or the workout store.

See [acceptance lanes](testing/athlete-release-candidate.md), [input evidence and limitations](testing/daily-input-evidence-2026-10-21.md) and [dated integration capabilities](integrations/2026-10-21-capabilities.md). Re-evaluate those dated facts before enabling an external path. Preserve the bilingual contact/FAQ/booking flow and the supplied booking destination: https://cal.com/videocall-intro/15-minutes-overview.

## Explicit sport authoring

Within the workout card, open **Share, device & edit → Edit steps, sets and rests**.

- Pool: enter pool length/unit, stroke, lengths, phase, estimated time and explicit rests.
- Strength: enter reviewed exercise sets, endpoints, estimates and optional practiced load.
- HYROX: enter ordered runs/stations, time/distance/repetition/manual endpoints, estimates and optional practiced loads.
- All dose fields start blank. Unsupported advanced structures retain their complete JSON instead of losing fields during conversion.
- Saving uses the existing owner/revision/history/admission checks. A conflict requires review. Completed or otherwise recorded history is protected.
- Saving a structure does not approve or deliver it to a watch. Generated prose still does not prove station capacity or establish a practiced load.

## Actual fueling feedback

Today, Daily Training and Check-in's previous-session report accept optional total carbohydrate grams, total fluid milliliters and reported gut symptoms.

The shared workout writer stores a versioned `actualDetails.fueling` sibling, preserving reported distance/repetitions/load and other metadata. Omission preserves values; explicit null clears only the requested data; zero remains zero. Reload exposes the same reported values.

Hourly arithmetic uses positive **actual** duration only. Planned duration is never substituted. These observations do not automatically increase future carbohydrate intake, establish gut-trained capacity, or change supplement recommendations.

## Durable HYROX results

`GET/POST /api/hyrox/results` is private to its athlete. Explicitly confirmed actual local date, division, scenario inputs, 16 nullable segment times and optional total transitions are saved as immutable `hyrox.actual_splits.v1` audit snapshots. Corrections append snapshots. Stale revisions return 409.

Reload restores saved results and permits selecting earlier snapshots. Missing segments/transitions stay unknown; a complete finish total requires all 16 segment times plus an explicitly reported transition total. Results are athlete-reported, not independently verified race/device records. Saving changes neither profile capacity nor training.

## Review connected history before editing a baseline

The existing onboarding review shows four completed Monday–Sunday weeks in the athlete timezone, raw provider records, duration coverage and possible same-sport cross-provider starts within 60 seconds. These are possible overlaps, not verified duplicate sessions. Both source records remain intact.

Recorded-minute ranges show overlap interpretations. Missing weeks/durations remain unknown. No average is offered with possible overlaps, missing durations or truncated history. The endpoint reads at most 2,001 rows and discloses a 2,000-row review limit. An observed average is not demonstrated tolerated capacity.

An explicitly reported weekly baseline is never silently replaced by raw import counts. The athlete reviews completeness, tolerability and recovery, then edits and confirms the existing setup if appropriate.

## Earlier verification — 15 October 2026

- 1,423 unit/contract tests passed; TypeScript passed.
- Production build passed against the isolated database and sanitized configuration.
- Lint passed with two existing hook warnings outside this change.
- Real isolated HTTP/Postgres checks verified fueling persistence, actual-duration arithmetic, zero/unknown/clear semantics, owner rejection and unchanged nutrition profile.
- Real isolated HTTP/Postgres HYROX checks verified save/reload, future-date rejection, unauthenticated/cross-athlete denial, revision conflict and unchanged profile/workouts.
- Browser pool form save produced the entered 25 m pool, four freestyle lengths (100 m), estimated interval time and 30-second rest on the canonical card.
- CI includes the reusable fueling acceptance under the loopback egress guard.

## Remaining launch gates

- Existing unmatched cross-provider copies can still inflate daily load/budget summaries. This review exposes uncertainty; it does not reconcile historical records or change load calculations.
- Provider connection alone does not prove complete history import. Current provider pagination/lookback limits still apply.
- End-to-end OAuth, refresh, scheduled external email/Telegram delivery and watch receipt require their real consent/configuration and live receipts. No mock test proves those external outcomes.
- Nonstandard triathlon leg lengths must be entered explicitly in a course scenario; a generic half-distance label or note is not a measured course.
- Numerical personal race forecasts remain behind the existing validation gate.
- The current optional chat text provider is a bounded educational selector. This release does not migrate it to DeepSeek or turn it into an unrestricted personal prescriber.

No database migration, dependency addition, account credential change or automatic historical-data rewrite is required.
