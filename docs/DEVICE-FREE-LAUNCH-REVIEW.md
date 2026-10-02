# Device-free JMM implementation review

## Status and scope

This branch implements and tests a gated device-free coaching flow. It is **not a production or clinical release approval**. No production migration, deployment, merge, real athlete communication, credential connection, or physical-watch test was performed.

Baseline: `science-v2-shadow` at `2fc940a017402d1b4fc3b38a3d028af451417ed3`.
Review branch: `dot/device-free-launch-20261002`.

The pilot uses reported recent training, explicitly confirmed adult eligibility, current restrictions, a real goal and time availability. A connected device and physiological benchmark are optional. Missing optional measurements stay missing. Unknown current safety answers hold individualized exercise with a specific reason and a link back to the check-in.

## Behavior changed

- New setup cannot assign a silent Olympic goal, race date or 12-week horizon. Plan creation/replacement requires a content-bound preview and explicit confirmation. Existing prescriptions and completed activity are retained.
- Check-in controls start unknown. English/Spanish voice extraction yields editable candidates; it does not write training until confirmation. Contradictory symptoms remain visible. Unsupported speech languages fall back to text.
- Current chest discomfort/fainting/severe unexplained breathlessness/confusion/collapse, illness and new focal pain override favorable scores. Triage wording and conservative rules require qualified review; they are not diagnosis or return-to-play clearance.
- Yesterday's sessions are individually reportable with outcome, actual sport, actual minutes, anchored RPE and optional quantities. Observation date and entry time remain distinct. Unknown load is not zero or planned load. Confirmed feedback influences subsequent conservative adaptation; missed work is not automatically made up.
- One athlete-scoped canonical resolver supplies Today, Daily, FIT, bundles, reminder/calendar descriptions and current session graphics. Missing/malformed/rest prescriptions do not reconstruct hard training. SHA-based revisions include effective structure, safety, source/profile evidence and relevant guidance context.
- Explicit open targets take precedence. Profile-derived exact targets need matching, dated benchmark/application evidence; unverified anchors fall back to open effort. Targets in UI/FIT share the numeric resolver. Pace-to-speed conversion and raw FIT units are decoded in tests.
- No hidden 70 kg body mass, no unsolicited caffeine/supplement dosing, no fixed universal water prescription in rest guidance. Weight-dependent quantities remain unavailable without weight; fluid/sodium estimates disclose provenance and overdrinking cautions.
- Provider success and measurement freshness are distinct. Downloads/shares do not approve, complete, email, or claim watch receipt. A cancelled share is not a workout failure.
- Misleading Garmin Connect JSON/workout-import instructions are retired. The supported handoff is a manual FIT file with compatible-device USB/NewFiles guidance, model/MTP limitations and an unverified-device warning.

## Deliberate capability boundaries

| Capability | Current implementation | Remaining acceptance |
| --- | --- | --- |
| Running / cycling FIT | Native sport encoding; time/distance/lap plus supported explicit/anchored targets | Named device/firmware USB and on-watch inspection |
| Mobility / active recovery / boxing | Explicit generic timed/lap companion with full web instructions | Device/model workflow; no native boxing claim |
| Pool swimming | Explicit author-supplied pool length/units, lengths, strokes and fixed rests; native swimming/lapSwimming SDK semantics validated | Named-device transfer/execution; send-off intervals remain web-only and explicitly gated |
| Open-water swimming | Distinct explicit context and web guidance; device export unavailable | Precise device/profile workflow verification |
| Strength | Explicit exercise/set/reps/load/rest structure; generic timed/lap companion with disclosed rep-to-LAP conversion | Native strength semantics and physical-device execution unverified |
| HYROX | Explicit ordered run/station/load/endpoint structure; generic timed/lap companion with source quantities retained | No native HYROX encoder claim; physical-device execution unverified |
| Brick / multisport | Explicit ordered run/bike/pool components produce separate FIT files plus transition manifest in ZIP | Start each component manually; single-file multisport and physical-device execution unverified |
| Personalized race-time forecasting | Disabled before personal numeric forecast/weather/snapshot work | Dated relevant evidence, calibrated uncertainty and reviewed model |
| Intervals connector | Default off, direct/background network gates; existing records retained | If enabled, calendar instructions only, no structured watch-delivery claim |
| Automatic delivery | Default-off Telegram adapter; per-purpose consent, private pairing, quiet hours, DST, durable attempts and minimized receipts; isolated simulation | Real-provider pairing/delivery and privacy/release acceptance |
| Telegram numeric feedback | Native Reply binds private chat + provider message ID to server-held session/date/revision; drafts require authenticated app confirmation; transactional duplicate/retry handling | Real-provider/mobile acceptance; concise English labels, narrative/other languages use app |
| Speech recognition | Deterministic EN/ES candidate-parser fixtures | Real browser microphone, accents, noise, interrupted permission/recording |

