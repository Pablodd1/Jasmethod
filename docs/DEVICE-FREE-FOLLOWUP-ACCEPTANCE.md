# Device-free follow-up: acceptance and remaining release work

Verified 2026-10-02, isolated synthetic data only. This report adds to the initial
`DEVICE-FREE-ACCEPTANCE.md`; it does not claim production, medical or device acceptance.

## Delivered in this change

- Explicit pool lengths/strokes/fixed rests in native swimming FIT; strength and
  HYROX sets/stations in clearly labeled generic timed/LAP companions; ordered
  brick component FIT files and transition manifest in ZIP. Authenticated editors
  preserve source/history and require current revision/safety admission.
- Source-labeled current-versus-target tracking, explicit sport/measurement
  context and immutable corrections. Numeric aspirations can coexist with an
  explicitly chosen baseline-only conservative plan; targets never become capacity.
- Default-off real Telegram adapter/webhook plus isolated mock transport.
  Purpose-specific consent, private pairing, quiet hours/DST, bounded attempts,
  minimized receipts and revocation. Native Reply uses the saved provider message
  receipt; athletes do not copy hashes or technical session identifiers.
- Incoming feedback remains an editable app draft. Authenticated confirmation
  writes actuals atomically and requires a fresh check-in before more training.
  Transactional webhook claims survive transient failure safely; handled duplicate
  and terminal rejected updates receive minimized HTTP 200 acknowledgments.

## Actual verification

| Check | Result |
| --- | --- |
| `npm test` | 369/369 pass |
| `npm run test:followup:boundaries` | 27/27 pass |
| `npx tsc --noEmit` | pass |
| `npm run lint` | pass, three pre-existing hook warnings |
| `npm run build` | pass; optimized build `9jFX6ZGBU1pxNb9DE52uX` |
| `npm audit` | zero vulnerabilities, including development dependencies |
| Fresh isolated PostgreSQL migrations | all 30 applied |
| Optimized-server follow-up acceptance | 28/28 pass |
| Optimized-server original launch acceptance | 35/35 pass |
| Optimized-server legacy HTTP assertions | 86/86 pass, including shared-auth closure |
| Database sync/legacy delivery boundary | pass |
| Optimized-server native webhook/outbound injection | 15/15 pass |
| Provider network attempts in guarded HTTP runs | zero |
| Synthetic users left after cleanup | zero |

The three optimized HTTP reports share source fingerprint
`344b8fee72d194271cfc0a0bf8f0d91954e245aa069a313176b08b0356d36521`.
They were run on published parent `b662cc68` with the uncommitted authentication
closure present. The original follow-up parent was reconciled by history only to
owner merge `7c124cb`; it had the same foundation tree and no file reconciliation
was needed. The optimized build used real build-time fonts. The legacy local
runner also sets a font-mock environment value at server start; it does not alter
already built assets. SSR checks are not visual browser acceptance.

Coverage includes selected session/revision parity, metre/yard decoding, explicit
rest versus send-off rejection, generic rep/LAP semantics, brick ordering, stale
edits, optional missing data, tenant isolation, unknown feedback, historical
corrections, consent/revocation, quiet hours, native wrong/forwarded/stale replies,
concurrent replay, rollback after claim failure and unknown delivery without resend.

CI provisions its own local database and runs all named suites, including the
native webhook suite with dummy-only configuration. Evidence artifacts exclude
credentials, cookies, database dumps and real athlete data.

## Additional authentication closure

Public read-only login inspection found shared one-tap account buttons enabled.
The source did not mark those identities as synthetic. The route and UI are now
permanently retired; no environment flag can reopen them. Normal login/signup
reject a one-way fingerprint of the revoked credential; the plaintext value is
not retained in code or tests. Versioned session-token hashing, with no legacy
fallback, invalidates every old cookie on an eventual authorized deployment.
All users will need to sign in again. Stored accounts/passwords/sessions are not
changed or deleted. Legitimate password and mocked verified OAuth flows issue
usable v2 sessions; malformed credential hashes still fail closed.
Nine focused mocked auth tests plus isolated HTTP checks cover these boundaries.
This code is a review-branch fix; live remediation has not been performed.
See `shared-demo-retirement.md`: preserve the v2 namespace and retired endpoint
on rollback, and handle affected account recovery through an authorized process.
No actual exposure of athlete data was established and no real account accessed.

## Remaining acceptance and intentionally excluded claims

- Real browser/microphone/mobile-share interaction: NOT RUN. The supported cloud
  browser refused the local URL with `net::ERR_BLOCKED_BY_CLIENT`; cause was not
  established and no bypass or external test deployment was attempted.
- Garmin named device/firmware USB import and on-watch execution: NOT RUN.
  Every capability remains `deviceTested: false`.
- Real Telegram registration, pairing and provider delivery: NOT RUN. No bot
  credentials or webhook were configured and no real messages were sent. Enabling
  requires authorized provider/privacy/operator acceptance and the new migration.
- Pool send-offs/open-water, native strength/HYROX and single-file multisport
  remain unavailable. Generic companions and split files disclose their limits.
- Target-driven progression, calibrated race predictions and comprehensive
  literature validation remain excluded pending qualified review. Baseline-only
  duration factors/zone caps are engineered conservative rules, not clinically
  validated thresholds. Triage, nutrition and retention need human review.
- Real email/push transport remains unavailable; those options are simulation-only.
  Concise English labeled Telegram answers are supported; narrative or other
  languages use the authenticated app editor.

## Publication and operational boundary

PR 14 was externally merged by the repository owner at 21:37:13 UTC into
`science-v2-shadow` (`7c124cbb207d5b37f5cf3f67d32867718471751a`). Read-only GitHub
status showed its Vercel deployment completed at 21:38:30 UTC. The implementation
agent did not merge or deploy it. Actual live database/runtime acceptance remains
unverified; a successful deployment status is not a migration or functional check.

This follow-up is isolated on `dot/device-free-followup-20261002` for a new draft
PR. Both review branches have Vercel automatic deployment disabled. Ordinary
builds never apply migrations; production migration remains separately authorized.
No production migration, merge, deployment or real athlete communication is part
of this follow-up.
