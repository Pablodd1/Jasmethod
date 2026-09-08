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
  return {
    p,
    cfg: {
      clientId,
      clientSecret,
      redirectUri: `${base}/api/connectors/${provider}/callback`,
    },
  };
}
export async function authorize(req: Request, provider: string) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  try {
    const { p, cfg } = config(provider),
      state = createOAuthState(provider);
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
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirect = (error: string) =>
    NextResponse.redirect(`${base}/connectors?error=${error}`);
  const user = await getCurrentUser();
  if (!user) return redirect("session_expired");
  const u = new URL(req.url),
    state = u.searchParams.get("state") || "";
  let expected: any;
  try {
    expected = JSON.parse(
      cookies().get(`jmm_oauth_${provider}`)?.value || "null",
    );
  } catch {}
  cookies().set(`jmm_oauth_${provider}`, "", {
    maxAge: 0,
    path: `/api/connectors/${provider}`,
  });
  if (
    !expected ||
    expected.userId !== user.id ||
    !validOAuthState(state, expected.state, provider)
  )
    return redirect("invalid_state");
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
        "https://api.prod.whoop.com/developer/v1/user/profile/basic",
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
      where: { userId_provider: { userId: user.id, provider: p.key } },
      create: { userId: user.id, provider: p.key, ...data },
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
        syncUserConnectors(user.id, p.key),
        new Promise<never>((_, rej) => ctrl.signal.addEventListener("abort", () => rej(new Error("sync timeout")))),
      ]);
      imported = result?.total || 0;
      clearTimeout(t);
    } catch (syncErr) {
      console.error("First sync after connect failed (non-fatal):", String(syncErr).slice(0, 100));
      // The 5 AM cron + Sync now button will pick it up.
    }

    return NextResponse.redirect(
      `${base}/connectors?ok=${provider}&imported=${imported}`,
    );
  } catch (e) {
    const reason = String(e instanceof Error ? e.message : e)
      .replace(/Bearer\s+\S+/gi, "[redacted]")
      .slice(0, 250);
    console.error("OAuth callback failed", { provider, reason });
    return redirect("connection_failed");
  }
}
