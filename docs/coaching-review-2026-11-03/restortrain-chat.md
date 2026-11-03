# RestOrTrain and adjacent coaching products: evidence and JMM actions

Reviewed November 3, 2026. Research and source inspection only unless a test is explicitly named. No competitor account, subscription, service connection, message, or authenticated competitor workflow was created or exercised. No real JMM athlete data was accessed for this review. Existing domain edits were preserved.

## Decision

RestOrTrain is a useful interaction reference for JMM: a conversation prepares a changed week, the athlete reviews the concrete change, a calendar save has a receipt, and device delivery is a later state. Borrow that product contract and the compact mobile arrangement. Do not copy its workout numbers, proprietary prompts, designs, processor permissions, or claims of coaching superiority.

JMM already has much of the local machinery. Its largest gap is orchestration: a user can speak naturally to an external model, but that model deliberately cannot inspect JMM profile/history or execute tools. Local plan/profile/session editors live alongside it. These separate paths must behave as one coherent conversation without crossing the provenance boundary.

## Evidence classification

| Evidence | What it establishes | What it does not establish |
|---|---|---|
| RestOrTrain official site, FAQ and guides | What the vendor currently documents and promises | Actual transaction behavior, physiological validity, reliable integrations or independent performance benefit |
| Public marketing images inspected directly | Visible mobile navigation, composer, workout layout and example wording | An authenticated live application, complete preceding conversation or a saved/delivered backend state |
| US App Store listing and user reviews | Published app availability and mixed reported user experience | Scientific validation, accuracy of each review, processor compliance or present behavior for every user |
| Athletica, TrainerRoad and TrainingPeaks official documentation | Their documented scopes and workflows | A comparison trial or account-specific end-to-end verification |
| JMM source and named tests below | Existing implementation boundaries and focused regression results | Deployed behavior of the new patch, true device delivery or a completed training-engine audit |

The requested Google share URL was not available through web retrieval. The destination was independently located as RestOrTrain's official site. Its authenticated native application was not tested. Instagram/HYROX research belongs to the separate assigned agent.

## RestOrTrain: what is useful

### Conversation is the main interface

