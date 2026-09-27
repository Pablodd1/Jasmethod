import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";

// GET /api/auth/google — start Google Sign-In (OAuth 2.0, openid email profile).
// Uses the SAME Google Cloud OAuth client as the Calendar connector
// (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET); the Google app must list
// {APP_URL}/api/auth/google/callback as an authorized redirect URI.
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET; // checked here so /login can show a clear message via the redirect param
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  if (!clientId || !clientSecret) {
    return NextResponse.redirect(`${base}/login?google=not-configured`);
  }
  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set("jmm_google_signin", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 600,
    path: "/",
  });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${base}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
  );
}
