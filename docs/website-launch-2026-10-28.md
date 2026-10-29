# JMM website launch review

## Scope and authority

The owner's request is to take care of the website. The two supplied Word documents are identical reference briefs (SHA256 `26124561ca7cde1cb94479f4901f8c2f789df276e0041360d879ff0487d8639a`), not evidence that their dated findings are still true or authorization to send messages, create credentials, change DNS, accept vendor terms or enroll visitors in marketing. This change prepares a reviewable website and preserves the athlete application. No clinical, legal, provider or inbox certification is implied.

Read-only baseline: main `abba8e1434c1d3da87a596424c3e7905861dd877`, PR92 merged; production deployment `dpl_BUN6yDUyjPaCqUNWrSbVZY6gjbqy` Ready with the production aliases. Contrary to the brief's older snapshot, Sport data is shipped. PR92 CI 40783615991 passed 2,083 unit tests and the complete synthetic PostgreSQL/browser suite; authenticated production reads verified its three sport tabs and unit conversion. This is not proof of historical Garmin delivery.

The owner reconfirmed Jeffrey Draesel DC and the existing `https://cal.com/videocall-intro/15-minutes-overview` destination on October 28. Preserve the host/link. AI DYNAMICS INC and its previously owner-confirmed business address remain unchanged; no independent corporate-registry verification is claimed. Public assistant naming is JMM Coach, following the owner's existing design request. AdvanzedRacing remains unchanged.

## Design and route contract

Audience: a prospective athlete deciding whether the real product suits them; returning athletes keep a sign-in/app path. Purpose: explain training, food/fluid timing, recovery and actual-work review without overselling devices or physiology. One primary homepage action leads to How it works. There are no testimonials, rankings, fabricated outcomes, founder qualifications or paid-subscription promises.

Retain warm cream, serif headings, warm-red actions and the existing body/mono fonts. Use restrained borders, readable paragraphs and an original HTML session illustration. The illustration is explicitly synthetic and contains no health record. Preserve pre/during/post information. Header navigation collapses into an accessible native menu on smaller screens. Target widths: 320, 390, 768 and 1165 pixels; before screenshots were captured from production at 320 and 1165 pixels.

| Purpose | English route | Spanish equivalent | Primary next action / evidence |
| --- | --- | --- | --- |
| Understand the product | `/` | `/es` | How it works; synthetic example, no health claims |
| Understand setup and the daily loop | `/how-it-works` | `/es/how-it-works` | Existing account/profile/training paths; actual app source and CI |
| Review inputs, outputs and limitations | `/capabilities` | `/es/capabilities` | Existing tools; source-specific availability boundaries |
| Understand automated versus human coaching | `/personal-coaching` | `/es/personal-coaching` | JMM Coach or business inquiry; no invented human response |
| General inquiry | `/contact` | `/es/contact` | Explicit reply consent; provider acceptance distinguished from receipt/read |
| Introductory scheduling | `/book` | `/es/book` | Owner-confirmed external calendar; no booking submitted in tests |
| Practical objections | `/faq` | `/es/faq` | Contextual answers and contact |
| Evidence hub and five useful guides | `/science`, `/science/{supplements,ergogenic-aids,sleep,nutrition,race-fuel}` | Same paths below `/es` | Source links and explicit interpretation limits |
| Policies, privacy, terms, storage, data rights | Existing five routes | Same paths below `/es` | Existing full bilingual notices; confirmed company/contact retained |
| Technical/account help | `/help` | `/es/help` | Existing support and password recovery; no health data requested |
| Existing articles, J Metrics, protocols and race overview | Existing URLs retained | Not advertised as equivalent translations | Explicit English article fallback; no false Spanish hreflang |
| Athlete application | Existing protected URLs retained | No `/es` aliases for private routes | Authentication and source permissions remain unchanged |