The [official FAQ](https://www.restortrain.com/faq) describes questions about a workout, the week, fueling, race preparation and training history. It describes inspectable, editable Memory entries and separate Custom Instructions for lasting scheduling rules. It documents a native mobile application rather than a web app. These are vendor statements, not features verified by using an account.

The [public chat image](https://www.restortrain.com/mockup_8_840.webp) visibly uses a large conversation area, a persistent composer and three primary destinations: Calendar, Chat and Athlete Profile. Its revised-week response presents dated sessions and concise reasons. It does not reveal the entire approval exchange; the word indicating completion in the image is insufficient evidence that a save transaction occurred.

**JMM action:** preserve the existing full-page coach. Keep the message box and microphone visible, with optional tools collapsed. Render a short answer followed by the relevant current local card. A request about a workout should not expose unrelated nutrition, settings and race forms at once.

### Plan changes have context and a review step

The [adaptation guide](https://www.restortrain.com/ai-cycling-training-that-adapts-to-your-life) describes rescheduling a missed interval session while protecting a long ride, incorporating travel constraints, and maintaining a season phase. It says the athlete's approval precedes saving a revised week. It also says training calculations are performed outside the language model. These examples do not establish that the illustrative rescheduling decision is appropriate for a different athlete.

**JMM action:** support “I missed yesterday; I have 40 minutes tomorrow” as a bounded local proposal: identify the owned session/date, inspect actual and planned work locally, retain the intended purpose where it fits, show the resulting changed days, and require explicit confirmation for consequential replacements. Do not automatically place every missed hard session into the next available day.

### Workout views connect back to conversation

The [public workout image](https://www.restortrain.com/mockup_12.webp) shows a workout purpose/title, sport, duration, warm-up, activation, main repetitions, recoveries and cool-down, plus controls attaching the session to conversation and opening a guide. This is a strong navigation pattern. Its displayed steps appear to total 73 minutes while its duration label is 75 minutes; an omitted or differently counted interval may explain the discrepancy, but the screenshot alone does not resolve it.

**JMM action:** “Discuss this workout” should attach an owned session reference to JMM's local workspace rather than upload the workout to the external model. Use the canonical structured prescription for both the chart and textual instructions. Test the arithmetic instead of trusting example screenshots. Swim rests, brick transitions and repeat recoveries must count consistently.

### Delivery is a separate capability

The [device guide](https://www.restortrain.com/send-workouts-to-garmin-wahoo-zwift) documents target-dependent device support, manual FIT/ZWO fallback, explicit send permissions, movement/deletion of the vendor's own sent workouts, and duplicate risks if more than one connection sends to the same destination. These are documented capabilities, not tests performed here. The guide's treatment of some device targets is specific to that product and should not be copied as a universal mapping.

**JMM action:** use one delivery owner per athlete/destination. Show saved, queued, provider accepted, failed and unknown separately. A file export is not a watch delivery receipt. Export compatibility must be checked for the sport, target and step type before a send action is offered.

### Their data permissions are not JMM's permissions

The [privacy policy](https://www.restortrain.com/privacy), updated October 10, names external AI services including OpenAI, Google and Anthropic and describes explicit health/AI consent. The [Strava page](https://www.restortrain.com/strava) says direct Strava ride reading ended and Strava-relayed Intervals records are not received; it suggests other recording services and file uploads. These statements do not prove legal permission for JMM to process any provider's data, nor establish that an exported or relabelled file loses its provenance restrictions.

**JMM action:** retain the single intended OpenAI adapter and existing guards. Keep imported/derived results local where required. Do not restore another provider or export private cards merely to match a competitor's description of “whole-history” AI.

## Independent reality check

The [US App Store listing](https://apps.apple.com/us/app/restortrain/id6752621455) shows an available product and mixed reviews. Some describe useful contextual adjustments; others report inconsistent thresholds, substantial prompting and interval misclassification. These are anecdotes, not controlled measurements. The US listing's rating count differs from the homepage's broader review claim; geography or aggregation could explain that, so neither count should be repeated as a universal audited total.

The important engineering lesson is to test the difficult cases even when marketing looks polished: stable baseline provenance, classification from interval structure rather than session averages, retained user constraints, transparent reasons and save receipts.

## Other platforms worth borrowing from

| Reference | Documented value | JMM adaptation |
|---|---|---|
| [Athletica FAQ](https://athletica.ai/frequently-asked-questions) and [homepage](https://athletica.ai/) | Separates a training optimization engine from conversational explanation. The public homepage says its chat does not automatically modify training, settings or completed workouts. | Preserve a deterministic training engine and evidence-backed calculations. Distinguish a chat recommendation from an adaptive engine decision and from a committed user-approved change. Do not assume every adaptive platform's chatbot owns writes. |
| [TrainerRoad Plan Builder](https://support.trainerroad.com/hc/trainerroad-support/articles/360037923191-plan-builder-overview) | Documents event and general-fitness plans, optional historical sync, plan review before adding to the calendar, different A/B/C event handling and subsequent changes. | A sport/goal should reach an actual first schedule even without a device or race. A race's importance and physiological cost are different inputs; blanket week reductions should be visible and reviewable. Do not copy another product's taper constants into JMM as scientific facts. |
| [TrainerRoad AI Training Simulation](https://support.trainerroad.com/hc/trainerroad-support/articles/41652509070619-how-to-use-ai-training-simulation) | Documents adapting calendar workouts in the context of current fitness, fatigue and goals. | Make the effect on the coming week visible before a consequential change; preserve an explanation and plan revision. No numerical comparison of algorithm accuracy was established here. |
| [TrainingPeaks Structured Workout Builder](https://help.trainingpeaks.com/hc/en-us/articles/235164967-Structured-Workout-Builder) | Documents sport-specific duration/distance blocks, power/HR/pace/RPE, repeats, cadence, and an AI generator with stated current limitations. | Build/validate one canonical prescription, then render it in the athlete's units. Expose the supported scope rather than advertising generic “all-sport AI.” Its current AI generation documentation itself warns of swim and strength limitations. |
| [TrainingPeaks sync/export guide](https://help.trainingpeaks.com/hc/en-us/articles/115000325647-Structured-Workout-sync-and-Manual-Export) | Distinguishes connection, planned-workout sync, later device sync, device limitations and manual file formats. | Implement a capability matrix and truthful delivery states. A connected service alone is not proof of successful export. Retain manual fallback as an independent tested workflow. |

## JMM source map and focused defect

Inspected in `C:/Users/jasme/Documents/Codex/JMM-device-checkin`:

- `src/lib/coach-dialogue-provider.ts`: external dialogue has only its explicit authored channel, bounded history and restricted action enum. It is instructed that it cannot read the profile, plan, wearable data or protected cards.
- `src/lib/coach-conversation-service.ts`: local context and directly rendered results are separated from external dialogue. The provider result cannot itself be a save receipt. Keep these protections.
- `src/components/daily-training/coach-conversation.tsx`: full-page composer, optional controls, proposal and receipt flows already exist. Reuse them.
- `src/lib/coach-commander-service.ts` and `src/components/daily-training/CoachCommanderWorkspace.tsx`: local inline plan preview/save already reuses the protected planner and verifies durable receipts.
- `src/lib/plan-auto.ts`: its compatibility function returns existing-plan/readiness status and never creates a new cycle. This is a primary explanation for the automatic-start gap, separate from AI quality.
- P0 found: the `/training` provisional `manualBaselinePlanning` option introduced by PR113 was absent from the inline commander schema and request hash. Thus two supposedly equivalent planning paths had different capabilities.

The assigned focused patch fixes that parity defect only. The separate first-plan/backfill problem and training dose/event-window logic remain root-agent scope.

## Recommended workflow contract

1. **First opening:** selected sport and available information produce a visible provisional schedule, with factual gaps retained. Missing wearables do not produce an empty account. Known restrictions can keep execution held without erasing the plan.
2. **Conversation:** resolve the authenticated athlete and the referenced date/session locally. Ask one essential ambiguity, not an entire profile questionnaire.
3. **Review:** show one inline card containing current source/date/units, proposed differences, affected days and why. Private card contents do not flow into external AI.
4. **Validation:** planner and numerical tools own units, duration sums, phase, dose, sport coverage, event and availability checks.
5. **Commit:** a user-reviewed consequential change saves atomically against the current revision. Repeated confirmation reuses its receipt; a changed request cannot replay it.
6. **Delivery:** queued/accepted/failed/unknown are distinct. Email, calendar and device failure must not revert a successfully saved plan or claim downstream delivery.
7. **Feedback:** post-workout actual minutes, effort, notes and optional before/after weight become dated evidence. Planned minutes never become completed minutes by assumption.
8. **Next conversation:** safe authored preferences may persist with reviewable provenance; restricted records and their locally rendered summaries do not become external chat memory.

## Acceptance tests to add or retain

| Priority | Scenario | Required observable result |
|---|---|---|
| P0 | Select each supported sport with no wearable, no PR and no race | A bounded provisional schedule is visible; unknown benchmarks stay unknown; plan creation is not falsely reported from onboarding completion. |
| P0 | Chat and Training page use explicit manual-baseline planning | Same protected planner, same choice semantics and revision checks; no provider context export; normal mode still rejects restricted derivation. |
| P0 | Change the planning basis after preview or after a saved receipt | Preview clears; a new fingerprint is required; no replay or duplicate plan under another basis. |
| P0 | Foreign athlete/session/message ID in a chat request | Rejected before data or write access; no cross-athlete card, history, receipt or send. |
| P0 | Model unavailable or slow | The app labels the failure and preserves usable local review; no provider fallback, invented completion or lost draft. |
| P1 | Missed hard session plus an approaching long session | Show a locally calculated changed week with constraints and affected sessions; no automatic catch-up stacking. |
| P1 | Change availability or report travel | Ask only the conflicting date/time; retain known preferences; preview and reload agree after save. |
| P1 | Swim, bike, run and brick prescriptions | Step totals, work/recovery, sport legs, transitions and units agree in text, graph, FIT and email views. |
| P1 | Gym and HYROX session | Exercises/stations, repetitions or duration, rest and intended effort are executable; no invented load or unsupported station-specific target. |
| P1 | Voice transcript has an uncertain number | Editable text remains available; uncertain values are clarified before consequential save. Hardware microphone recognition must be tested separately from mocked dictation. |
| P1 | Calendar/email/device failures after save | The training save receipt remains true, downstream failure is visible, retry is idempotent, and unknown outcome does not trigger a duplicate send. |
| P1 | Return to a new conversation after a protected local card | No private card text or legacy context is present in the external request or AI memory. |

## Focused implementation results

Runtime edits are limited to commander service, request fingerprint and inline commander UI. They carry an explicit Boolean manual-baseline choice to the existing planner; default false and omission preserve historical receipt hashes, while true has a distinct fingerprint. The UI resets the choice between athletes and new plan messages and invalidates a preview when it changes. Existing exercise, export, data-origin and save-confirmation gates are unchanged.

Focused unit/service tests cover strict input validation, forwarded planner eligibility errors, unchanged default restriction, changed-basis fingerprinting, legacy hash compatibility, receipt replay and foreign source-message rejection. See the agent's final report for exact executed counts. Browser acceptance of the newly edited inline checkbox and production acceptance remain root-agent release gates, not claims made by this research report.
