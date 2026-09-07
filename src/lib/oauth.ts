import { cookies } from "next/headers";
import { randomBytes, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import { prisma } from "./db";
import { encryptSecret } from "./crypto";
import * as api from "./importers";

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
      state = randomBytes(32).toString("hex");
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
    !/^([a-f0-9]{64})$/.test(state) ||
    state.length !== expected.state?.length ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(expected.state))
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
      where: { userId_provider: { userId: user.id, provider: p.key } },
      create: { userId: user.id, provider: p.key, ...data },
      update: data,
    });
    return NextResponse.redirect(`${base}/connectors?ok=${provider}&pending=1`);
  } catch (e) {
    console.error("OAuth callback failed for", provider);
    return redirect("connection_failed");
  }
}
