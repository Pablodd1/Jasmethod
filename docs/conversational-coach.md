# Private conversational coach

## Scope

This increment adds a persistent, athlete-owned conversation to **Today → Ask KCoach**. It is separate from the athlete/assigned-human-coach conversation. A coach or administrator cannot read another athlete's private assistant conversation through this API.

The default, runnable mode is deterministic and local, with optional consent-gated provider explanations/extraction. It recognizes a bounded set of explicit English/Spanish facts; it is not a general-purpose language model or a clinically validated intent classifier. When wording is uncertain, hypothetical, quoted, contradictory, or missing an observation date/session binding, it asks for clarification or leaves a review step rather than guessing.

Optional real provider adapters are coded but were not enabled or called during this work:

- Google Gemini text explanations reuse `EXTERNAL_AI_ENABLED=true`, `GEMINI_API_KEY`, and the optional server-side `GEMINI_MODEL`. They require a fresh, named Google Gemini opt-in on the particular message. Only that message and language are transmitted; no saved profile, conversation history or screenshot is sent to Gemini. The model can only select approved topic/paragraph IDs from a bounded EN/ES educational catalog. The server renders that fixed text; arbitrary generated prose is never displayed. This is deliberately narrower than the previous unrestricted Q&A, not an equivalent replacement. Personalized recommendations, recorded athlete facts, safety/refusal decisions, save receipts and change-review status remain server-generated. Arbitrary generated text is not clinically safety-validated; unsupported or uncertain output falls back explicitly.
- OpenAI screenshot extraction requires the separate `COACH_VISION_ENABLED=true` and `OPENAI_API_KEY` configuration plus a fresh, named OpenAI opt-in on that upload. The adapter uses only the fixed official Responses endpoint and the documented `gpt-4.1-mini-2025-04-14` vision model, with strict structured output and no tools, retries, redirects or user-supplied endpoints. It sends the locally sanitized screenshot and extraction instruction, not the athlete's profile or chat history.

Configuration alone never supplies consent. Text consent does not authorize an image upload, and image consent does not authorize a text-context request. When a provider is unconfigured, unavailable, refuses, times out or returns invalid output, the UI gives a truthful local/typed-facts fallback. Live provider behavior, access, billing and model availability remain operator acceptance tasks; no credentials were configured here.

