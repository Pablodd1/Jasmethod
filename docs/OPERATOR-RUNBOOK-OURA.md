# Oura connector — operator runbook

One Jasmethod developer application serves ALL athletes: each athlete consents
individually through the Connect button and receives their own encrypted token.
Athletes never create developer credentials.

## 1. Create the Oura developer application (one-time, owner)

1. Log in at https://cloud.ouraring.com/oauth2/applications with the Oura account
2. **Register New Client**:
   - Client name: `JasMiamiMethod`
   - Redirect URI: `https://jasmiamimethod.fit/api/connectors/oura/callback`
     (add `https://jasmiamimethod.vercel.app/api/connectors/oura/callback` too if
     you want the preview domain usable)
   - Scopes: `email`, `daily`, `heartrate`, `workout` (read-only; `personal` optional)
3. Copy the **Client ID** and **Client Secret**

## 2. Set production environment (Vercel → jasmiamimethod → Settings → Environment Variables)

| key | value |
|---|---|
| `OURA_CLIENT_ID` | from step 1 |
| `OURA_CLIENT_SECRET` | from step 1 |
| `OURA_REDIRECT_URI` | optional pin — set ONLY to the exact URI registered above if you ever need to override the computed default |

Then **redeploy** (env changes apply on the next deployment).

## 3. Verify

1. `GET /api/connectors` as a logged-in athlete → Oura card shows method "oauth" (no amber note)
2. Click **Connect Oura** → Oura consent screen → authorize → redirect back to
   `/connectors?ok=oura&imported=N`
3. Connector row: `status=connected`, `lastSyncAt` set, `lastSyncCount>0`
4. Sleep/Readiness appear on /sleep and /today within minutes (hourly cron + webhooks
   are not used for Oura — it has no public webhook; the hourly reconciliation covers it)

## 4. Maintenance

- Tokens expire; the hourly sync auto-refreshes them (refresh token flow in sync.ts).
  If an athlete sees "Reconnect needed", the refresh token was revoked — one tap fixes it.
- Oura has NO public webhook for data changes: ingestion is hourly reconciliation only
  (per provider-capabilities doc — do not promise real-time for Oura).
- Data rights: Oura's API agreement restricts REST data as AI input — coaching AI context
  must keep Oura-sourced rows out of model payloads until a documented entitlement exists
  (same boundary pattern as the Strava filter in coach route).
