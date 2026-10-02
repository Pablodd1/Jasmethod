import { createHash, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "./db";

const SESSION_COOKIE = "jmm_session";
const SESSION_DAYS = 30;

// Only a one-way digest of the retired shared credential is retained. Never
// restore a shared login or use the digest as a password/account credential.
const REVOKED_PASSWORD_SHA256 = "0ead2060b65992dca4769af601a1b3a35ef38cfad2c2c465bb160ea764157c5d";

export function isRevokedPasswordDigest(digest: string): boolean {
  return digest === REVOKED_PASSWORD_SHA256;
}

export function isRevokedDemoPassword(password: string): boolean {
  return isRevokedPasswordDigest(createHash("sha256").update(password).digest("hex"));
}

function isSupportedPasswordHash(stored: string): boolean {
  return /^\$2[aby]\$(0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/.test(stored)
    || /^[^:]+:[0-9a-fA-F]{64}$/.test(stored);
}

// Deliberately no legacy fallback. The new namespace retires every previously
// issued cookie on deployment without changing or deleting stored sessions.
export function hashToken(token: string): string {
  return `v2:${createHash("sha256").update("jmm-session:v2:").update(token).digest("hex")}`;
}

export function hashPassword(password: string): string {
  // bcrypt with cost 10 — proper slow KDF (replaces the old SHA-256 fast hash)
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!isSupportedPasswordHash(stored)) return false;
  if (stored.startsWith("$2")) {
    try {
      return bcrypt.compareSync(password, stored);
    } catch {
      return false;
    }
  }
  // Legacy SHA-256 hash (pre-migration) — keep working; rehash on next save.
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = createHash("sha256").update(`${salt}::${password}`).digest("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(candidate, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await prisma.authSession.create({
    data: { userId, tokenHash: hashToken(token), expiresAt },
  });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  await prisma.authSession.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { profile: true, motivation: true } } },
  });
  if (!session) return null;
  if (!isSupportedPasswordHash(session.user.passwordHash)) return null;
  if (session.expiresAt < new Date()) {
    await destroySession(token);
    return null;
  }
  return session.user;
}

export async function setSessionCookie(token: string, req?: Request) {
  // ponytail: secure from transport, not NODE_ENV — server runs `start` (prod) on
  // plain-http localhost where a Secure cookie is never echoed back, locking users out.
  const proto = req?.headers.get("x-forwarded-proto")
    || (req?.url?.startsWith("https") ? "https" : "http");
  const secure = proto === "https";
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: SESSION_DAYS * 24 * 3600,
    path: "/",
  });
}

// For flows that return a redirect Response (Google Sign-In callback): attach
// the session cookie directly to that response instead of the cookie store.
export function sessionCookieOnResponse(token: string, req: Request, res: NextResponse) {
  const proto = req.headers.get("x-forwarded-proto")
    || (req.url?.startsWith("https") ? "https" : "http");
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    maxAge: SESSION_DAYS * 24 * 3600,
    path: "/",
  });
  return res;
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
