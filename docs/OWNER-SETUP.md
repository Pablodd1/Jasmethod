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
| **Garmin (direct)** | developer.garmin.com | ❌ Program paused (no reopening date). Use: Garmin CSV/TCX/FIT upload (live today) or the Strava bridge once Strava is active. |
| **COROS (direct)** | email api@coros.com | Free but manual approval. Otherwise Strava bridge / file upload. |

## Also set in Vercel when hardening for public launch

`TOKEN_ENCRYPTION_KEY` (openssl rand -hex 32 — encrypts OAuth tokens),
`CRON_SECRET` (protects the 5 AM sync + hourly reminder crons),
`STRAVA_VERIFY_TOKEN` (when Strava webhook is subscribed),
`GEMINI_API_KEY` (AI coach/briefings).