A valid SDK decode is evidence of file semantics, not Garmin import/receipt/execution. Unsupported encodings are not represented by a mislabeled running file or an invented generic workout. Web guidance and optional device output are separate capabilities.

## Reproducible checks

Required dependency versions are locked. `@garmin/fitsdk` is pinned to the tested `21.214.0`. `npm test` uses Node's test runner with the tsx import hook, avoiding tsx CLI IPC assumptions.

1. Install with `npm ci`; generate the Prisma client against an isolated database.
2. `npm test`
3. `npx tsc --noEmit`
4. `npm run lint`
5. `npm run build`
6. `npm audit`
7. `npm run test:followup:boundaries`
8. With an isolated local PostgreSQL database and app: `npm run test:sync`, `npm run test:integration`, `npm run test:launch`, `npm run test:followup`, `npm run test:telegram`. The last suite requires the documented synthetic-only Telegram configuration and never sends provider traffic.

`test:launch` refuses any database other than `127.0.0.1:55432/jmm_launch_integration_test` and app other than `http://127.0.0.1:3220`. Start the app with the checked-in `scripts/jmm-test-egress-guard.cjs` preload and `JMM_EGRESS_LOG` as documented in that file. Remove provider credentials, leave optional capability flags false, and never reuse a production database. The guard refuses remote fetch/HTTP/socket traffic and records hostnames only. This is a test harness, not a production security boundary.

The CI workflow provisions a disposable PostgreSQL service and runs these same checks. It uploads only the synthetic report/FIT files. Never upload `.env`, cookies, a browser fixture, passwords, database dumps or raw athlete data.

Evidence: the local runner writes `.local/jmm-launch-integration/report.json` and sample FIT files with decoder summaries. These use synthetic adults only. The committed acceptance summary records actual outcomes; generated local evidence identifies the code state and whether uncommitted changes were present.

## Schema, flags and operational safety

- `20261002201000_reported_workout_actuals`: nullable `Workout.actualSport` and `Workout.actualDetails`. Additive; existing planned and actual values preserved.
- `20261002201200_reminders_opt_in`: email default false for new reminder preferences only. Existing preferences are unchanged.
- `20261002211000_mock_opt_in_coaching`: additive communication preferences, prompt/receipt and webhook deduplication records. Legacy preferences never imply new purpose-specific consent.
- `ENABLE_INTERVALS_CONNECTOR`, `ENABLE_AUTOMATED_DELIVERY`, `ENABLE_TELEGRAM_COACHING` and `ENABLE_MOCK_COACHING` are default-off server capabilities. Mock transport is blocked in production. See `OPT-IN-COACHING.md` for real-provider setup/acceptance boundaries.
- Ordinary builds perform **no database migrations**. Migration is a separate, explicitly authorized operator step. The production helper additionally requires `VERCEL_ENV=production` and `JMM_PRODUCTION_MIGRATIONS_APPROVED=true`; this flag is an operational guard, not user permission.
- Vercel automatic deployments are disabled for the two `dot/device-free-*20261002` review branches only through documented `git.deploymentEnabled`. Other branch policies remain unchanged. Reference: https://vercel.com/docs/project-configuration/git-configuration
- No database apply or deployment is part of branch publication. Review the additive SQL and back up production before any separately authorized release.

## Review, rollback and monitoring

Engineering ownership: repository maintainer must accept the implementation review and CI results. Coaching/sports-science reviewer: **not assigned**. Qualified clinical/privacy reviewer: **not assigned**. Product release owner: **must be designated**. No human sign-off is implied by these roles.

Conservative execution-feedback thresholds, duration factors and zone caps are engineered pilot rules, not clinically validated cutoffs. The evidence registry distinguishes cited outcomes from coaching inference. Two known citation mismatches are corrected, but the entire protocol/research collection is not thereby validated.

Before pilot release: inspect the actual browser build, complete device and real-provider tests for every enabled claim, approve triage/nutrition scope, and approve data retention/consent and operational monitoring. Monitor minimized error codes, resolution holds, failed exports, stale-revision conflicts and delivery outcomes. Do not collect raw transcripts or medical details merely for telemetry.

Rollback before release: discard this isolated branch; no production state has changed. After an authorized release, pause automated delivery/optional connectors with their flags, stop issuing new prescriptions if a safety contradiction is found, and revert application changes through a reviewed rollback. Additive actual-reporting columns can remain; do not drop reported athlete history as a rollback shortcut.
