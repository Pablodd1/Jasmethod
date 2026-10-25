# Public policy coverage and release audit

Owner: AI DYNAMICS INC. Owner-confirmed address: 401 69th St, Apt 709, Miami Beach, FL 33141, USA. Date: October 25, 2026.

## Published surfaces in this release

| URL | Coverage |
| --- | --- |
| /policies | Public index, company/contact and links to all notices |
| /privacy | Data categories including optional health/genetic entries, hosting/recipients, AI, Garmin restrictions, retention limitations, confirmed controller/contact |
| /terms | EN/ES service terms, medical/training limitations, account use, adult planning review, optional connections/AI and current free-pilot billing reality |
| /cookies | Actual 30-day session and 10-minute authorization cookie configuration, language/local storage, temporary drafts, browser controls and platform-analytics uncertainty |
| /data-rights | Access, correction, export, restriction/objection, consent withdrawal, manual account/data deletion request process, contact and limitations |
| /privacy#optional-ai | Conspicuous AI transparency notice and separate named controls; no blanket consent or Garmin external-AI permission |
| /terms#health-and-training | Educational coaching and health limitations; no exercise clearance, guaranteed result or emergency monitoring claim |

Shared public footer (including the homepage), sign-in/signup, app footer and sitemap provide discoverable links. Pages require no account. No fake cookie accept/reject control, erasure button or refund/cancellation feature is introduced. Terms no longer assert automatic subscription renewal or external AI grounded in athlete data. Homepage privacy copy no longer implies that a general consent authorizes exporting biometrics.

## Sources and scope

Garmin's published developer-program template calls for a conspicuous privacy notice, applicable consents/withdrawal, data-subject rights and AI transparency where relevant (sections15.4 and15.10). The version and terms actually offered to JMM must still be checked; viewing the template does not accept it or establish program approval. Source: https://www8.garmin.com/en-US/GARMINCONNECTDEVELOPERPROGRAMAGREEMENT/GARMINCONNECTDEVELOPERPROGRAMAGREEMENT_EN.pdf

FTC health-app guidance calls for privacy/security and consumer-facing claims to match actual practices. Applicable obligations depend on the service, data and users. Source: https://www.ftc.gov/business-guidance/resources/mobile-health-apps-interactive-tool

This audit establishes core public notices and functioning routes; it does not certify every jurisdiction's legal requirements. Remaining operator/legal work includes confirming production database/SMTP/backup recipients, platform analytics/retention contracts and applicable privacy/health-breach/children's-consent obligations. See garmin-provider-inventory-2026-10-25.md. Public notices alone do not complete Garmin approval or incident-response operations. No application is submitted and no credentials/scopes are created or changed.

## Release verification

Run unit/provider tests, lint, typecheck, production build, public HTTP smoke and EN/ES Chromium policy discovery/anchors/mobile-width tests. Existing chat/plan-review and consent acceptance must remain green. After release, check the real public URLs, footer and confirmed company identity without creating a user or submitting a request. Record the deployed SHA and live smoke evidence in the PR.

Repository deployment exception: AGENTS.md names the old science-v2-shadow branch. The authenticated Vercel project metadata identifies main as the current production branch. Use the reviewed tested source and verified main production pipeline rather than deploying that stale branch. Keep existing credentials and feature flags unchanged.