Spanish is URL-selected, not inferred from geography or browser preferences. Public server rendering seeds the language before hydration; an account preference cannot silently replace the selected public language. Public navigation changes the localized URL while preserving the page/fragment. Each actual equivalent gets a self-canonical and reciprocal hreflang. Unknown/private Spanish aliases return 404. Server-owned middleware hints are overwritten, never treated as authentication. Root layout reads the request locale, so pages render dynamically; this performance tradeoff is measured rather than disguised as static generation.

## Product truth register

Availability and scientific maturity are independent. The live baseline below precedes this website revision; new wording/layout is implemented in this branch until its accepted deployment is verified.

| Capability, input → output | Implementation and visibility | Availability evidence | Maturity and next evidence / owner |
| --- | --- | --- | --- |
| Goal, availability, actual history → cycle/session proposal | `training-plan`, `daily-input-context`, adaptive APIs and Training/Today | Prior main and full CI; incomplete-profile starting-week browser acceptance | Evidence-informed coaching rules, not complete-product validation. Coach reviews individual appropriateness. |
| Actual minutes/RPE/notes → later local context | `execution-feedback`, `athlete-day-review` and actual-work APIs | Prior main and PostgreSQL/browser persistence tests | RPE load is a proxy, not injury risk or mechanical work. Athlete confirms actual values. |
| Sport distance/time/speed → supported calculated quantity | `sport-measurements`, `sport-evidence`, `/sport-data` | PR92 and authenticated live read | Arithmetic tested; thresholds are not inferred. Garmin field mappings remain bounded to verified contracts. |
| Meals, timing, tolerance → pre/during/post context | `session-nutrition`, `fueling`, `nutrition-context`, Nutrition/Today | Main code and synthetic actual-fueling acceptance | Educational guidance, missing-data/tolerance gates; not clinical prescription. Dietitian review needed for individualized suitability. |
| Explicit supplement preference → educational catalogue selection | `supplement-db`, `adaptive`, Nutrition | Main opt-in paths; this branch removes the separate silent 150mg caffeine path | Clinical suitability/medication screening not established. No blanket safety or dosing claim. |
| Sleep/HRV/symptoms → conservative review/off-day choice | `daily-recovery`, `day-off`, check-in safety | Main and browser/database regression | Comparable-source context, not clearance. This branch removes forced-breath/cold-face legacy prompts and physiological guarantees. |
| DNA/panel entry → stored contextual interpretation | DNA/blood authenticated paths | Source exists; no new live clinical workflow certified here | Experimental/non-clinical. Not marketed as required, diagnostic or proven causal personalization. |
| Explicit targets/course/weather → scenario comparison | `race-scenario`, `forecast-availability`, scenario workspace | Main source and synthetic CI | Experimental; no validated finish-time accuracy, sustainable-effort inference or calibrated confidence interval. |
| Garmin authorization/intake/publication | Connector guards, `garmin-ingest`, intake and delivery APIs | Prior application approval and source tests; complete live receipt/watch-delivery journey not established by this website work | Configuration, permitted recipients and delivery authentication require their own evidence. No full-backfill or always-on claim. |
| Oura authorization/import | Connector code and protected local observations | Implemented source; production operation and permitted architecture unverified here | Vendor permission, storage, revocation and intended AI architecture remain gates. No public working-AI integration claim. |
| Optional external AI | Direct OpenAI adapters with fixed education topics/per-image source/consent gates | Main consent/privacy tests; not a new real provider call | Optional and separately configured. No device/imported context or silent model-provider fallback. |
| Contact form → transport acceptance | `/api/public-inquiry`, explicit unchecked reply consent | Existing configured paths; new request-bound operational receipt and synthetic acceptance tests | Provider acceptance is not inbox/read proof. Owner/operator must verify actual delivery and reply routing. |
| Calendar click → external booking | Cal.com destination and host | Owner reconfirmation; no appointment created | Provider confirmation required; calendar view/click is not a completed booking. |

