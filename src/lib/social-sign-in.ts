import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "./db";
import { createSession, getCurrentUser, hashPassword, hashToken, sessionCookieOnResponse } from "./auth";
import { syncAdminRole } from "./admin";
import { clientIp, rateLimit } from "./ratelimit";
import { signInBase, signInConfig, type SignInProvider } from "./sign-in-config";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");
const cookieName = (provider: string) => `jmm_signin_${provider}`;
const keys = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
class SignInError extends Error {}

function cookieOptions(provider: SignInProvider, base: string) {
  return { httpOnly: true, secure: base.startsWith("https:"), sameSite: provider === "apple" ? "none" as const : "lax" as const, path: "/api/auth", maxAge: 600 };
}
function failure(req: Request, provider: SignInProvider, reason: string) {
  let base: string;
  try { base = signInBase(req); } catch { return NextResponse.json({ error: "Sign-in is not configured. Contact the administrator." }, { status: 503 }); }
  const response = NextResponse.redirect(`${base}/login?provider=${provider}&error=${encodeURIComponent(reason)}`, 303);
  response.cookies.set(cookieName(provider), "", { ...cookieOptions(provider, base), maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function startSignIn(req: Request, provider: SignInProvider) {
  try {
    const base = signInBase(req), config = signInConfig(provider);
    if (!config || (provider === "apple" && !base.startsWith("https:"))) return failure(req, provider, "not_configured");
    // Establish the cookie on the same canonical host as the registered callback.
    if (new URL(req.url).origin !== base) {
      const linkQuery = new URL(req.url).searchParams.get("link") === "1" ? "?link=1" : "";
      return NextResponse.redirect(`${base}/api/auth/${provider}${linkQuery}`, 303);
    }
    if (!rateLimit(`social:${clientIp(req)}`, 20, 600_000).ok)
      return NextResponse.json({ error: "Too many sign-in attempts. Please try again later." }, { status: 429 });
    const link = new URL(req.url).searchParams.get("link") === "1";
    const user = link ? await getCurrentUser() : null;
    if (link && !user) return failure(req, provider, "account_link_required");
    const linkToken = user ? (await cookies()).get("jmm_session")?.value : null;
    if (link && !linkToken) return failure(req, provider, "account_link_required");
    const state = random(), browser = random(), nonce = random(), verifier = random();
    const redirectUri = `${base}/api/auth/${provider}/callback`;
    await prisma.signInTransaction.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    await prisma.signInTransaction.create({ data: {
      stateHash: digest(state), browserHash: digest(browser), provider, clientId: config.clientId,
      redirectUri, nonce, verifier, linkUserId: user?.id || null,
      linkSessionHash: linkToken ? hashToken(linkToken) : null, expiresAt: new Date(Date.now() + 600_000),
    } });
    const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: redirectUri,
      response_type: "code", scope: provider === "apple" ? "name email" : "openid email profile", state, nonce });
    if (provider === "apple") params.set("response_mode", "form_post");
    else {
      params.set("code_challenge_method", "S256");
      params.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
    }
    if (provider === "google") params.set("prompt", "select_account");
    const response = NextResponse.redirect(`${config.authorize}?${params}`, 303);
    response.cookies.set(cookieName(provider), browser, cookieOptions(provider, base));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return failure(req, provider, "server_error");
  }
}

export async function verifySignInToken(token: string, provider: SignInProvider, nonce: string,
  keyOverride?: ReturnType<typeof createRemoteJWKSet>) {
  const config = signInConfig(provider);
  if (!config) throw new SignInError("not_configured");
  if (!keys.has(config.jwks)) keys.set(config.jwks, createRemoteJWKSet(new URL(config.jwks), { timeoutDuration: 10_000 }));
  const { payload } = await jwtVerify(token, keyOverride || keys.get(config.jwks)!, {
    issuer: provider === "google" ? [config.issuer, "accounts.google.com"] : config.issuer,
    audience: config.clientId, algorithms: ["RS256"], requiredClaims: ["sub", "iat", "exp", "nonce"], clockTolerance: 5, maxTokenAge: "10m",
  });
  if (!payload.sub || payload.nonce !== nonce || (payload.azp !== undefined && payload.azp !== config.clientId) ||
    (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== config.clientId))
    throw new SignInError("verification_failed");
  const email = typeof payload.email === "string" && (payload.email_verified === true || payload.email_verified === "true")
    ? payload.email.trim().toLowerCase() : null;
  return { subject: payload.sub, email, name: typeof payload.name === "string" ? payload.name.slice(0, 120) : null };
}

async function appleSecret(clientId: string) {
  const key = await importPKCS8(process.env.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n"), "ES256");
  return new SignJWT({}).setProtectedHeader({ alg: "ES256", kid: process.env.APPLE_KEY_ID! })
    .setIssuer(process.env.APPLE_TEAM_ID!).setSubject(clientId).setAudience("https://appleid.apple.com")
    .setIssuedAt().setExpirationTime("5m").sign(key);
}

export async function finishSignIn(req: Request, provider: SignInProvider) {
  try {
    const base = signInBase(req), config = signInConfig(provider);
    if (!config) return failure(req, provider, "not_configured");
    let params: URLSearchParams;
    if (req.method === "POST") {
      if (!req.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return failure(req, provider, "verification_failed");
      const reader = req.body?.getReader();
      if (!reader) return failure(req, provider, "verification_failed");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 16_384) { await reader.cancel(); return failure(req, provider, "verification_failed"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    } else params = new URL(req.url).searchParams;
    const state = params.get("state"), code = params.get("code");
    const browser = (await cookies()).get(cookieName(provider))?.value;
    if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || !browser || !/^[A-Za-z0-9_-]{43}$/.test(browser))
      return failure(req, provider, "invalid_state");
    const stateHash = digest(state);
    const tx = await prisma.signInTransaction.findUnique({ where: { stateHash } });
    if (!tx || tx.provider !== provider || tx.clientId !== config.clientId || tx.browserHash !== digest(browser) ||
      tx.expiresAt <= new Date() || tx.redirectUri !== `${base}/api/auth/${provider}/callback`)
      return failure(req, provider, "invalid_state");
    const claimed = await prisma.signInTransaction.deleteMany({ where: { stateHash, browserHash: digest(browser), expiresAt: { gt: new Date() } } });
    if (claimed.count !== 1) return failure(req, provider, "invalid_state");
    if (params.has("error")) return failure(req, provider, "cancelled");
    if (tx.linkUserId) {
      const session = tx.linkSessionHash ? await prisma.authSession.findUnique({ where: { tokenHash: tx.linkSessionHash } }) : null;
      if (!session || session.userId !== tx.linkUserId || session.expiresAt <= new Date()) return failure(req, provider, "account_link_required");
    }
    if (!code || code.length > 4096) return failure(req, provider, "verification_failed");
    const body = new URLSearchParams({ grant_type: "authorization_code", code, client_id: config.clientId, redirect_uri: tx.redirectUri });
    const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
    if (provider !== "apple") body.set("code_verifier", tx.verifier);
    if (provider === "apple") body.set("client_secret", await appleSecret(config.clientId));
    else if (config.method === "client_secret_basic") headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.secret)}`).toString("base64")}`;
    else if (config.method === "client_secret_post") body.set("client_secret", config.secret);
    const tokenResponse = await fetch(config.token, { method: "POST", headers, body, signal: AbortSignal.timeout(10_000), cache: "no-store", redirect: "error" });
    if (!tokenResponse.ok) return failure(req, provider, "verification_failed");
    const tokens = await tokenResponse.json();
    if (typeof tokens.id_token !== "string") return failure(req, provider, "verification_failed");
    let identity;
    try { identity = await verifySignInToken(tokens.id_token, provider, tx.nonce); }
    catch { return failure(req, provider, "verification_failed"); }
    const mapping = { issuer: config.issuer, clientId: config.clientId, subject: identity.subject };
    const user = await prisma.$transaction(async db => {
      const account = await db.signInAccount.findUnique({ where: { issuer_clientId_subject: mapping }, include: { user: true } });
      if (account) {
        if (tx.linkUserId && account.userId !== tx.linkUserId) throw new SignInError("account_link_required");
        return account.user;
      }
      if (tx.linkUserId) {
        const owner = await db.user.findUnique({ where: { id: tx.linkUserId } });
        if (!owner) throw new SignInError("account_link_required");
        await db.signInAccount.create({ data: { ...mapping, provider, userId: owner.id } });
        return owner;
      }
      if (!identity.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email)) throw new SignInError("email_required");
      const existing = await db.user.findUnique({ where: { email: identity.email } });
      if (existing) throw new SignInError("account_link_required");
      return db.user.create({ data: {
        email: identity.email, name: identity.name || identity.email.split("@")[0], role: "athlete",
        passwordHash: hashPassword(randomBytes(32).toString("hex")),
        profile: { create: {} }, motivation: { create: {} }, signInAccounts: { create: { ...mapping, provider } },
      } });
    });
    if (identity.email === user.email) await syncAdminRole(user);
    const session = await createSession(user.id);
    const response = NextResponse.redirect(`${base}${user.onboarded ? "/today" : "/onboard"}`, 303);
    response.cookies.set(cookieName(provider), "", { ...cookieOptions(provider, base), maxAge: 0 });
    response.headers.set("Cache-Control", "no-store");
    return sessionCookieOnResponse(session, new Request(`${base}/`), response);
  } catch (error) {
    return failure(req, provider, error instanceof SignInError ? error.message : "server_error");
  }
}
