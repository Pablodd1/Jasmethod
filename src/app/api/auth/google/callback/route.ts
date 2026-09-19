import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { createSession, sessionCookieOnResponse, hashPassword } from "@/lib/auth";
import { syncAdminRole } from "@/lib/admin";
import { randomBytes, timingSafeEqual } from "crypto";

// GET /api/auth/google/callback — finish Google Sign-In.
// Exchanges the code, reads the verified email from the id_token, then:
//   existing user  → log them in (account linking by email)
//   new user       → create the account (Google name), then onboard
// Either way, an ADMIN_EMAILS match is promoted to admin before the session.
export async function GET(req: Request) {
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const fail = (reason: string) =>
    NextResponse.redirect(`${base}/login?google=error&reason=${encodeURIComponent(reason)}`);

  try {
    if (!code || !state) return fail("missing_code_or_state");

    // CSRF: state must match the cookie we set in step 1.
    const store = cookies();
    const expected = store.get("jmm_google_signin")?.value;
    const stateOk =
      !!expected &&
      expected.length === state.length &&
      timingSafeEqual(Buffer.from(expected), Buffer.from(state));
    if (!stateOk) return fail("state_mismatch");
    store.delete("jmm_google_signin");

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${base}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) return fail("token_exchange_failed");
    const tokens = (await tokenRes.json()) as { id_token?: string };

    // The id_token arrived directly from Google over TLS as part of the code
    // exchange (we are the audience), so decoding the payload without a JWKS
    // signature check is the standard practice for this flow.
    const idToken = tokens.id_token;
    if (!idToken) return fail("no_id_token");
    const payload = JSON.parse(
      Buffer.from(idToken.split(".")[1], "base64url").toString("utf8"),
    ) as { email?: string; email_verified?: boolean; name?: string; aud?: string };
    if (!payload.email) return fail("no_email");
    if (payload.email_verified === false) return fail("email_not_verified");
    if (payload.aud && payload.aud !== clientId) return fail("audience_mismatch");

    const email = payload.email.toLowerCase().trim();
    let user = await prisma.user.findUnique({ where: { email } });
    const isNew = !user;

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: payload.name?.trim() || email.split("@")[0],
          passwordHash: hashPassword(randomBytes(32).toString("hex")), // unguessable — this account signs in with Google
          profile: { create: {} },
          motivation: { create: {} },
        },
      });
    }

    await syncAdminRole(user);
    const token = await createSession(user.id);
    const dest = isNew ? `${base}/onboard` : `${base}/today`;
    return sessionCookieOnResponse(token, req, NextResponse.redirect(dest));
  } catch (e: any) {
    console.error("google signin error:", e);
    return fail("server_error");
  }
}