## Claim and source ledger

| Public wording / placement | Support, boundary and reviewer |
| --- | --- |
| “A clearer plan for training, fueling and recovery” / homepage | Product organization statement; not a measured performance outcome. App routes above support the workflow. No clinical reviewer invented. |
| “Useful with or without a wearable” / homepage | Manual profile/check-in/history and incomplete-baseline starting-week paths; dates/source retained. Minimum safety/scheduling inputs still apply. |
| “AdvanzedRacing · Experimental” / capabilities and FAQ | Read `docs/race-scenario-workspace.md` and `docs/research/race-scenarios/prediction-validity-audit.md`. Arithmetic tests do not validate race results. |
| Optional supplement choice, no silent caffeine / guides | Existing preferences plus removal of `recommendFuel` automatic addition. NIH ODS source explains ingredient evidence and suitability limits; no individualized dose marketed. Professional review remains unrecorded. |
| Optional comfort practices, no autonomic reset / sleep guide | Conservative replacement of legacy routines; NCCIH cautions and individual tolerance context. No validated JMM recovery benefit asserted. |
| Pre/during/post nutrition context / nutrition and race-fuel guides | Actual app workflow plus Thomas/Erdman/Burke professional position statement. No universal intake prescription or oxidation estimate. |
| Optional data and separate OpenAI consent / homepage/FAQ | Existing fixed-topic/per-image server guards and main privacy tests. Does not establish all processor contracts or vendor permissions. |

