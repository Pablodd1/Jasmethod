# JMM deployment and credential locations

Updated 6 October 2026. [RELEASE-GATES.md](RELEASE-GATES.md) is the authoritative release procedure and acceptance matrix. Historical reports do not establish current production configuration or readiness.

## Configuration

Use package.json and the lockfile for framework versions. The app uses Next.js, Prisma/PostgreSQL, application sessions and configured social sign-in adapters. See SOCIAL_SIGN_IN.md for sign-in configuration.

Credentials belong in the hosting platform secret manager or a gitignored local environment file. Record names and presence, never values.

| Configuration | Purpose |
|---|---|
| DATABASE_URL | Application connection; privately verify the intended environment. |
| DIRECT_URL | Migration connection; verify target before any authorized operation. |
| NEXT_PUBLIC_APP_URL | Actual public origin; compare exact OAuth callbacks with provider registrations. |
| TOKEN_ENCRYPTION_KEY | Provider-token encryption; preserve existing token access when managing keys. |
| CRON_SECRET | Scheduler authentication; verify invocation frequency/runtime support. |
| Provider credentials and feature flags | Check current adapter contracts; distinguish sign-in, calendar access, observations and workout publication. |
| SMTP and Telegram credentials | Test opt-in delivery and failures. Missing transport is not successful delivery. |

External AI and providers require separate configuration, consent and acceptance. The owner requested DeepSeek; older Gemini setup instructions do not establish that this requirement is implemented. Inspect the actual adapter before describing the active provider.

## Schema and builds

`npm run build` runs `prisma generate && next build`. It does **not** apply migrations. Build success or hosting Ready status does not prove schema compatibility.

Migrations are an explicit authorized operator step after target verification, backup and migration review. `npm run db:deploy` invokes Prisma migration deployment. The separate `npm run db:migrate-production` wrapper requires VERCEL_ENV=production, configured database URLs and JMM_PRODUCTION_MIGRATIONS_APPROVED=true. It is not a build lifecycle hook. These command descriptions are not authorization to run them against production.

Do not use db:push, demo seeds or old provisioning scripts as production migration or account-recovery shortcuts. Follow [RELEASE-GATES.md](RELEASE-GATES.md).

## Account access

Shared demo credentials and one-tap authentication are retired. Former credential values have been removed from this document. See [shared-demo-retirement.md](shared-demo-retirement.md). Removing this text does not rotate credentials or remove historical repository copies.

Recover existing accounts through approved password-reset or administrator workflows after ownership verification. Preserve athlete records and provider links. Do not recreate accounts or rerun seeds to recover access. Tests use isolated synthetic accounts and unique credentials.

## Release record

Record repository, candidate commit, migration state, deployment ID/origin, enabled capabilities and dated acceptance evidence. Verify the production source branch in hosting settings; do not infer it from historical documents. Publish only redacted configuration presence and outcomes. The release gate matrix separates source inspection, isolated tests, live provider acceptance and physical-device proof.
