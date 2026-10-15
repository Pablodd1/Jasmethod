# Athlete launch workflow and verification — 15 October 2026

This change closes specific athlete workflow gaps. It does not establish validated race predictions, device receipt, or unrestricted AI coaching.

## Daily training: saved plan versus execution

1. Owner-scoped Today reads the athlete-local day, saved cycle, planned sessions, imported activity and check-in.
2. Missing check-in answers produce a compact **Check-in needed** notice. The saved workout remains visible as a read-only preview. Missing answers do not establish illness or a rest day.
3. A canonical block after an otherwise complete check-in produces **Review training**, for example when activity was recorded after the previous review.
4. Actual illness, pain, injury and urgent holds retain their priority. Neither presentation change clears a workout, creates performed activity, or enables optional movement.
5. The daily cue asks for review instead of calling a zero-minute held prescription a recovery-day decision.
6. Existing session-day check-in and budget calculations remain authoritative for executable targets and FIT eligibility. A saved cycle is not replaced by changing a race.

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

## Verification

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
