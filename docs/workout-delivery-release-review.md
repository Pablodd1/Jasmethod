# Workout delivery release review — November 15, 2026

PR #134 merged at 4dc4920. The PR verification job passed. This checklist tracks product acceptance separately from CI.

| Priority | Acceptance check | Evidence or gap |
|---|---|---|
| P0 | Open the athlete's saved week and compare planned and adjusted steps before and after check-in. | The app preserves a saved planned snapshot. Older entries without structured steps and the athlete's current cycle still need live review. |
| P0 | Receive Gmail, Google Calendar and Telegram previews before training. | Gmail and opted-in Calendar support saved step text. Advance Gmail graphics and Telegram details and graphics are missing. Calendar has an authenticated link; embedded graphics are unverified. |
| P0 | Receive the exact approved FIT, import it on a compatible Garmin and follow work, rests and alerts. | Approval-gated FIT paths exist. Receipt, import and watch alerts require live evidence. Direct Garmin sync is a separate check. |
| P1 | Generate complete sport-specific weeks and verify targets, warm-up, main set, transitions and recovery. | PR #134 covers selected endurance recipes. The full library and live evaluation for run, bike, swim, triathlon and HYROX remain open. Include profiles without wearables or measured thresholds. |
| P1 | Use Koach voice to modify one workout, confirm, then verify the revision on every enabled channel. | The approved synthetic live AI text test passed earlier. Microphone, correct session selection and end-to-end revision delivery remain unverified. |

Record the deployment revision, athlete test scenario, exact workout revision, channel outcome and watch observation before marking a row accepted. Use synthetic accounts for cross-sport tests and retain private account evidence outside Git.
