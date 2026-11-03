# Coaching product and engineering review — November 3, 2026

## Decision

Borrow RestOrTrain's conversational planning and review pattern, not its proprietary content or claims. Keep JMM's numerical decisions in authenticated, deterministic tools, with protected local cards and explicit save receipts. A better model alone cannot repair missing plan creation or incomplete sport recipes.

This patch is a focused repair and evidence package, not a completed autonomous-coaching release. Production acceptance of these new changes is pending approval; no new deployment, credential change, real message or athlete-data write was made for this review.

## Assignments and research

- Chat/product agent: RestOrTrain, Athletica, TrainerRoad and TrainingPeaks documented interactions; existing chat/tool inventory; inline-planning parity repair. [Evidence and actionable patterns](restortrain-chat.md).
- HYROX agent: current official rules, manufacturer guidance, primary studies, station implementation and data semantics. [Evidence, limitations and acceptance tests](hyrox-evidence.md).
- Workflow/data agent: onboarding through feedback, readiness, tenant boundaries, retry behavior and connection states. [Source audit and workflow matrix](flow-qa.md).
- Principal engineer: public-browser inspection, read-only live HTTP/connector metadata, integration review, mechanical/metabolic energy correction, combined tests and release decision.

No competitor account, paid plan or authenticated competitor workflow was tested. Marketing screenshots demonstrate a visible design, not proven persistence or device delivery. Instagram is a source of candidate technique ideas, not validated individualized prescriptions.

## Instagram coverage addendum

The public grid exposed 13 unique reels after pagination. Combined with the prior 11-caption review, all 13 accessible captions were covered; videos, a complete historical archive and the paid program were not reviewed. This corrects the intermediate grid count in the HYROX agent report.

- [Drag factor post](https://www.instagram.com/reel/DfQY04ePm7X/): useful distinction between damper position and measured drag factor. Store actual equipment settings with performance; do not prescribe one universal number. Check competition settings against the official seasonal rules.
- [Population comparison post](https://www.instagram.com/reel/DfQVMvPP_gY/): compare an athlete's own running, station and transition losses. The posted population dataset and percentile claims were not independently verified and must not become personal targets.
- [SkiErg technique post](https://www.instagram.com/reel/De_7XUBP9vM/): coordinated technique is a useful coaching topic. Quantified power claims in social posts are not adopted. Prefer manufacturer instruction and a dated observed skill assessment.

## Target athlete workflow

1. Select sport and goal; create a bounded provisional schedule from known availability and separately reported capacity. A race, wearable, PR or complete physiology profile must not be required merely to see a plan. Safety restrictions can hold execution separately.
2. Open Today: current session first, clear purpose and complete steps. Show fresh usable device inputs; request only consequential missing safety/availability information. Skipping preserves unknown values and the planned view.
3. Ask the coach: resolve the owned session/date locally. Show one relevant inline review card, an explanation and essential missing question. Text and reviewed voice use the same permissions.
4. Propose a change: show affected dates, dose, purpose and source/date of targets. Validate duration arithmetic, availability, sport legs/transitions, units and current revision before explicit confirmation.
5. Save atomically: receipt-backed Saved; retry cannot add a duplicate. Deliveries separately show queued, accepted, failed or unknown. An export file or provider acceptance is not watch receipt evidence.
6. Record actual execution: duration, effort, outcome/notes and optional before/after weight. Planned work never silently becomes completed work. Unknown intake does not become a measured sweat rate.
7. Recalculate locally for the next day/week using eligible evidence. Protected imports and derivatives remain outside external AI/Telegram/memory. No catch-up stacking or automatically increased capacity from a single completion.

This is a target contract; the source audit explicitly identifies incomplete steps.

## Repairs included

- Chat now exposes the existing explicit provisional/manual-baseline planning choice, with Boolean validation, request fingerprints and preview invalidation. It still reuses the guarded planner.
- Excluded history displays unknown coverage rather than zero training days. Unknown load is no longer described as an athlete-reported difficult session. Dose is unchanged.
- A fixed four-minute HYROX run/erg effort no longer invents a 1 km/1000 m distance. Dose and thresholds are unchanged.
- Mechanical bike work and estimated metabolic energy are separate fields. Calories convert to metabolic kJ using 4.184; they do not become mechanical kJ. Planned power remains an estimate, not measured execution. Mixed history cannot produce falsely comparable mechanical-work totals.
- Calendar manual-activity retries have athlete-scoped transactional receipts. An unchanged request replays the original row; changed details conflict. New IDs permit distinct intentional sessions. Older clients without IDs remain outside this guarantee, as does recovery after a full browser reload.
- Independent review found the touched manual-activity mutation lacked explicit origin validation. It now uses the existing strict configured-origin guard; missing, sibling, forged and cross-site origins are rejected before any transaction.

The energy conversion is supported by [NIST SI conversion factors](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9). Existing fueling rates, physiological thresholds, progression and PUSH settings were not changed. MET, substrate and cycling-efficiency assumptions still require calibration; their existence is not clinical validation.

## Remaining release blockers

| Priority | Failure or limitation | Required next result |
|---|---|---|
| P0 | Sport/onboarding does not reliably create a saved first plan; existing planless accounts remain | Idempotent provisional first-plan creation and reviewed backfill with every sport, empty-history and repeat-onboarding acceptance |
| P0 | Broad event windows and unknown-history reductions can collapse a week; old saved plans persist | Per-day dose explanation and coach-reviewed event/load policy; replacement preview must match athlete constraints without inventing tolerated volume |
| P1 | HYROX live preparation recipe is not a complete eight-station program | Equipment/skill/division-aware executable stations with validated endpoints and alternatives; dormant leg-protection wrapper remains disabled pending review |
| P1 | External dialogue cannot read protected app cards or execute arbitrary app actions | Coherent local tool orchestration and honest context display; retain provenance isolation, never solve by leaking card contents |
| P1 | Garmin production import/export is not end-to-end verified | Approved application and real recipient/delivery acceptance; no PUSH enablement here |
| P1 | New replay transaction lacks real PostgreSQL concurrent acceptance in this local run | Isolated database/CI contention, rollback and duplicate tests before release |
| P1 | Hardware voice, real Telegram reply routing and downstream delivery not exercised here | Explicitly authorized device/account tests with failure handling; synthetic tests are insufficient |

PR112 wearable-assisted check-in is separate and remains unreleased. The current owner's plan was not silently replaced. No general claim of Garmin compliance, injury prevention or autonomous advanced-athlete readiness follows from these checks.

## Verification

Results are recorded in the PR and local evidence directory `.local/cto-competitive-2026-11-03`. Public live smoke returned 200 for the homepage and policy pages, and 401 for anonymous assistant, Today, plan, profile, connectors and worker endpoints. Read-only owner connector metadata showed recent WHOOP/Google Calendar sync timestamps; that is not a new OAuth, export or provider-delivery test. No secret values were read for this audit.

The working checkout contains separate, pre-existing dual-domain edits; they are excluded from this PR. Local combined checks include those edits, so clean-branch CI is a separate gate. Branch preview deployment is disabled. Do not merge or deploy this work without approval.
