# Koach workflow pilot

These workflows use the existing athlete account, local training engine, proposal confirmation, and provider receipts. No database migration or provider activation is required for the Koach UI.

| Athlete request | What Koach does | What still needs review |
| --- | --- | --- |
| “My swim pace is 1:45 per 100 meters.” | Asks whether this is a training observation or a CSS reference. It makes no proposal until the athlete supplies the pace, its meaning and observation date. | Try “My swim training pace was 1:45 per 100 meters yesterday.” Confirming adds a dated observation without changing CSS. An explicit dated CSS proposal is an athlete-reported reference, not a verified test or a rewritten cycle. |
| “Change tomorrow’s bike to 45 minutes indoors because it’s raining.” | Locates one eligible cycling session on the athlete’s date, or asks the athlete to choose if there is no unique match. The duration and indoor flag appear in the same review. | Review the session and confirm. The write updates the existing workout and invalidates previous workout approval; it does not create or publish a workout. Text and reviewed voice use the same path. |
| “I finished a hard bike-run brick yesterday. My legs feel heavy and I slept poorly.” | Opens a local recovery review and points to the recent activity and the existing check-in. | Confirm actuals and recovery inputs in the existing forms before reassessment. The message alone does not save ratings, authorize exercise, or change training. Current symptoms requiring safety review take precedence. |
| “My workout is not in Garmin Connect.” | Shows the selected session’s last locally recorded Garmin attempt, or reports that no receipt exists. | A verified schedule is not watch receipt. The card makes no Garmin call and does not send, retry, or activate publication. |

Protected workflow requests are excluded from optional external dialogue and replay. Existing per-request consent, owner-only access, stale-revision rejection and receipt rules still apply. Creating new threshold interval workouts from open-ended chat, verified lab physiology, durable preference memory and real device acceptance remain separate work.
