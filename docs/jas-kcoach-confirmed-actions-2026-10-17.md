# Jas KCoach: conversation, confirmed edits and human review

## Why replies felt unresponsive

The visible chat normally used deterministic rules. The optional DeepSeek control was hidden and reset after every send; it could only supply advisory prose. A small literal grammar generated proposals. A natural request outside that grammar produced a generic local reply. DeepSeek did not receive any of its earlier replies, so follow-up questions lacked that context. A proposal could also remain folded away below the composer.

## Current workflow

1. Open `/coach` or the chat on Today. AI availability and the permission switch are visible. The switch starts off. Opting in covers subsequent sends while this component/page stays open; clearing, leaving or reloading revokes it. It is not saved to local storage. Image processing has separate per-image consent. Optional prior-AI-reply memory is separately off until chosen.
2. Questions use owner-scoped saved JMM context. DeepSeek receives the disclosed, bounded manual-only context. Imported/device/Strava data and generated plans with unverified ancestry are excluded from that export. Local athlete summaries can remain visible beside an AI reply, stored separately and excluded from model memory.
3. Common explicit changes work locally, such as “Change my weight to 75 kg” or “Make today's run 45 minutes at zone 2.” A dated edit binds automatically only when exactly one unfinished planned workout belongs to this athlete on that local day. A visible selector handles multiple sessions and other dates.
4. For requests outside the local grammar, opt-in DeepSeek can return structured **proposals**, alongside its reply. The model cannot choose athletes, record IDs, dates, database operations or approvals. JMM requires current-message evidence, literal supported quantities/units or enumerated values, and validates the field allowlist. Negated, hypothetical, third-party, ambiguous-date and unsupported changes fail validation. Bare “yes” does not create or apply changes.
5. The proposal opens visibly. The athlete reviews the date, workout, units, value and warnings, selects the correct fields and confirms. A normal preference can still be proposed after a recommendation against it. Increases show their relationship to the saved duration/intensity. Confirmation does not waive symptoms, rewrite completed history, convert a reported FTP into a reviewed benchmark, or clear exercise.
6. Only the authenticated confirmation service writes. It checks original profile/workout revisions, proposal generation, dates, expiry and idempotency, then calls the shared profile/workout writers and retains provenance. Workout edits remove prior approval and preserve the required prescription/check-in review. No watch delivery is implied. New facts are read from the saved records on the next turn; this is contextual coaching, not model fine-tuning.
7. When a local safety/unsupported reply or the AI flags uncertainty, the athlete sees the human-review option. They preview the exact question and confirm sharing it in the existing athlete–coach conversation. Only coaches with active, granted assignments and platform administrators can read it. The full private chat is not shared. The Coaching desk shows the latest 50 reviewed requests, explicitly not an unread/unresolved count.
8. The athlete may also request a **generic** Telegram administrator alert. It contains no athlete identity, question, health data or private link. Acceptance is reported only for a matching Telegram message/chat receipt; an unknown result is not resent automatically. In-app sharing and Telegram status are separate. No human reading, response deadline or emergency monitoring is promised.

## Supported changes and boundaries

- Profile: goal, optional weekly availability, manual weight, height, birth year, experience and reported cycling FTP.
- Selected unfinished workout: duration, sport and effort-zone label. Steps/targets require the existing rebuild/review flow.
- Recorded results: outcome, actual minutes, sport, session RPE, average HR, average power, reported energy and pre/post weights.
- Check-in ratings remain a separately reviewed check-in draft. Applied benchmark tests, race dates/venues, baseline training volume, communication settings and whole-cycle generation continue through their dedicated editors. Unsupported requests need clarification or human review; they are not arbitrary database tools.
- The model does not invent athlete facts, prescribe new supplement doses, claim a validated race prediction, or treat an affirmative chat reply as blanket permission.
- Follow-up memory includes at most two 800-character prior DeepSeek replies with verified manual-only context ancestry, only when separately enabled. Local replies that may contain imported information and unverified legacy replies remain excluded. Prior AI prose stays unverified explanation, never athlete evidence.
- The previously identified stacked training-volume reductions are a separate unresolved planner issue. This change does not activate a replacement cycle or increase a real athlete's training.

## Verification

Unit/contract tests cover grounded quantities and units, model-invented values/operations, model-output allowlists, current-message evidence, negation, dates, ownership, explicit confirmation, replay, source provenance, model-memory consent/ancestry and Telegram receipt validation. Disposable Postgres/HTTP acceptance covers automatic single-session binding, multiple-session clarification, persisted edits, coach-review sharing/replay, denied foreign private messages, granted/revoked coach visibility and administrator visibility. Browser acceptance covers consent defaults and persistence, an expanded unconfirmed proposal, reviewed sharing and the mobile composer. No physical watch receipt or scientific efficacy is established by these software tests.

DeepSeek's [JSON output documentation](https://api-docs.deepseek.com/guides/json_mode) and [current model documentation](https://api-docs.deepseek.com/quick_start/pricing/) describe transport capabilities. JMM performs its own validation and confirmation; JSON output itself is not authorization or a guarantee of correct interpretation.
