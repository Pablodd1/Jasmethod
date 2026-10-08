# Race scenario verification

8 October 2026. Draft implementation; no production release, migration, merge or athlete-data change.

## Verification scope

- Full repository unit suite: 784 tests, including 64 scenario, adapter, request, metadata, stored-state and draft-roundtrip checks.
- TypeScript: `npx tsc --noEmit`.
- Lint: `npm run lint`; no new warning. Two pre-existing hook-dependency warnings remain in the admin coach editor and coach assignment card.
- Production build: `npm run build`. The local build uses the repository's deterministic font fixture; CI builds with its normal environment.
- Disposable PostgreSQL and `next start`, synthetic accounts only, provider/email egress disabled:
  - Race scenarios: 13 checks including anonymous access, cross-origin saves, authoritative baseline matching, foreign race/anchor isolation, untrusted result recomputation, optimistic concurrency, immutable snapshots, invalid GPX and unchanged legacy gates.
  - Existing HTTP integration: 88 assertions.
  - Optional double-day agreement/recheck acceptance.
  - Device-free launch: 35 scenarios.
  - Follow-up/target tracking/sport exports: 28 scenarios.
  - Persistent conversation: 23 scenarios.
  - J Metrics: 6 scenarios.
  - Recovery/off-day: 7 scenarios.
  - Public/unauthenticated route smoke: 17 checks.
- Follow-up and injected-transport unit boundaries: 27 checks.
- Source review covers athlete ownership, strict bounded JSON/XML, source normalization, snapshot staleness, revised weather context, account switching, cancellation/stale async responses, labels/focus/status, explicit assumptions and segment roundtrips.
- Live adapter checks independently retrieved MET forecast data and NASA historical data without credentials; historical sample coverage was 75/75. Live external providers are not called by the synthetic acceptance suite.

The synthetic server must use a localhost `NEXT_PUBLIC_APP_URL`; without it the existing origin gate correctly rejects mutations. An initial local runner omitted this and was corrected without weakening application security.

## Remaining release gates and limits

- Authenticated visual/browser interaction QA has **not** been completed. The available cloud browser explicitly blocked the localhost URL. No screenshot or pixel-verification claim is made. Source accessibility review and serializer tests are not WCAG conformance or visual QA.
- CodeRabbit CLI review was unavailable. No CodeRabbit review is claimed.
- Scenario arithmetic is not individual predictive validation. Real-race held-out evaluation, scientific/coaching review, calibration and qualified clinical pathways remain separate.
- There is no universal verified race-event registry. Saved-event name/date/location filtering, official-reference links, manual venue entry and GPX import are implemented; automatic authoritative global event/course discovery is not.
- Provider values retained in snapshots are user-reviewed copies, with event consistency checks; saving does not independently authenticate or re-fetch those values.
- A shared application-wide provider throttle/cache must be reviewed before scaled production rollout. Current adapters include bounded per-process caching, rate limits and timeouts; no provider SLA is assumed.
- Numerical weather-to-physiology penalties, calibrated capacity predictions, automatic FTP-duration extrapolation and grams-of-carbohydrate-from-kJ conversions are deliberately absent.
- No automatic notifications, watch delivery, production configuration, account signup or production schema update is part of this change.