The OpenAI contract was checked against the official [vision guide](https://developers.openai.com/api/docs/guides/images-vision), [structured-output guide](https://developers.openai.com/api/docs/guides/structured-outputs), and [GPT-4.1 mini model page](https://developers.openai.com/api/docs/models/gpt-4.1-mini).

## Review and application

1. Type a message or use optional browser dictation. Voice is a user-reviewed transcript; it never saves a workout automatically. Browser speech recognition may process audio with the browser vendor.
2. Select the particular workout when reporting its actual outcome. The server verifies ownership, observation date and revision.
3. Review each proposed fact. Fields start unselected. Only the value is editable; changing units, date, source or session requires a new clarified message.
4. Explicit confirmation atomically calls the existing `saveProfile` and `updateWorkout` services. A receipt identifies the facts actually applied. Profile changes and actual workout feedback can be saved together, or all roll back if any source record changed.
5. Return to the existing daily check-in to reassess today's prescription with current safety/recovery answers. A future-plan change remains pending until its existing preview/confirmation workflow completes. Conversation confirmation does not silently rewrite daily or future training.

Applicable fields are deliberately bounded: profile goal, weekly availability and reported weight; workout actual outcome, minutes, sport and RPE. The proposal schema also represents check-in fields and planned session fields for explicit handoff. A goal time never becomes a measured pace, FTP, heart-rate reference or forecast guarantee. No prescriptions are generated from an image or a conversational desire alone.

### State and safety boundaries

- Proposal revision, athlete, timezone, selected-session date, profile revision, and workout revision are checked server-side.
- Message IDs and a hashed operational request ledger bound repeated submissions before image decoding or paid provider work. The same ID with changed content is rejected; an uncertain attempt is not silently retried. Per-owner limits are 30 messages/minute and 300/hour, with image/external requests limited to 6/minute, 30/hour and one in flight. These are operational safeguards, not scientific thresholds.
- Confirmation keys make retries return the same receipt. A changed/replayed request cannot perform a new write under that key.
- Cancelled/superseded proposals cannot apply. Network failures are displayed as unverified; the client reloads before retrying rather than claiming nothing happened.
- Completed or feedback-bearing session prescriptions remain unchanged. Actual corrections are stored using the existing feedback service and audit.
- No messaging, notification preference, watch delivery, or connector setting is enabled by conversation.
- Provider selection produces an optional approved educational explanation, separately labeled from local coaching direction. Unsupported open-ended questions receive a clarification or local fallback rather than generated expertise. Late output is generation/revision guarded so clearing chat or starting a newer conversation turn cannot resurrect or overwrite it. Network work runs outside database transactions.
- Image bytes accept only bounded inline PNG/JPEG/WebP. MIME/content checks, actual decoding, pixel/dimension limits and re-encoding strip metadata before any injected provider could receive pixels. URLs, SVG, arbitrary fetches and source instructions embedded in pixels have no authority. The provider result remains untrusted and must pass the same candidate validator and athlete review.
- Clearing the conversation removes conversation text and unconfirmed proposal evidence within the owner scope. Applied athlete facts and their confirmation audit remain; the UI explicitly discloses this boundary.

## Coaching behavior

Accountability is conditional on a current reviewed check-in, complete planning setup and an approved, still-effective session. Ordinary reluctance can receive a firm recommendation to start that session's planned warm-up and reassess, linked to controllable execution and the athlete's stated goal. The athlete can decline.

Current symptoms, injury/illness, ambiguous fatigue, missing data and unresolved safety concerns suppress pressure to start. The policy does not diagnose, clear return to sport, invent readiness cutoffs, add catch-up load, punish missed sessions, or turn a rest day into hard exercise. Reported symptoms take precedence over motivational language and wearable optimism.

These design choices are informed by published evidence; the studies do not validate JMM, this classifier, an AI coach or its progression algorithms:

- IOC acute respiratory illness consensus: stop exercise for abnormal exertional symptoms and seek appropriate assessment. <https://bjsm.bmj.com/content/56/19/1066>
- Athlete self-report monitoring review: fatigue, recovery and stress reports provide meaningful context. <https://bjsm.bmj.com/content/50/5/281>
- Self-determination intervention meta-analysis: autonomy-supportive approaches show modest health-behavior benefits, with uncertainty and bias concerns. <https://pubmed.ncbi.nlm.nih.gov/32437175/>
- Coach autonomy support/structure trial, with limited transfer from youth organized sport to adult AI coaching. <https://doi.org/10.1016/j.psychsport.2019.04.002>
- Physical-activity planning meta-analysis: concrete action/coping plans can help; effects vary and do not guarantee adherence. <https://pubmed.ncbi.nlm.nih.gov/35742582/>
- Process-goal review: use controllable execution goals without promising a race outcome. <https://doi.org/10.1080/1750984X.2022.2116723>
- Overtraining consensus: persistent unusual fatigue/performance decline needs appropriate assessment, not a chat diagnosis. <https://pubmed.ncbi.nlm.nih.gov/23247672/>

## Verification

- `npm test`: policy, extraction, image adapter, server boundary and UI helper/render regressions, plus the existing suite.
- `npm run test:conversation`: HTTP acceptance against the exact synthetic loopback PostgreSQL database.
- `bash scripts/jmm-conversation-local-run.sh dev conversation`: starts a disposable database and app in one shell/namespace, blocks external egress and cleans up synthetic users.
- The same runner accepts `start` to test a built application. Build with the official local font mock only when outbound font downloads are unavailable; that does not validate typography.
- CI runs the conversation acceptance after existing launch/follow-up acceptance. Synthetic evidence is saved under `.local/jmm-conversation-integration/report.json` and uploaded by CI.

The new migration is additive. No production migration, merge or deployment is performed by implementation/testing. The working branch disables its Vercel Git preview. Real browser microphone permission/device behavior, a live image provider and physical device transfer are separate acceptance stages; synthetic adapter tests cannot establish those outcomes.
