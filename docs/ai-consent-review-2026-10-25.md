# AI consent and Garmin data boundary review

Scope: requirements implemented from current main `0d6bf866ce79bc48844b3a1fe6278bb954b67c5b` (PR76). The earlier local patch was unavailable. This is a proposed change, not a production deployment or Garmin approval.

## Boundaries

- Nutrition photos require exact server-validated `photoConsent: true`, `photoProviderConsent: google_gemini` and `photoSource: food_photo`. Missing/refused consent stops before decoding or transmission. UI consent starts unchecked and is consumed on each attempt. Manual meal entry remains available.
- Screenshot origin defaults to unknown. Both envelope validation and the extraction boundary reject missing, unknown, device and imported origins before OpenAI. Only declared manual notes plus named per-image consent can proceed. Images are locally decoded and re-encoded before transmission; URLs are rejected.
- DeepSeek receives an allowlisted educational topic, language and static reviewed education/reference catalog only. It receives no current message, profile, check-in, activity, summary or previous message. This is structural exclusion; keyword checks are supplemental. External change proposals are refused. Local numeric proposals, review, confirmation, concurrency checks and receipts remain.
- Legacy assistant replies and local context summaries are withheld from chat reads. Legacy AI memory flags cannot re-enable context export. New personal analytical requests point to local Today/Plan instead of saving derived summaries as chat prose. Safety decisions remain local.

## Provider evidence and limits

Read-only checks on October 25, 2026:

| Service | Evidence | Remaining uncertainty |
| --- | --- | --- |
| Vercel | Production deployment metadata identifies the application and current main release | No assertion of universal storage region or encryption coverage |
| Google Gemini | Production environment variable names include GEMINI_API_KEY and GEMINI_MODEL; route sends only photo and fixed instructions to Google's API | Secret values, billing tier, actual model availability and retention settings not read or tested |
| DeepSeek | Production variable names include DEEPSEEK_API_KEY and EXTERNAL_AI_ENABLED; server adapter uses DeepSeek API | Flag value, billing/retention controls and actual provider traffic not verified |
| OpenAI | Screenshot adapter in deployed source uses Responses API with store:false | OPENAI_API_KEY and COACH_VISION_ENABLED were absent from production environment-name listing; do not claim production availability or zero retention |
| PostgreSQL / Supabase | Managed PostgreSQL application adapter; connected account has an active JasMiamiMethod Supabase project | Exact production DATABASE_URL mapping to that project remains unverified; no region promise |

Environment values were not decrypted or printed. No real athlete content was sent to an AI provider in this review. Synthetic provider tests inject transports.

Official provider references: [Gemini API terms](https://ai.google.dev/gemini-api/terms), [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data), [DeepSeek API privacy policy](https://platform.deepseek.com/downloads/DeepSeek%20Privacy%20Policy.pdf), [Vercel privacy](https://vercel.com/legal/privacy-policy), [Supabase privacy](https://supabase.com/privacy). Account-specific arrangements must be checked before making retention or residency claims. `store:false` is not proof of zero retention.

## Review and remaining blockers

The owner supplied AI Dynamic LLC and the mailing address displayed in the policy. Its precise legal role as controller still needs confirmation; no public registration verification or legal opinion is claimed.

Source declarations cannot authenticate image provenance. A mislabeled image can contain imported/device data. Raw athlete messages are retained first-party; a manually pasted export cannot be reliably identified by content alone. The external text boundary excludes all such text, but these controls do not prove that no imported data can ever enter first-party user-authored chat. Legacy database rows are withheld, not represented as physically erased or removed from provider systems. Existing confirmed-change audit records are preserved.

Self-review covered authentication, mutation origin, bounded bodies/images/responses, provider consent before calls, owner-scoped reads/writes, legacy context exclusion and confirmation receipts. CodeRabbit CLI was unavailable; no independent CodeRabbit approval is claimed. CI supplies isolated PostgreSQL and browser regression evidence, including PR76's commander/plan journeys. Local preview-server launch was rejected by automatic approval review, so browser acceptance uses isolated CI instead. No deployment or Garmin application submission is part of this PR.

Before production release: confirm company legal role, production database mapping, provider tier/retention and permitted processing; review the declared-source limitation and first-party chat retention; obtain independent review. Passing tests do not establish full Garmin compliance.
