# Owner Setup Runbook — activating device providers

One-time, **owner-only** steps. Athletes NEVER do any of this — they only
click "Connect <device>" in the app and authorize. Each provider is activated
once for the whole platform.

## Already live on production

| Provider | Status |
|---|---|
| **Whoop** (OAuth + webhook) | ✅ **ACTIVE** — `WHOOP_CLIENT_ID/SECRET` set in Vercel (Sep 2026). Dev mode: 10 Whoop members; "Open Request" in the Whoop dashboard to lift. |
| Telegram bot | ✅ Active (`@JasMiamiMethodbot`). |

## The activation pattern (same 4 steps every provider)

1. **Provider dashboard** → create app → set:
   - Privacy policy: `https://jasmiamimethod.vercel.app/privacy`
   - Redirect URL: `https://jasmiamimethod.vercel.app/api/connectors/<provider>/callback`
   - (Whoop also: webhook `…/api/connectors/whoop/webhook`, model V2)
2. **Copy Client ID + Secret.**
3. **Vercel** (vercel.com → project `jasmiamimethod` → Settings → Environment Variables, or CLI):
   ```
   vercel link --yes --project jasmiamimethod
   echo "<id>"     | vercel env add <PROVIDER>_CLIENT_ID production
   echo "<secret>" | vercel env add <PROVIDER>_CLIENT_SECRET production
   ```
4. **Redeploy** (`vercel deploy --prod --yes`) → the Connect button appears on every athlete's Connectors page automatically.

## Remaining providers

| Provider | Where to create the app | Cost / gate |
|---|---|---|
| **Strava** | strava.com/settings/api | Needs YOUR Strava subscription ($79.99/yr; student $39.99; medical 25% off). Standard tier = 10 athletes; apply beyond. Athletes themselves pay nothing, free accounts work. |
| **Oura** | cloud.ouraring.com | Free dev account. Redirect `…/api/connectors/oura/callback`. |
| **Google Calendar** | console.cloud.google.com (Calendar API + OAuth client) | Free. Redirect `…/api/connectors/google-cal/callback`. |

For Google, create a **Web application** OAuth client and register both exact
callback URLs in the Google Cloud console, replacing `YOUR_CANONICAL_APP_ORIGIN`
with the public HTTPS origin used by the installation (the current production
origin is identified in `AGENTS.md`):

- Sign-in: `YOUR_CANONICAL_APP_ORIGIN/api/auth/google/callback`
- Calendar connection: `YOUR_CANONICAL_APP_ORIGIN/api/connectors/google-cal/callback`

Sign-in resolves the origin from `APP_URL`, then `NEXT_PUBLIC_APP_URL`. Calendar
OAuth currently uses `GOOGLE_REDIRECT_URI` when explicitly set; otherwise it builds
the Calendar callback from `NEXT_PUBLIC_APP_URL`. `GOOGLE_REDIRECT_URI` does not
change the sign-in callback. Keep both app-origin settings aligned with the
canonical origin and pin the Calendar override only to its registered callback.
Scheme, hostname, path, and trailing slash must match the console registration
exactly. An old deployment hostname is not interchangeable with the current
custom domain. A `redirect_uri_mismatch` still requires the owner to correct the
Google Cloud registration; code changes alone cannot verify or repair it.

Enable the Google Calendar API for the Calendar connection. Store the client ID
and secret as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the deployment's
secret manager. A later authorized deployment and real consent/sign-in test are
required to verify the operational setup. Sign-in alone does not grant Calendar
access; each athlete separately connects Calendar.

If Google authorization is unavailable, athletes can continue with email/password
and download `/api/training/export?format=ics` while signed in. This exports the
active plan as a calendar snapshot for a compatible calendar app, including
Apple Calendar. The athlete imports that file themselves; it is not a live
subscription, automatic sync, or evidence of watch delivery. Review the target
calendar's sharing before importing workout details.

WHOOP's generated OAuth `state` value is eight characters, as required by its
developer documentation. After either provider returns, the Connections page
runs one real sync and reports whether the token was verified and how many rows
were imported.
| **Garmin (direct)** | developer.garmin.com | ❌ Program paused (no reopening date). Use: Garmin CSV/TCX/FIT upload (live today) or the Strava bridge once Strava is active. |
| **COROS (direct)** | email api@coros.com | Free but manual approval. Otherwise Strava bridge / file upload. |

## Also set in Vercel when hardening for public launch

`TOKEN_ENCRYPTION_KEY` (openssl rand -hex 32 — encrypts OAuth tokens),
`CRON_SECRET` (protects the 5 AM sync + hourly reminder crons),
`STRAVA_VERIFY_TOKEN` (when Strava webhook is subscribed),
`GEMINI_API_KEY` (AI coach/briefings).

## Public contact email

The website privacy, data export/deletion, terms, and coaching inquiry contact is
`jasmel@jasmiamimethod.fit`, defined in `src/lib/public-contact.ts`. Help and the
support API use that same mailbox without deployment configuration. Legacy
`SUPPORT_EMAIL` values no longer override it, preventing stale deployment settings
from publishing an old or uncreated address. Update the shared constant if the
verified public mailbox changes.
This contact setting does not configure SMTP delivery, sender identity, account
sign-in, administrator access, or notification recipients.
