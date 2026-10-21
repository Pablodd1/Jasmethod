import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import { prisma } from "./db";
import { encryptSecret } from "./crypto";
import * as api from "./importers";
import { createOAuthState } from "./oauth-state";
import { appMutationOriginAllowed } from "./request-origin";
import { intervalsAuthUrl, intervalsExchangeToken, intervalsOAuthConfigured, IntervalsOAuthError } from "./intervals-oauth";
import { stravaConnectorEnabled, STRAVA_DISABLED_MESSAGE } from "./capabilities";

const providers = {
  intervals: { env: "INTERVALS", key: "intervals", auth: intervalsAuthUrl, exchange: intervalsExchangeToken },
  strava: {
    env: "STRAVA",
    key: "strava",
    auth: api.stravaAuthUrl,
    exchange: api.stravaExchangeToken,
  },
  "google-cal": {
    env: "GOOGLE",
    key: "google_cal",
    auth: api.googleCalAuthUrl,
    exchange: api.googleCalExchangeToken,
  },
  oura: {
    env: "OURA",
    key: "oura",
    auth: api.ouraAuthUrl,
    exchange: api.ouraExchangeToken,
  },
  whoop: {
    env: "WHOOP",
    key: "whoop",
    auth: api.whoopAuthUrl,
    exchange: api.whoopExchangeToken,
  },
};
function config(provider: string, smoke = false) {
  const route = provider === "google_cal" ? "google-cal" : provider;
  const p = providers[route as keyof typeof providers];
  if (!p) throw new Error("unsupported_provider");
  if (p.key === "intervals" && !intervalsOAuthConfigured()) throw new Error("not_configured");
  const clientId = process.env[`${p.env}_CLIENT_ID`],
    clientSecret = process.env[`${p.env}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) throw new Error("not_configured");
  const base = (smoke ? process.env.APP_URL : undefined) || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  // Redirect URIs are pinned by the PROVIDER's dashboard registration — when
  // the canonical domain changes (vercel.app → jasmiamimethod.fit), a
  // recomputed URI stops matching and OAuth dies with
  // "redirect_uri does not match any pre-registered redirect urls".
  // <PROVIDER>_REDIRECT_URI pins the exact registered value; env.example documents it.
  const override = process.env[`${p.env}_REDIRECT_URI`];
  return {
    p,
    cfg: {
      clientId,
      clientSecret,
      redirectUri:
        override && /^https?:\/\//.test(override)
          ? override
          : `${base}/api/connectors/${route}/callback`,
    },
  };
}
const SMOKE_CALENDAR_PROVIDER = "google_cal_smoke";
const SMOKE_CALENDAR_CONSENT = "calendar-smoke-v1";
function smokeAccountAllowed(userId: string): boolean {
  return process.env.ENABLE_ACCOUNT_SMOKE_TEST === "true"
    && !!process.env.JMM_SMOKE_TEST_USER_ID
    && process.env.JMM_SMOKE_TEST_USER_ID === userId;
}

// Dedicated POST boundary: GET/query parameters alone can never opt into this mode.
export async function authorizeSmokeCalendar(req: Request) {
  if (req.method !== "POST") return Response.json({ error: "POST required" }, { status: 405 });
  if (!appMutationOriginAllowed(req))
    return Response.json({ error: "Same-origin request required" }, { status: 403 });
  const contentType = req.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (contentType !== "application/json" && contentType !== "application/x-www-form-urlencoded")
    return Response.json({ error: "JSON or URL-encoded consent required" }, { status: 400 });
  if (Number(req.headers.get("content-length") || 0) > 1024)
    return Response.json({ error: "Consent request too large" }, { status: 413 });
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let body: Record<string, unknown>;
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        return Response.json({ error: "Consent request too large" }, { status: 413 });
      }
      chunks.push(value);
    }
    const text = Buffer.concat(chunks).toString("utf8");
    if (contentType === "application/json") body = JSON.parse(text);
    else {
      const fields = new URLSearchParams(text);
      if ([...fields.keys()].some(key => fields.getAll(key).length !== 1))
        return Response.json({ error: "Duplicate consent fields" }, { status: 400 });
      body = Object.fromEntries(fields);
    }
  } catch { return Response.json({ error: "Invalid consent request" }, { status: 400 }); }
  finally { reader?.releaseLock(); }
  if (!body || typeof body !== "object" || Array.isArray(body)
      || body.mode !== "smoke" || body.consent !== SMOKE_CALENDAR_CONSENT
      || Object.keys(body).some(key => !["mode", "consent"].includes(key)))
    return Response.json({ error: "Explicit calendar smoke-test consent required" }, { status: 400 });
  return authorize(req, "google-cal", { mode: "smoke" });
}

export async function authorize(req: Request, provider: string, options?: { mode: "smoke" }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  if (provider === "strava" && !stravaConnectorEnabled())
    return Response.json({ error: STRAVA_DISABLED_MESSAGE, code: "provider_disabled" }, { status: 503 });
  const params = new URL(req.url).searchParams;
  const smoke = options?.mode === "smoke";
  if (smoke) {
    if (provider !== "google-cal" || !smokeAccountAllowed(user.id))
      return Response.json({ error: "Smoke test unavailable for this account" }, { status: 403 });
    // No alternate account, return path, calendar or destination can be supplied.
    if (req.method !== "POST" || [...params.keys()].some(key => key !== "mode")
        || params.getAll("mode").length !== 1 || params.get("mode") !== "smoke")
      return Response.json({ error: "Invalid smoke authorization request" }, { status: 400 });
  } else if (params.has("mode")) {
    return Response.json({ error: "Use the explicit smoke-test connection flow" }, { status: 400 });
  }
  const targetAthlete = params.get("athleteId");
  if (provider === "intervals" && targetAthlete && targetAthlete !== user.id)
    return Response.json({ error: "Each athlete must authorize their own Intervals.icu account." }, { status: 403 });
  try {
    const { p, cfg } = config(provider, smoke),
      state = createOAuthState(provider);
    // Only return to a configured app origin; never trust a query-string host.
    const explicitReturn = new URL(req.url).searchParams.get("return");
    const base = (smoke ? process.env.APP_URL : undefined) || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    let returnUrl: string | null = smoke ? `${base}/account/smoke-test` : null;
    if (explicitReturn) {
      try {
        const target = new URL(explicitReturn, base);
        if (target.origin === new URL(base).origin) returnUrl = target.toString();
      } catch { /* Invalid optional return target: use the connectors page. */ }
    }
    // Server-side transaction: the callback identifies the athlete from this
    // row — NOT from browser cookies, which in-app mobile browsers drop.
    await prisma.oAuthTransaction.create({
      data: {
        state,
        userId: user.id,
        provider: smoke ? SMOKE_CALENDAR_PROVIDER : p.key,
        returnUrl,
        expiresAt: new Date(Date.now() + 15 * 60000),
      },
    });
    (await cookies()).set(
      `jmm_oauth_${provider}`,
      JSON.stringify({ state, userId: user.id }),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: cfg.redirectUri.startsWith("https:"),
        maxAge: 600,
        path: `/api/connectors/${provider}`,
      },
    );
    const url = new URL(p.auth(cfg, state));
    url.searchParams.set("state", state);
    // Smoke runs need only the short-lived access token; never request offline access.
    if (smoke) {
      url.searchParams.set("access_type", "online");
      url.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.events.owned");
    }
    return NextResponse.redirect(url, smoke ? 303 : 307);
  } catch (error) {
    const configurationError = error instanceof Error && ["not_configured", "unsupported_provider"].includes(error.message);
    return Response.json(
      {
        error: configurationError
          ? "This connection is not configured. Use a supported file import."
          : "Authorization could not be started. Please retry; if it persists contact support.",
        code: configurationError ? "provider_unavailable" : "authorization_storage_failed",
      },
      { status: 503 },
    );
  }
}
export async function callback(req: Request, provider: string) {
  const route = provider === "google_cal" ? "google-cal" : provider;
  const canonical = route === "google-cal" ? "google_cal" : route;
  let base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirect = (error: string) =>
    NextResponse.redirect(`${base}/connectors?error=${error}`);
  if (canonical === "strava" && !stravaConnectorEnabled()) return redirect("provider_disabled");
  const u = new URL(req.url), state = u.searchParams.get("state") || "";
  if (!state) return redirect("invalid_state");
  // The initiating athlete is bound by a durable transaction, not by the
  // returning browser session (which may be absent or belong to someone else).
  let txn;
  try {
    txn = await prisma.oAuthTransaction.findUnique({ where: { state } });
  } catch { return redirect("authorization_storage_failed"); }
  const now = new Date();
  // Smoke intent is solely server-persisted. Callback query strings cannot switch it.
  const smoke = canonical === "google_cal" && txn?.provider === SMOKE_CALENDAR_PROVIDER;
  const storedProvider = smoke ? SMOKE_CALENDAR_PROVIDER : canonical;
  if (smoke) base = process.env.APP_URL || base;
  if (smoke && !smokeAccountAllowed(txn!.userId)) return redirect("smoke_test_unavailable");
  if (!txn || txn.provider !== storedProvider || txn.usedAt || txn.expiresAt <= now)
    return redirect("invalid_state");
  let claim;
  try {
    claim = await prisma.oAuthTransaction.updateMany({
      where: { state, provider: storedProvider, userId: txn.userId, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
  } catch { return redirect("authorization_storage_failed"); }
  if (claim.count !== 1) return redirect("invalid_state");
  const userId = txn.userId;
  // Revalidate persisted targets, including transactions created by older code.
  let returnUrl: string | null = null;
  try {
    if (txn.returnUrl && new URL(txn.returnUrl).origin === new URL(base).origin)
      returnUrl = txn.returnUrl;
  } catch { /* Use the configured app URL. */ }
  (await cookies()).set(`jmm_oauth_${route}`, "", {
    maxAge: 0, path: `/api/connectors/${route}`,
  });
  const code = u.searchParams.get("code");
  if (u.searchParams.has("error") || !code)
    return redirect("authorization_declined");
  try {
    const { p, cfg } = config(provider, smoke);
    const token: any = await p.exchange(cfg, code);
    if (!token.access_token) throw new Error("No access token returned");
    if (smoke) {
      const scopes = typeof token.scope === "string" ? token.scope.split(/\s+/) : [];
      if (!scopes.some((scope: string) => ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.events.owned"].includes(scope)))
        throw new Error("Required calendar scope missing");
      const expiry = token.expires_at ? token.expires_at * 1000 : Date.now() + token.expires_in * 1000;
      if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new Error("Calendar authorization expiry missing");
    }
    let externalRef =
      token.athlete?.id != null ? String(token.athlete.id) : undefined;
    if (provider === "whoop") {
      const r = await fetch(
        "https://api.prod.whoop.com/developer/v2/user/profile/basic",
        {
          headers: { Authorization: `Bearer ${token.access_token}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!r.ok) throw new Error("Whoop profile authorization failed");
      const profile = await r.json();
      const identity = profile.user_id ?? profile.id;
      if (identity == null) throw new Error("Whoop profile identity missing");
      externalRef = String(identity);
    }
    const data = {
      status: "connected",
      scope: typeof token.scope === "string" ? token.scope : null,
      tokenEnc: encryptSecret(token.access_token),
      ...(token.refresh_token
        ? { refreshEnc: encryptSecret(token.refresh_token) }
        : {}),
      ...(p.key === "intervals" ? { refreshEnc: null, lastSyncAt: null, lastSyncCount: null, syncStartedAt: null } : {}),
      // Explicit WHOOP reauthorization also requests a fresh bounded history
      // import, including records an older workout window may have missed.
      ...(p.key === "whoop" ? { lastSyncAt: null, lastSyncCount: null, syncStartedAt: null } : {}),
      expiresAt: p.key === "intervals" ? null : new Date(
        token.expires_at
          ? token.expires_at * 1000
          : Date.now() + (token.expires_in || 3600) * 1000,
      ),
      ...(smoke ? { refreshEnc: null, lastSyncAt: null, lastSyncCount: null, syncStartedAt: null } : {}),
      lastError: null,
      ...(externalRef ? { externalRef } : {}),
    };
    await prisma.$transaction(async tx => {
    if (p.key === "intervals") {
      const other = await tx.connector.findFirst({ where: { provider: p.key, externalRef,
        userId: { not: userId }, tokenEnc: { not: null } } });
      if (other) throw new IntervalsOAuthError("provider_account_already_linked", "This Intervals.icu account is already connected to another athlete.", 409);
      const previous = await tx.connector.findUnique({ where: { userId_provider: { userId, provider: p.key } } });
      if (previous?.tokenEnc && previous.externalRef && previous.externalRef !== externalRef)
        throw new IntervalsOAuthError("disconnect_previous_account", "Disconnect the previous Intervals.icu account before connecting a different one.", 409);
    }
    await tx.connector.upsert({
      where: { userId_provider: { userId, provider: storedProvider } },
      create: { userId, provider: storedProvider, ...data },
      update: data,
    });

    if (!smoke) await tx.syncJob.create({data:{userId,kind:"sync",dedupeKey:`initial:${p.key}:${userId}:${state}`,payload:JSON.stringify({provider:p.key})}});
    }, p.key === "intervals" ? { isolationLevel: "Serializable" } : undefined);

    const okUrl = new URL(smoke ? `${base}/account/smoke-test` : returnUrl || `${base}/connectors`);
    okUrl.searchParams.set("ok", storedProvider);
    if (!smoke) okUrl.searchParams.set("sync", "queued");
    return NextResponse.redirect(okUrl.toString());
  } catch (e) {
    if (smoke) return redirect("connection_failed");
    if (canonical === "intervals") {
      // Error codes are application constants. Do not log provider/DB messages.
      return redirect(e instanceof IntervalsOAuthError ? e.code : "connection_failed");
    }
    const reason = String(e instanceof Error ? e.message : e)
      .replace(/Bearer\s+\S+/gi, "[redacted]")
      .slice(0, 250);
    console.error("OAuth callback failed", { provider, reason });
    return redirect("connection_failed");
  }
}
