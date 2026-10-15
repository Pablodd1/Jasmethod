# Jev Role Assessment — JasMiamiMethod / Coach K (PILOT)

**Date:** 2026-10-15 · **Assessor:** ZCode (CTO session) · **Decision: SKIP — do not install Jev in the interactive pipeline.**

## Candidate role (as briefed)

> Route check-in feedback, workout navigation, questions and Telegram messages; no autonomous training prescriptions.

## What the codebase actually has today (inspected)

| Surface | Current implementation | Prescriptions? |
|---|---|---|
| Athlete questions | `/api/assistant` (KCoach chat): doctrine-locked READ surface — `assistant-policy.ts` intercepts training-change requests locally and answers with a pointer to the training editor; always computes a local grounded answer from the athlete's own data; Gemini only if the athlete explicitly consents AND `EXTERNAL_AI_ENABLED` | **Never** — enforced deterministically in code, not by prompt |
| Check-in feedback | `/api/checkin`: deterministic science pipeline (adaptive, `prescribeToday`, HRV readiness, stimulation, fuel; `CHECKIN_SAFETY_VERSION`), 125/125 tests green | Proposals are deterministic + provider-attested, not model output |
| Workout navigation | In-app UI (Today page, session viewer, Garmin-JSON export path) | N/A — no free-text command surface exists |
| Telegram | Two-bot split (owner directive 2026-09-23): app bot = pairing (`/start <code>`) + scheduled reminders only; owner bot = private ops alerts. **No free-text message interpretation exists.** | N/A |

## Why SKIP (documented reasons)

1. **No live input surface to route.** The candidate role presumes free-text arriving in four streams; in reality only structured check-ins, a policy-gated chat, and code-based Telegram pairing exist. There is nothing for a classifier to route.
2. **The no-prescription constraint is already enforced better than a classifier can.** `assistant-policy.ts` + the read-only chat doctrine guarantee it deterministically with tests. Adding a System-1 model in front would move a hard guarantee to a probabilistic one.
3. **Privacy surface.** Routing athlete free-text through a third-party classifier adds a data egress path with no consent gate or agreement in place — inconsistent with the consent-gated, disclosed-Gemini design the owner approved.
4. **Cost/benefit.** Jev's strength (fast structured classification) shines on monitoring — where it is already installed and healthy. Interactively it would add latency, an external dependency, and a failure mode to flows that currently cannot fail open.

## Preserved pipeline (no changes made)

- KCoach chat: local-first, policy-gated, consent-gated Gemini — untouched.
- Check-in science: deterministic, versioned safety — untouched.
- Telegram: pairing + reminders only — untouched.
- **Jev monitoring remains installed and verified**: `scripts/jev-audit.mjs` + `.github/workflows/jev-monitor.yml` — 9/9 routes healthy against production (2026-10-15). Note: the audit script already uses the SDK helper format (`noul()`/`choice()`), which matches the TypeSafe API's 2026-10 format change (raw `{boolean:…}` shorthand now 422s) — no fix needed here, unlike the PocketScribe monitor which was patched today.

## If this is ever revisited (re-open criteria)

Install Jev routing ONLY if: (a) a free-text Telegram inbox for athletes is built, AND (b) an explicit athlete consent gate for classification exists, AND (c) the classifier may only ever select between existing deterministic handlers — never generate training content.
