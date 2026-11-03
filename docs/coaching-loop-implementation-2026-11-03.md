# Individual coaching loop — implementation and release contract

This follows the November 3 competitor/workflow audit. Earlier research reports describe the state before these repairs; use this document and the current PR results for implementation status. No claim of universal physiological validity, Garmin compliance or live delivery follows from automated tests.

## Decisions and data boundaries

The plan, its intended work, dated actual execution, reported effort, comments, availability, race calendar and eligible recovery observations form the local coaching record. Numerical prescriptions and save decisions belong to validated local services. External conversation receives only the separately consented authored channel, not protected records, cards or their derived summaries.

- Availability is a time ceiling, not proof of tolerated training.
- Stated experience is a reported fact, not a measured physiological baseline. Unknown/restricted history is not zero fitness.
- Expected and actual duration stay separate. Completion alone cannot prove improvement, and missed work is not stacked into another day.
- Comments stay with the original local report. Their presence can be shown, but arbitrary prose cannot establish medical clearance, a new threshold or verified fitness.
- Recovery evidence is evaluated against the athlete's own usable baseline. Fresh readings alone do not prove a computable readiness assessment.
- Progression review is a state, not a write. No automatic PUSH upgrade is enabled by this work.

## Implemented workflows

### First plan and returning planless athletes

Onboarding and authenticated training-page entry use the same first-plan service. An owner-scoped, same-origin empty POST ensures one provisional week with a transactional audit receipt. Concurrent entry must not create multiple active plans. The page waits for an actual saved-plan response, and failure offers retry/profile access rather than fictional success.

A usable separately reported recent baseline and existing setup can support the bounded sport-specific template. Otherwise the initial week is explicitly observation/review, with unknowns retained. Triathlon can show separate swim, bike and run observations. Restrictions, protected event dates and recorded work are preserved. No measured targets or equipment are invented.

This creates a first week, not an automatically approved performance season. Existing active plans, including expired ones, are preserved for explicit replacement review. First-plan creation is on authenticated entry; no production-wide administrative bulk rewrite is performed.

### Daily execution review

Check-in compares expected and actual minutes, reported sport, source/date, effort and available compliance evidence. Its final evaluation is attached to the check-in response/audit after readiness handling, so later processing cannot erase a conflict or safety hold. Today directly renders a compact expandable local result card.

The states are review required, maintain, reduce, and review for possible progression. Unknown execution does not become zero. Relative interval consistency does not claim that prescribed absolute targets were attained. No clinical explanation is inferred from a fade or a single easy session.

### Race-aware cycle shaping

Existing preparation/recovery factors apply to the affected session dates rather than blanket-scaling an entire week. Event dates remain protected. A confirmed separately reported baseline is not additionally reduced merely because imported recovery information is unknown; genuine reported difficult execution keeps its existing reduction policy. Daily review remains separate. No race window or physiological threshold is changed here.

### Wearable-assisted confirmation

The earlier device-assisted review is integrated locally with the new execution evaluation and source checks. It preserves symptom confirmation, available time, owner binding, measurement revision/transaction checks and manual correction paths. Read/export revalidation must use the same current evidence. Insufficient baseline or concerning recovery observations must return to manual review, rather than describe an unchanged plan as a computed device adaptation.

### HYROX

Default preparation now includes broader movement purposes without assuming equipment or competition loads. The optional reviewed-dose contract validates all eight station identities, dated source reference, equipment/technique review, complete run/station/recovery endpoints, explicit load basis and wall-ball target height where applicable. It will not truncate a reviewed set to make a shorter budget fit.

Existing explicitly authored station structures remain executable through the preservation/canonical path; reduced time can hold them instead of silently replacing them with generic movements. Automatic collection and approval of richer station evidence is not claimed. The new contract alone is not a full equipment-aware automatic program for every athlete.

### AI conversation

Live synthetic testing established both a failed response and a successful reply with an OpenAI source receipt. The successful test contained no athlete/device data. Production metadata showed the key and external-AI switch configured, with no text-model override listed; the deployed source default is GPT-6 Astra. No secret value was retrieved or changed.

The update distinguishes authorization, rate limit, model availability, provider rejection, invalid response, output safeguards, timeout and network failures using bounded codes. Raw provider error bodies/credentials are not returned. Harmless numbered-list markers do not become invented training measurements; unsupported quantities, false save receipts and medical clearance remain blocked. No model/provider fallback is added.

## Required release evidence

Run full tests, lint, typecheck and production build; then synthetic browser checks and isolated PostgreSQL acceptance, including first-plan concurrency, first-plan/full-cycle races, retry/reload, cross-athlete/origin boundaries, wearable baseline failures, text/voice corrections, existing triathlon/nutrition/FIT and consent/history leakage regressions. Hardware microphone recognition and real provider delivery remain separate live acceptance.

The local checkout contains preserved unrelated domain work, excluded from this PR. Branch deployment is disabled. Existing approval covered PR113; this expanded PR requires a concrete release approval before production merge/deployment. Current test counts, failures, fixes and final CI SHA belong in the PR rather than being implied from this source document.
