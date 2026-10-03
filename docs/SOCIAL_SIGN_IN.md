# Social sign-in deployment handoff

The shared authentication card offers Google, Apple, and ChatGPT alongside email/password. `GET /api/auth/providers` returns only public availability metadata: `{ providers: [{ id, label, available }] }`. The UI enables a provider only when `available` is exactly `true`; failed availability requests leave social options disabled and email/password usable. Configuration availability is not evidence of a successful live provider login.

Start routes are `/api/auth/google`, `/api/auth/apple`, and `/api/auth/chatgpt`. The UI uses these routes directly. New accounts must enter onboarding; existing accounts must preserve their athlete identity, data, and permissions. An email collision must not silently merge accounts.

## Configuration

Set `APP_URL` to the canonical public HTTPS application origin. Register the exact callbacks below, replacing `APP_URL` with that origin; do not register the literal placeholder. Store secrets in the deployment secret manager, never in source, screenshots, reports, or public provider metadata.

| Provider | Required configuration | Registered callback |
|---|---|---|
| Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `APP_URL/api/auth/google/callback` |
| Apple | `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | `APP_URL/api/auth/apple/callback` |
| ChatGPT | `CHATGPT_CLIENT_ID`, `CHATGPT_CLIENT_SECRET`; `CHATGPT_TOKEN_AUTH_METHOD` defaults to `client_secret_basic` (or `none` only for an approved public client) | `APP_URL/api/auth/chatgpt/callback` |

Google requires a web OAuth client and an appropriately configured consent screen; test-mode applications must authorize their test users. Apple requires web sign-in configuration for the Services ID, its associated domain/return URL, and the matching signing key. Preserve the private key's PEM newlines when setting the secret.

ChatGPT sign-in requires approved partner access. Use credentials and permitted client authentication settings supplied through that program: [Sign in with ChatGPT for websites](https://developers.openai.com/siwc/website). An OpenAI API key or ordinary ChatGPT subscription is not a substitute. The implementation uses fixed official production issuer/authorization/token/JWKS endpoints, not environment-supplied endpoint overrides. Do not claim the provider works without approval or enable it using dummy credentials. Identity mapping uses issuer, client, and subject.

Social sign-in authenticates the account. It does not connect fitness devices, authorize biometric access, or grant permission to send athlete records to an AI service.

## Release and acceptance checks

1. Review and apply the new Prisma migration before deploying code that uses the new authentication models. Follow the repository's staging and migration process; do not use `db push` to bypass migration history.
2. Configure the canonical origin and exact registered callback URLs for each enabled provider. Keep unapproved/unconfigured providers unavailable.
3. Run TypeScript, the repository tests, and the production build. Local mocks are not live provider acceptance tests.
4. On a staging deployment, complete each configured provider's sign-in using an authorized test account. Confirm a new user reaches onboarding and a returning user reaches their own existing account.
5. Verify cancellation, expired/replayed state, invalid token/signature/issuer/audience, missing verified email, and existing-email collision. None may create an authenticated session for the wrong account. Verify provider-subject identity handling and Apple's private relay address behavior.
6. Verify Apple callback delivery with its configured response mode, cookie handling, and first-authorization profile data. Test Google and ChatGPT using their approved production-equivalent settings.
7. Test desktop/mobile keyboard navigation, labeled email/password fields, provider availability failures, and the existing email/password flow. Check logout and subsequent sign-in.
8. Record the actual environment, commit, provider, test outcome, and any untested step. Do not describe sign-in as production-verified until the live round trip passes.

## Public error contract

Callbacks can return to `/login?provider=google&error=invalid_state` (substitute the provider and allowlisted code). Supported codes: `not_configured`, `cancelled`, `invalid_state`, `verification_failed`, `email_required`, `account_link_required`, and `server_error`. The UI displays predefined friendly text and never echoes arbitrary provider error details. Legacy `google=not-configured` and `google=error&reason=...` links remain supported with generic messages. Internal diagnostics belong in protected server logs with credentials and tokens redacted.

The birth-year input now uses the current year minus 13 instead of a fixed year. This is an input hint, not proof of age; server-side eligibility rules remain authoritative.

## Explicit account linking

A provider identity with an email already used by another account returns `account_link_required` instead of silently merging accounts. Sign in with the existing email/password on that error page; successful password sign-in opens `/login?link=1`. The linking screen offers `/api/auth/{provider}?link=1`, and the server requires a current authenticated session before starting this flow. The original session must still be valid at callback time. A verified successful link returns to `/today`, or `/onboard` if setup is incomplete. A user whose account uses a different linked provider should authenticate with that existing provider first, then open `/login?link=1`. Linking must reject an identity already owned by another user. Opening the linking URL alone never authorizes a link.

### Existing Google-only accounts

The old implementation did not store Google's stable subject. Do not fabricate mappings from email. Before rollout, identify existing Google-only users and provide verified account recovery or link from an existing valid session. Users who have neither a usable password nor a valid session require recovery first; this change does not supply general email password reset. The existing owner recovery route is administrator-only. This rollout prerequisite prevents locking existing Google-only users out unintentionally.

### Implementation verification (October 3, 2026)

The full local suite passed 488 tests. New tests exercise signed JWT verification, replay/cross-browser rejection, identity mapping, explicit linking, revoked linking sessions, Apple POST callbacks and signed client secrets, and ChatGPT PKCE/client authentication. Provider HTTP and persistence are mocked in these tests. Prisma schema validation, TypeScript checks and the production build passed. Browser checks verified the registration controls and unavailable-provider states using a local server with no credentials. No real account authorization or production migration was performed. The production Google start endpoint was observed returning its existing `google=not-configured` error; new code cannot supply the missing client registration or secrets.

The migration enables RLS on both new server-only tables with no browser policies, consistent with the existing auth tables. Prisma must use the existing owner/service database role. Verify migration application and browser-role denial in staging before rollout; neither has been exercised against a live database in this change.
