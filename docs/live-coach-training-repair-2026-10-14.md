# JMM live coach and training repair: developer handoff

Base inspected: `main` at `7a6427d7822ad02b2a0bbe14bbac5782d317ebd8` (PR #51).
Review branch: `fix/live-coach-training-recovery-20261014`.
Review date: 14 October 2026.

The exact review branch disables automatic Vercel deployment in `vercel.json`. Main deployment behavior is unchanged.

## What was observed, and what it does not prove

A read-only authenticated cloud-browser review of Today, Training, Daily, Coach and Check-in found that the existing account's saved cycle and sessions still loaded. There was no evidence that the training data had been deleted. Training initially showed a false "No training plan yet" state before its request completed. The current card was held because the daily check-in had unanswered safety, recovery and available-time fields; this is different from a missing saved plan.

The held card displayed a prominent zero-minute duration, duplicated a long hold explanation and exposed internal field names. The narrow desktop layout squeezed the status into letter fragments. Coach history and its text composer loaded, but dictation was hidden under Optional tools. No live message or microphone request was submitted during that review. Historical generic replies are not proof of a failure in the current deployed reply engine.

Source inspection independently confirmed that PR #50's broad contact matcher redirected ordinary coaching questions and negated requests to phone referrals. "I need guidance on today's workout" was one reproducible case. The current local reply engine also lacked a direct read-only saved-training answer for common requests such as "Show my training".

## Changes in this branch

- Training maintains independent saved-plan and planning-setup loading/error states. A slow or failed profile request cannot hide an already loaded cycle. Empty-plan UI is shown only after a verified empty response. Reads have cancellable deadlines and retryable error states; mutations are not automatically retried.
- Today's held workout retains its safety verdict and unavailable execution/export capability. A separately labeled read-only saved preview lets the athlete inspect stored structure without treating it as today's clearance. Held duration/status presentation, missing-answer labels and wrapping are more readable.
- Coach dictation and transcript review sit beside the text composer rather than inside Optional tools. It remains browser dictation, not a live voice conversation. Transcript review and an explicit send remain required. Unsupported APIs, denied microphone access and device/network errors leave typing available. Existing provider consent and uncertain-send protections remain.
- Referral routing now requires explicit human-contact or testing-booking intent, with conservative treatment of negation, quoted/reported requests and in-app coaching questions. Owner-provided contact details are unchanged.
- Common saved-training questions receive today's owner-scoped saved session titles and planned durations, with check-in/navigation guidance. No completed values, exercise clearance, profile edits or workout changes are inferred. Current and unresolved safety concerns retain precedence.

No production schema migration, credential, OAuth grant, security setting, provider flag, reminder preference or real athlete plan was changed by this work.

## Verification

Local static verification: 1,374 unit/component/provider tests, explicit TypeScript, lint, production build, 27 follow-up boundary/transport tests, and the reviewed pack of 10 cycles/26 structures passed. Lint retains two pre-existing warnings in unrelated admin/coach components. The production build used the repository's official font mock.

Local Chromium execution was blocked by the shell's local-socket restriction; the supported escalation path failed before executing the test. No local browser pass or candidate screenshot is claimed. The existing GitHub workflow now installs the pinned Playwright Chromium and runs the synthetic browser runner, retaining screenshots/report as CI artifacts. Check its result for the exact published head.

The final PR description records exact-head aggregate and CI outcomes. Do not treat an earlier successful run as evidence for later edits.

Repeatable local checks:

- `npm ci` and `npx prisma generate`
- `npx tsc --noEmit`
- `npm test`
- `npm run lint`
- `npm run test:followup:boundaries`
- `node --import tsx scripts/render-reviewed-cycle-samples.ts --check`
- `npm run build`

The cloud build may use the repository's existing `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` fixture when public Google font downloads are unavailable; disclose this if used. It does not validate production font delivery.

New `scripts/jmm-live-repair-browser.cjs` runs only against a loopback app and mocks every application API with synthetic fixtures. Playwright is pinned as a development dependency; install its Chromium with `npx playwright install chromium`. Run, for example after starting the built app on port 3230:

`CHROMIUM_PATH=/usr/bin/chromium node --import tsx scripts/jmm-live-repair-browser.cjs`

It checks English/Spanish at 390, 412 and 1173 pixels, composer availability, visible dictation entry, held-card wrapping, delayed-plan empty-state protection, and a successful plan despite profile failure. It intercepts the explicit coach send in memory and rejects all other API writes. Mocked microphone denial and transcript review do not request a real microphone permission. Reports and screenshots are under ignored `.local/`. This is browser UI acceptance, not real authentication/database/provider acceptance or physical-phone microphone testing.

The existing disposable-PostgreSQL conversation acceptance runner also includes owner-isolated saved-training questions while a check-in is missing; it asserts no plan or check-in mutation. GitHub CI runs this against the published candidate. Never point these synthetic database scripts at production.

## Safe continuation for another Codex developer

1. Fetch the latest `main`, this branch and all open PR heads. Check the new branch's exact commit and diff before editing. Do not overwrite another developer's branch or force-push.
2. Continue from this branch, or merge/cherry-pick its reviewed commits deliberately. Preserve PR #49's combined card/chat/onboarding work and PRs #50/#51's other features; do not restore an older whole-file copy over them.
3. Rerun typecheck, full tests and build after any conflict resolution. Review tenant scoping, check-in holds, unavailable export controls, delayed/repeated requests and account/session changes.
4. Read the PR's final CI, independent review and browser evidence. Resolve genuine failures; disclose checks that have not run.
5. Merge/deploy requires the owner's explicit approval. This repair branch does not authorize production migrations, security changes, enabling external AI/image providers, granting permissions or changing athlete data.
6. After an authorized release, verify the served deployment matches the intended commit. Then recheck the affected screens on an authorized signed-in account and the user's actual mobile browser. A green build, preview or unit suite is not proof that the live personal account is fixed.
7. For a real dictation/send test, obtain the applicable microphone/data/send approval first. Browser support varies; unsupported browsers must retain the text path. Never use a real athlete check-in or generated plan as a disposable test fixture.

## Remaining product and rollout limits

The default conversation path is a bounded local reply engine. Optional Gemini educational selection does not provide unrestricted personal coaching, and image understanding depends on separately configured, consented OpenAI access. This branch does not add a paid live-audio service or claim those providers are configured.

Missing check-in answers remain unknown and cannot clear training. Viewing a saved preview does not create completion, readiness, watch delivery or a new prescription. No live provider delivery, physical device receipt or medical clearance is established by this repair.
