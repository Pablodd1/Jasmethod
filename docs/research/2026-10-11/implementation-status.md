# Evidence-backed workout library implementation

Local review branch based on `3be1c623`. No publication, deployment, production-data changes, real messages or device delivery occurred.

## What changed

Three new, separately selectable **JMM effort adaptations** use reviewed main-set structures. They are not exact physiological replications of the trials and are never default plan additions.

| Template | Exact app structure | Saved total |
|---|---|---|
| Running 10–20–30 | 10-minute JMM warm-up; 3 blocks × 5 cycles of 30/20/10 seconds; two 2-minute between-block recoveries; 5-minute JMM cool-down | 34 minutes |
| Cycling 60/75 | 10-minute JMM warm-up; 8 × 60 seconds; seven 75-second recoveries; 5-minute JMM cool-down plus 15 explicitly disclosed rounding seconds | 32 minutes |
| Cycling 4 × 8 | 15-minute study-duration warm-up with JMM execution cues; 4 × 8 minutes; three 2-minute recoveries; separate 5-minute JMM cool-down | 58 minutes |

Every step has an explicit time endpoint and open effort target. The app does not substitute FTP for ramp-test PPO, observed HR for a prescribed threshold, or a generic running pace for maximum speed. The source dose, population, result, limitations and adaptation are visible in the protocol workspace and included in coach retrieval and general research lookup.

The audit catalog contains 45 entries, including 30 distinct primary-study session main sets across 17 primary study families. Its other entries include coaching examples and frameworks. It clearly separates main-set verification, effectiveness, individual eligibility and actual runtime availability. This is **not** 30 Sisu workouts or 30 newly executable sessions. Exact Sisu imports remain limited as described in `sisu-coverage-and-findings.md`.

## Eligibility and integrity

- Current adult/injury/goal/experience gates remain in force. New recipes additionally require advanced/pro experience and an explicit confirmation of prior comparable-work tolerance in the selected sport. General experience and self-report are not medical clearance or independently verified sport-specific training history.
- New interval recipes replace an existing demanding session; they cannot upgrade an easy slot. Existing cross-sport load, same-day hard-session, adjacent-day and race checks remain. A conservative 14-day taper window blocks introducing these full-dose recipes; this is a disclosed product rule, not a biological cutoff.
- Only a full readiness verdict retains the new recipes. Reduced readiness or insufficient time pauses the recipe for easy movement; bouts and recoveries are never squeezed to keep the protocol name.
- Saved recipe structure is rechecked before effective display/export. Changed durations, recoveries, sports or numeric targets cannot retain the reviewed protocol label as authority.
- Unchanged legacy templates retain compatibility with the prior saved version. New recipes require current provenance and prior-tolerance confirmation.
- Preview/apply hashing, athlete-scoped transaction access, completed-workout protection and audit history are preserved. Athlete navigation clears tolerance confirmation and discards stale responses.
- All-out/SIT, specialist swimming/combat/heavy-lifting prescriptions and double-threshold remain review-only or unavailable. No new supplement or medical protocol is prescribed.

## Verification scope

Deterministic tests cover exact timing including between-only recovery and rounding, budget boundaries, missing tolerance, experience/injury/adult gates, readiness reductions, no easy-to-hard upgrade, taper blocking, saved-version compatibility, stored-structure integrity, general research/coach provenance, audit-count distinctions and canonical FIT encode/decode round-trips. FIT verification is file-level, not a watch receipt or physical-device acceptance test.

A local Chromium UI check was prepared with synthetic athlete/API fixtures and no production writes. Chromium could not start because this executor denies socket creation, including an approved escalated retry. The supported cloud browser also could not reach this executor's localhost server. Therefore rendered desktop/mobile interaction, accessibility and screenshot verification are **not passed**. No production authenticated athlete walkthrough, external provider acceptance, real delivery or on-device execution is claimed.

CodeRabbit CLI was not found in this environment's PATH; no automated CodeRabbit review is claimed. Source evidence and the new timing/gating logic received a separate read-only reviewer check. Local aggregate results are recorded in the parent review report after final source checks.
