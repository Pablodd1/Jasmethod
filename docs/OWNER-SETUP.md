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
   - Privacy policy: `https://jasmiamimethod.fit/privacy`
   - Redirect URL: `https://jasmiamimethod.fit/api/connectors/<provider>/callback`
   - Use the canonical public origin (`AGENTS.md` names it), never an old `*.vercel.app`
     hostname: providers compare the redirect URL character for character, and an
     unmatched one fails with `redirect_uri_mismatch` or similar.
   - (Whoop also: webhook `…/api/connectors/whoop/webhook`, model V2)
2. **Copy Client ID + Secret.**
3. **Vercel** (vercel.com → project `jasmiamimethod` → Settings → Environment Variables, or CLI):
   ```
   vercel link --yes --project jasmiamimethod
   printf '%s' "<id>"     | vercel env add <PROVIDER>_CLIENT_ID production
   printf '%s' "<secret>" | vercel env add <PROVIDER>_CLIENT_SECRET production
   ```
   (`printf '%s'` rather than `echo`, which appends a newline that can be stored with the value.
   Stray whitespace in a client ID, secret or URL is a common cause of a mismatch that looks correct.)
4. **Redeploy** (`vercel deploy --prod --yes`) → the Connect button appears on every athlete's Connectors page automatically.

## Remaining providers

| Provider | Where to create the app | Cost / gate |
|---|---|---|
| **Strava** | strava.com/settings/api | Needs YOUR Strava subscription ($79.99/yr; student $39.99; medical 25% off). Standard tier = 10 athletes; apply beyond. Athletes themselves pay nothing, free accounts work. |
| **Oura** | cloud.ouraring.com | Free dev account. Redirect `…/api/connectors/oura/callback`. |
| **Google Calendar** | console.cloud.google.com (Calendar API + OAuth client) | Free. Redirect `…/api/connectors/google-cal/callback`. |

### Google (Calendar connection and Google sign-in)

Create one **Web application** OAuth client; it serves both. `GOOGLE_CLIENT_ID` must be the
client you edit below: a project can hold several clients, and a URI registered on a different
one has no effect.

Sign-in resolves the origin from `APP_URL`, then `NEXT_PUBLIC_APP_URL`. Calendar OAuth uses
`GOOGLE_REDIRECT_URI` when explicitly set; otherwise it builds the Calendar callback from
`NEXT_PUBLIC_APP_URL`. `GOOGLE_REDIRECT_URI` does not change the sign-in callback. For the
production origin `https://jasmiamimethod.fit` the two callbacks are:

| Used by | Exact redirect URI |
|---|---|
| Calendar connection | `https://jasmiamimethod.fit/api/connectors/google-cal/callback` |
| Google sign-in | `https://jasmiamimethod.fit/api/auth/google/callback` |

#### Fix `Error 400: redirect_uri_mismatch` (owner-only)

Google rejects the request when the `redirect_uri` the app sends is not exactly one of the
client's **Authorized redirect URIs**. Code changes cannot repair or verify Google's
registration, so this is a console change:

1. Run the offline check (next section) so you know exactly which URIs the deployment sends.
2. Google Cloud console → APIs & Services → Credentials → **OAuth 2.0 Client IDs** → open the
   client whose ID equals `GOOGLE_CLIENT_ID` (`YOUR_CLIENT_ID.apps.googleusercontent.com`).
3. Under **Authorized redirect URIs**, choose **Add URI** and enter each URI in the table above
   if it is not already listed, exactly as shown (scheme, host, path; no trailing slash).
   Do not edit or remove other entries, such as an older `vercel.app` callback, unless you have
   confirmed that no deployment still uses them.
4. **Save.** Google may take a few minutes to apply the change (check Google's documentation for
   the current delay).
5. In the deployment, `NEXT_PUBLIC_APP_URL` must be `https://jasmiamimethod.fit` with no path
   and no trailing slash. `NEXT_PUBLIC_*` values are generally inlined at build time, so redeploy
   after changing one. Leave `GOOGLE_REDIRECT_URI` unset unless you need to pin the callback; if it
   is set, it must equal the Calendar URI above exactly.
6. Retry the connection and complete the verification below.

#### Check the configuration offline

```
npm run check:google-calendar -- --env-file <file> --registered-file <uris.txt>
```

It reproduces the exact `redirect_uri` the app sends, flags values that can never match (wrong
scheme, trailing slash, stray whitespace or a newline, an override the app silently ignores, an
old hostname), and compares them with the URIs you copied from the console (`--registered-file`
takes one URI per line; `--registered "<uri>,<uri>"` also works). `--env-file` reads the five
relevant settings from a file such as one pulled with `vercel env pull`; keep that file out of
Git and delete it afterwards. Without it the command reads this shell's environment.
`--expect-client-id <id>` confirms the deployment uses the client you expect. The command makes no
network request, changes no setting and never prints a secret or a client ID. Exit code 0 means no
configuration error was found (the output says whether the console list was compared), 1 means
errors were found, 2 means a usage error.

#### Verify after saving (the check cannot see these)

- **Calendar API:** APIs & Services → Library → Google Calendar API shows **Enabled** for the same project.
- **Consent screen:** note the publishing status. While it is **Testing**, only listed test users can
  authorize, and Google may expire refresh tokens issued in that mode after a short period (confirm
  the current rule in Google's documentation). The Calendar scope used here (`calendar.events`) is
  sensitive, so opening the app to the public may require Google's app verification.
- **Connection:** connect a test athlete under Connections → Google Calendar. Expect the consent
  screen, a return to the app, and a connected status.
- **Consent and write:** `/account/smoke-test` (smoke-test accounts only) proves consent and one
  calendar write with a short-lived access token. It does **not** prove token refresh.
- **Refresh:** with a normally connected test athlete, wait until the access token has expired
  (about an hour), run Sync again, and confirm it succeeds without asking the athlete to reconnect.

Enable the Google Calendar API for the Calendar connection. Store the client ID and secret as
`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the deployment's secret manager. A later
authorized deployment and a real consent/sign-in test are required to verify the operational
setup. Sign-in alone does not grant Calendar access; each athlete separately connects Calendar.

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
