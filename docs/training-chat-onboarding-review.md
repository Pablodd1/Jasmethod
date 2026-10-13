# Combined JMM experience review

Review branch: `fix/jmm-experience-integration`
Base: `5be7fd446679feb94b858c511516e1c7d381502b` (merged PR #46)
Included upstream heads: PR #47 `1e3cbe0655ab2138d3123ff0ce1e465f86d473e6`; PR #48 `9d11a0101c80036602a0b58f2ab0c591727ecc0a`
Recovered local source: review ZIP version 1, corresponding to `57cfc90d76894f91f1cd55b0890eb5d74094cf61`
Review date: 13 October 2026

## Why the expected experience was missing in production

A read-only authenticated cloud-browser check of Training matched deployment ID `DfHB1dKvSHu9vXRiwVoGJy2CZNXh` to main commit `5be7fd4`. Its Details control still expanded the older warm-up/main/cool-down prose. PR #46 supplied the universal card on other surfaces but did not integrate it into Training. PRs #47 and #48 were still open, with preview deployments. The additional local Training/chat/onboarding work had not been published.

## Integration and preserved ownership

The candidate retains the exact PR #47 universal-card component and stylesheet, including its compact phone summary and expandable detailed controls. PR #48's original commits, starter lifecycle, wearable import corrections, reviewed-cycle rules and optional setup behavior are included. Neither original PR has been merged into GitHub main by this work.

The recovered local patch is composed with those changes rather than replacing their UI or rebuilding the same features. Shared onboarding and coaching files are resolved intentionally; source-level conflict resolution alone is not acceptance evidence.

## Training details

- Training Details uses the universal card for today's sessions. Future and historical sessions use a clearly labeled read-only saved-structure preview composed from the same timeline, interval-details and target-selector components. The next pending session opens in its month.
- Saved previews read one athlete-owned session on demand. Their DTO has no execution capability, delivery revision or nutrition prescription. Current validated references are disclosed; unavailable targets remain missing. Legacy prose is not converted into invented intervals. Malformed, off-day and restricted structures fail closed.
- A closed supplemental Daily section restores density, energy and running race-pace references without adding a second workout chart. Formula-derived paces are estimated planning references, not measured PBs or race predictions. Wearable energy is not marked estimated.
- Missing intensity remains unknown, including title-only edits.

## Chat and personal context

The composer and conversation are primary. Logging, dictation, images, external-provider consent and privacy remain optional disclosures. Supported ordinary questions receive direct local answers and elaboration on request. Necessary data-entry and current safety questions remain; generic forced intake does not.

Personal summaries retain PR #48's owner-scoped history, biometric date/method/source and next saved race. Expanded history is requested only when relevant; today's activity remains available to safety checks, and J Metrics retains its complete evidence window when requested. No invented benchmark, silent profile change, model fine-tuning or measured production latency improvement is claimed.

## Onboarding and existing values

Connections/import or skip comes first. The next step acknowledges records actually stored, including activity history, source-labelled observations and saved race results. A connected account or queued sync is not a completed import. Visible polling and browser returns refresh evidence without overwriting unsaved answers.

PBs, thresholds and goals are requested only where missing; manual entries, draft revisions and malformed stored PBs are protected. Goal-only edits preserve the existing safety/baseline confirmation instead of renewing it. Later profile editing remains available.

PR #48's optional sport/experience choices, removal of required weekly hours, collapsed full-cycle questions and Today completion destination are retained. Day-zero suggestions still require current readiness before execution; a reviewed full cycle remains a separate decision. Starter suggestions are conservative product choices, not measured baselines or validated individual doses.

## Verification

Final candidate validation is in progress. Earlier standalone results are not a pass for this combined source.

## Verification limits

No production data, device connection, OAuth grant, outbound delivery or physical watch receipt is tested by the local candidate. The supported cloud browser cannot access this isolated local checkout, and explicitly rejects local file URLs. Component rendering is not browser layout acceptance. Production screenshots containing account information remain internal and are excluded from deliverables.

The existing universal editor only supports fully timed run/bike sessions; distance/manual-lap protocols do not gain an editor in this change.

## Publication and rollout

The exact review branch disables Vercel automatic deployment. A guarded draft review is authorized; merging into main, deploying to production, migrations, OAuth/provider configuration and delivery activation remain separate approvals. The previous Library artifact must not be used as this combined candidate's release package.
