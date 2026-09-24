import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import { prisma } from "./db";
import { encryptSecret } from "./crypto";
import * as api from "./importers";
import { createOAuthState, validOAuthState } from "./oauth-state";

const providers = {
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
function config(provider: string) {
  const p = providers[provider as keyof typeof providers];
  if (!p) throw new Error("unsupported_provider");
  const clientId = process.env[`${p.env}_CLIENT_ID`],
    clientSecret = process.env[`${p.env}_CLIENT_SECRET`];
  if (!clientId || !clientSecret) throw new Error("not_configured");
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
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
          : `${base}/api/connectors/${provider}/callback`,
    },
  };
}
export async function authorize(req: Request, provider: string) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  try {
    const { p, cfg } = config(provider),
      state = createOAuthState(provider);
    // Return URL (mobile app deep link or in-app browser return) rides on the
    // transaction row, not the query string, so it survives provider redirects.
    const explicitReturn = new URL(req.url).searchParams.get("return");
    // ORIGIN CAPTURE: an athlete who started on a mirror domain (e.g. the old
    // jasmiamimethod.vercel.app bookmark) must land back THERE after consent —
    // redirecting them to the canonical domain drops their session cookie and
    // the connect looks broken even though the token saved.
    const origin = new URL(req.url).origin;
    const appOrigin = process.env.NEXT_PUBLIC_APP_URL || "";
    const returnUrl =
      explicitReturn && /^https?:\/\//.test(explicitReturn)
        ? explicitReturn
        : appOrigin && origin !== appOrigin
          ? `${origin}/connectors`
          : null;
    // Server-side transaction: the callback identifies the athlete from this
    // row — NOT from browser cookies, which in-app mobile browsers drop.
    await prisma.oAuthTransaction.create({
      data: {
        state,
        userId: user.id,
        provider: p.key,
        returnUrl,
        expiresAt: new Date(Date.now() + 15 * 60000),
      },
    });
    cookies().set(
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
    return NextResponse.redirect(url);
  } catch {
    return Response.json(
      {
        error:
          "This connection is not configured. Use a supported file import.",
      },
      { status: 503 },
    );
  }
}
export async function callback(req: Request, provider: string) {
  // NORMALIZE: the route passes the URL segment ("google-cal") but every
  // stored row (connector, OAuthTransaction) uses the provider map key
  // ("google_cal"). Without this, the Google callback could never match
  // its own transaction (review §H2 normalization finding).
  if (provider === "google-cal") provider = "google_cal";
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirect = (error: string) =>
    NextResponse.redirect(`${base}/connectors?error=${error}`);
  const u = new URL(req.url),
    state = u.searchParams.get("state") || "";

  // STRICT binding (review §H2): the athlete is whoever STARTED this OAuth
  // transaction — the server-side row. If the state is known but already
  // used/expired → reject (replay). If the state is UNKNOWN → reject; we do
  // NOT fall back to whichever user happens to hold a browser session, which
  // could store a provider token under the wrong account.
  let userId: string | null = null;
  let returnUrl: string | null = null;
  const txn = await prisma.oAuthTransaction
    .findUnique({ where: { state } })
    .catch(() => null);
  if (
    txn &&
    txn.provider === provider &&
    !txn.usedAt &&
    txn.expiresAt > new Date()
  ) {
    userId = txn.userId;
    returnUrl = txn.returnUrl;
  } else if (txn) {
    // Known state but consumed/expired → replay or late arrival: reject.
    return redirect("invalid_state");
  } else {
    // Unknown state (legacy pre-transaction flow): allow only when a live
    // session AND a matching signed cookie for the SAME user exist.
    const sessionUser = await getCurrentUser();
    const expected: any = (() => {
      try {
        return JSON.parse(
          cookies().get(`jmm_oauth_${provider}`)?.value || "null",
        );
      } catch {
        return null;
      }
    })();
    if (
      sessionUser &&
      expected &&
      expected.userId === sessionUser.id &&
      validOAuthState(state, expected.state, provider)
    ) {
      userId = sessionUser.id;
    }
  }
  if (!userId) return redirect("session_expired");

  // Clear the legacy cookie (if any) — the transaction row is authoritative,
  // and the strict block above already rejected unknown/mismatched states.
  await prisma.oAuthTransaction.updateMany({
    where: { state, usedAt: null },
    data: { usedAt: new Date() },
  });

  cookies().set(`jmm_oauth_${provider}`, "", {
    maxAge: 0,
    path: `/api/connectors/${provider}`,
  });
  const code = u.searchParams.get("code");
  if (u.searchParams.has("error") || !code)
    return redirect("authorization_declined");
  try {
    const { p, cfg } = config(provider);
    const token: any = await p.exchange(cfg, code);
    if (!token.access_token) throw new Error("No access token returned");
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
      externalRef = String(profile.user_id ?? profile.id);
    }
    const data = {
      status: "connected",
      tokenEnc: encryptSecret(token.access_token),
      ...(token.refresh_token
        ? { refreshEnc: encryptSecret(token.refresh_token) }
        : {}),
      expiresAt: new Date(
        token.expires_at
          ? token.expires_at * 1000
          : Date.now() + (token.expires_in || 3600) * 1000,
      ),
      lastError: null,
      ...(externalRef ? { externalRef } : {}),
    };
    await prisma.connector.upsert({
      where: { userId_provider: { userId, provider: p.key } },
      create: { userId, provider: p.key, ...data },
      update: data,
    });

    // FIRST SYNC on connect — the athlete sees their data immediately,
    // not just a "connected" badge. Non-blocking (5s cap) so the redirect
    // is not held hostage by a slow provider.
    let imported = 0;
    try {
      const { syncUserConnectors } = await import("./sync");
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      const result = await Promise.race([
        syncUserConnectors(userId, p.key),
        new Promise<never>((_, rej) => ctrl.signal.addEventListener("abort", () => rej(new Error("sync timeout")))),
      ]);
      imported = result?.total || 0;
      clearTimeout(t);
    } catch (syncErr) {
      console.error("First sync after connect failed (non-fatal):", String(syncErr).slice(0, 100));
      // The hourly reconciliation cron + Refresh now button will pick it up.
    }

    const okUrl = new URL(`${base}/connectors`);
    okUrl.searchParams.set("ok", provider);
    okUrl.searchParams.set("imported", String(imported));
    return NextResponse.redirect(returnUrl ? `${returnUrl}${returnUrl.includes("?") ? "&" : "?"}ok=${provider}&imported=${imported}` : okUrl.toString());
  } catch (e) {
    const reason = String(e instanceof Error ? e.message : e)
      .replace(/Bearer\s+\S+/gi, "[redacted]")
      .slice(0, 250);
    console.error("OAuth callback failed", { provider, reason });
    return redirect("connection_failed");
  }
}
