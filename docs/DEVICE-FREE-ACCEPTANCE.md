# Local acceptance evidence — 2026-10-02

This is implementation/test evidence for the isolated review branch, not clinical, production or universal-device approval. See `DEVICE-FREE-LAUNCH-REVIEW.md` for scope and exclusions.

## Executed checks

| Check | Actual result |
| --- | --- |
| `npm test` | PASS: 298 tests, 0 failed, 0 skipped |
| `npx tsc --noEmit` | PASS |
| `npm run lint` | PASS with 3 pre-existing hook-dependency warnings in Hyrox, admin-coach-editor and coach-assignments-card |
| `npm run build` | PASS: optimized Next.js 15.5.26 production build; no migration lifecycle hook |
| `npm audit` including dev dependencies | PASS: 0 vulnerabilities reported |
| Token-encryption roundtrip | PASS using a synthetic local key |
| `test:launch` against real PostgreSQL | PASS: 35 authenticated scenarios |
| Legacy `test:integration` | PASS: 74 HTTP assertions |
| `test:sync` | PASS: synthetic import/dedupe/calendar/delivery tests |
| Schema migration application | PASS: all 29 migrations on a fresh isolated PostgreSQL 17.6 database |
| Generator allocation matrix | PASS: 2,520 sport/minute/variant/zone combinations; 2,240 time-only totals exact |
| FIT semantic decoding | PASS: run, bike, boxing, mobility, recovery fixtures; SDK 21.214.0 integrity and decoded field assertions |
| Secret-signature/publication-path check | No credential signatures or ignored/local/credential artifact paths found in the publication candidate |
| Source whitespace check | PASS: `git diff --check` |

The final built-server rerun also passed all 35 launch scenarios, 74 legacy HTTP assertions and the sync suite using the optimized production build. Its egress log was exactly empty (zero outbound attempts), and cleanup deleted all 20 new-suite synthetic users.

The local PostgreSQL service and Next application were restricted to loopback, seeded with synthetic accounts. Real provider secrets were absent. The checked-in egress guard rejected development tooling/font lookups before they reached the network; no athlete/device/message provider requests or email deliveries were made. New-suite fixture cleanup was verified. No browser fixture was retained.

The HTTP scenarios cover fresh setup/confirmed preview/current and future plans; no connector/benchmark use; all nine sports' web contract and honest FIT capability; selected-session parity; same-length edits; changed anchors; true stale feedback revisions; immediate hold after new/corrected activity; feedback corrections while training is held; malformed/rest/injury/missing-safety cases; single/bundle agreement; generic/native file semantics; tenant isolation and coach consent; unknown actuals; standalone actual activity; local-day corrections; disabled provider endpoints; side-effect-free repeated GET downloads; and private, safety-gated session graphics.

## Unrun / blocked acceptance

- Rendered browser interaction: BLOCKED. The cloud browser returned `net::ERR_BLOCKED_BY_CLIENT` for the isolated app URL. This does not prove a particular cause; no alternate publication or restriction bypass was attempted. SSR contract/HTML and authenticated HTTP checks do not replace visual/keyboard/mobile checks.
- Real microphone, accents/noise, browser permission interruptions: NOT RUN. EN/ES deterministic parser fixtures passed.
- Physical Garmin USB transfer and on-watch execution: NOT RUN. No named-model/firmware compatibility badge is enabled.
- Live Intervals, Telegram, SMTP and other provider end-to-end delivery: NOT RUN. Optional functionality is gated or explicitly limited.
- Coaching/sports-science/clinical/privacy release review: NOT RUN. Qualified reviewers and release owner must sign off before pilot release.
- Full research/protocol-library evidence audit: NOT RUN. Two identified claim-to-paper mistakes were corrected; no blanket scientific validation claim follows.

## Explicitly excluded or incomplete requirements

1. Native pool/open-water swim, native strength, native HYROX and brick/multisport/split files. Full web instructions remain available; faithful native structure/hardware acceptance is outstanding.
2. Exact pace/power/speed-goal progression and personalized numeric race forecasts. Structured target goals are stored separately from current capacity; these specialized automated plans require review.
3. Safe persistent storage of an unplanned activity with wholly unknown duration. The current nonnullable workout-duration schema requires known duration for a standalone record; existing-session feedback supports unknown minutes.
4. Automatic messaging quiet-hour/privacy/recipient/delivery acceptance and Telegram reply ingestion. Automatic delivery is default off; ambiguous numeric replies are disabled. Manual selected-channel sending remains separate from downloading.
5. Clinical validation of the readiness/adaptation/triage heuristics and nutrition personalization beyond declared inputs. The implementation is conservative, not medically certified.

No source branch was modified, production data migrated, live athlete contacted, repository merged or site deployed during these local checks. The isolated review branch is configured not to auto-deploy on Vercel. Publication/CI outcomes are reported separately for the actual remote commit.