Primary sources checked October 28: [NIH ODS exercise/performance](https://ods.od.nih.gov/factsheets/ExerciseAndAthleticPerformance-HealthProfessional/), [NCCIH relaxation](https://www.nccih.nih.gov/health/relaxation-techniques-what-you-need-to-know), [nutrition position statement](https://pubmed.ncbi.nlm.nih.gov/26891166/), [HRV systematic review](https://pubmed.ncbi.nlm.nih.gov/34489178/), [Oura agreement](https://cloud.ouraring.com/legal/api-agreement), [Google localized pages](https://developers.google.com/search/docs/specialty/international/localized-versions). Source authors do not endorse JMM. No independent clinical review or jurisdiction-specific legal approval of the new content is recorded. Existing article authors/reviewers are not fabricated or backdated.

## Data and recipient map

- Browser public pages → Vercel HTML/CDN/runtime. Local sign-in status is loaded through the existing private authentication API. Public SSR does not serialize an athlete's profile or health records.
- Authenticated records/imports → application-managed PostgreSQL. The existing JMM Supabase project was previously identified in this engineering session; exact provider contracts, backup recipients/expiry and support access still need operator evidence. A Vercel function location does not prove every storage/log region.
- Application/platform diagnostics → existing database operational records and Vercel logging. No advertising, session-replay or analytics SDK is added here. Production Vercel env names were rechecked without reading protected secret values; stale DeepSeek/Gemini key names are not proof of active runtime paths. Runtime code remains direct OpenAI only where separately enabled.
- General inquiry → selected configured administrator Telegram channel, otherwise configured SMTP transport. No second transport is tried after an uncertain Telegram attempt. Minimal request fingerprint plus reply-consent purpose/version/time and transport state → existing protected AppEvent operational receipt namespace; no inquiry text/email is stored in that receipt. Retained receipts prevent replay sends; receipt retention/pruning must be included in the operational retention review. No subscriber list is created or modified.
- Optional OpenAI → separately consented eligible photos/manual screenshots or fixed educational topic/language. Garmin, device/imported records and derived coaching context are not added by these pages. Provider retention is not claimed to be zero.
- Cal.com → browser scheduling chosen by the visitor; no health records requested. A website click or iframe does not prove booking completion.
- Google Calendar, Intervals and device services → existing per-athlete authorization paths only. This website revision does not broaden their scopes or create credentials.
- Oura → source implementation remains separately gated by actual vendor permissions/architecture. Its current agreement was read; it must not be treated as a user-consent-only exception for API-to-AI use, caching or onward transfer. No Oura MCP access or provider approval was created here.

SMTP operator identity, intended inbox delivery, reply routing, SPF/DKIM/DMARC alignment, platform-only analytics/log drains, backup recipients and contractual retention are **unverified operator items**, not silently passed. No new secret was created, rotated or removed. No real inquiry, verification email, campaign, health upload, booking or customer message was sent during this website task.

## Asset register and measurement specification

| Asset | Origin and permitted use | Limits |
| --- | --- | --- |
| Existing cream/serif/body/mono styling and brand mark | Existing repository design/font configuration retained | No claim of newly audited third-party font/brand contracts |
| Session workflow illustration | Original semantic HTML/CSS, synthetic data | Explicit example label; no athlete likeness or health record |
| `website-social-{en,es}.svg` and PNG variants | Original text/vector design, 1200×630; reproducible with `scripts/render-website-social.cjs` | 72px horizontal safe area; no photographs/testimonials/endorsement logos |
| Public screenshots | Actual rendered pages with synthetic or no athlete data | Testing evidence, not product-outcome evidence |
| Instagram/founder/client imagery | Not imported or represented as reviewed | Approved source export, photographer/model rights and intended edits required first; optional P2 |

No analytics collector is added. Proposed future aggregate events: `primary_action_selected` (public route + action only), `inquiry_provider_accepted` (accepted transport, not inbox), `subscription_confirmed` (only after a real opted-in service exists), `signup_completed` (verified backend account state) and `booking_handoff` (click only, never appointment completion). No form text, email, health condition, DNA status, wearable value, account identifier or persistent cross-site identifier is an event property. Consent, owner-approved recipient, collection code and observation window must be established before interpreting conversions. No target conversion rate, revenue projection or ranking guarantee is invented.

LCP/CLS are recorded as synthetic lab diagnostics under the test viewport/runtime. INP and real-user p75 CWV are not established by this run. No WCAG compliance badge is asserted. Browser acceptance checks keyboard skip, menu, labels, explicit consent, touch target size, narrow layouts, longer Spanish copy, source-language hydration and overflow. Clinical terminology and legal notices still need qualified human review.

## Verification and deployment handoff

Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, then the full existing CI. New `scripts/jmm-website-launch-browser.cjs` is restricted to disposable loopback PostgreSQL with provider egress blocked. It crawls every sitemap URL and verifies SSR language/canonical/alternates, unknown/private aliases, responsive public journeys, language switch context, inquiry consent/conflicts/duplicates, and honest unavailable/uncertain/provider-accepted states. Existing public policy acceptance is updated to actual locale URLs while retaining identity/address/consent assertions. Existing athlete, chat, plan, source/privacy, check-in and provider workflows remain enabled.

Production publication is separate from synthetic test evidence. Review the exact commit/preview and screenshot gallery, verify current deployment configuration, then follow the authorized GitHub main/Vercel release path. No migration is needed. Rollback: revert this logical PR through a reviewed commit and redeploy; retain receipts rather than deleting records to hide an uncertain send. Existing provider credentials, stored workouts, consent and sign-in links must remain intact.

Acceptance status at implementation: source/layout/copy/locale/metadata/receipt changes implemented; full CI/browser and preview evidence pending. Final report must replace pending items with actual results. Remaining launch blockers are actual inbox/reply delivery and sender-domain evidence, infrastructure/backup/processor disclosure completeness, provider-specific permissions, and qualified review of sensitive claims/notices. No marketing subscription is offered until its promise, opt-in, unsubscribe and suppression journey are real and tested. Optional social imagery and full translation of legacy English reference articles remain explicitly outside the new bilingual primary journeys.

Recommendation pending tests: prepare a truthful smaller public scope for owner review; do not claim a complete clinical, legal, vendor or conversion launch certification.
