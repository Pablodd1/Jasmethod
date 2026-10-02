import { createHash, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "./db";

const SESSION_COOKIE = "jmm_session";
const SESSION_DAYS = 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string): string {
  // bcrypt with cost 10 — proper slow KDF (replaces the old SHA-256 fast hash)
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith("$2")) {
    return bcrypt.compareSync(password, stored);
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
