# Athlete clarity implementation and audit

Date: 8 October 2026. Base: `a26bcd1d8f913cebc3d9248af65841847a14c50a`.
Review branch: `codex/jmm-athlete-clarity-audit`.

## Coordination and scope

The owner requested cautious implementation with dedicated agents and priority on understanding and a minimal interface. The coordinator combined four bounded assignments: onboarding UX, delivery/help UX, offline race evaluation, and training-science review. The onboarding agent independently audited the science changes; the coordinator reviewed the combined diff and ran final acceptance checks.

- Put continuation before optional device setup; hide secondary connections and explanations behind native disclosures.
- Explain Garmin setup through Intervals.icu in English and Spanish. Preserve athlete opt-in, revision approval, run/bike scope and the distinction between provider acceptance and watch receipt.
- Add a bounded offline evaluation importer with exclusion reporting, sanitized errors and no-clobber output. It does not enable or calibrate personalized forecasts.
- Remove blanket automatic jump/explosive prescriptions from generic strength, regeneration and generator descriptions. Keep scheduled allocations and existing rest/injury gates. Correct the performance citation and remove the unsupported universal injury-prevention/dose claim.
- Correct historical security notes; disable automatic Vercel deployment for this review branch.

Independent review caught remaining boxing/HYROX prescriptions and ballistic strength variants; those were corrected and covered in regressions. Newly introduced labels now say “review first,” without suggesting a review has occurred. Mobile checks found Spanish sync/status overflow; wrapping was corrected.

## Verification

| Check | Evidence |
|---|---|
| Full regression suite | 816 tests passed, 0 failures; final run used `node --import tsx --test --test-concurrency=4 src/lib/*.test.ts src/components/daily-training/*.test.ts` |
| Offline race evaluator and CLI | 24 tests passed, 0 failures via `npm run test:race-evaluate` |
| TypeScript | `npx tsc --noEmit --incremental false` passed; production build also checks types |
| Production build | `npm run build` passed using the existing `NEXT_FONT_GOOGLE_MOCKED_RESPONSES` fixture and telemetry disabled; no migration or production database connection |
| Lint | Passed with two existing hook warnings in `admin-coach-editor.tsx` and `coach-assignments-card.tsx`; no warning in modified UI |
| Mobile browser | Production build, Chrome, 390×844, English and Spanish. All `/api/*` calls intercepted with synthetic responses: no real account, database or provider interaction |
| Diff | `git diff --check` passed; source and tests reviewed before commit |

Browser acceptance checks cover optional connection disclosure by keyboard, connected-provider/profile continuation, no-provider continuation, no horizontal overflow on onboarding/Connections/help, unchecked publication default, explicit preference save, failed save preserving the previous setting, and no observed client exceptions. This is UI acceptance with synthetic responses, not authenticated backend acceptance, a comprehensive accessibility certification or a performance measurement. Font download behavior and exact production typography are not validated by the font fixture.

## Five captured screens

These are browser captures of implemented UI with **synthetic athlete/API data**, not image-generated mockups or evidence of provider/watch delivery. Full-page captures can show fixed navigation across the viewport location.

| Screen | Capture |
|---|---|
| English onboarding | [PNG](qa/athlete-clarity-20261008/onboarding-en.png) |
| Spanish onboarding | [PNG](qa/athlete-clarity-20261008/onboarding-es.png) |
| English Connections | [PNG](qa/athlete-clarity-20261008/connections-en.png) |
| Spanish Connections | [PNG](qa/athlete-clarity-20261008/connections-es.png) |
| English daily guide | [PNG](qa/athlete-clarity-20261008/help-en.png) |

## Release and remaining acceptance

This is a review branch, not a production deployment. No real-athlete outcomes, watch receipt or provider credentials were exercised. Existing saved plans/history were not rewritten. Ordinary compound-strength exercise/repetition examples remain generic; they do not establish individual movement approval. Explicit reviewed protocols retain their existing contracts. The legacy `plyo` scheduling type does not establish eligibility.

Before a live rollout, complete an authorized real-account/device check: approve a run/bike revision, publish, inspect matching steps in Intervals.icu/Garmin Connect/on the physical watch, verify completed-activity import, then exercise revision update/cancellation. Configure deployment/provider settings separately. Real predictive accuracy requires the registered evaluation protocol and genuine frozen records/outcomes; synthetic arithmetic tests cannot supply it.

See [the plyometric correction](plyometric-review-exception.md), [offline evaluation usage](race-evaluation-cli.md), and [evaluation protocol](research/race-scenarios/evaluation-protocol.md).
