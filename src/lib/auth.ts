import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./db";

const SESSION_COOKIE = "jmm_session";
const SESSION_DAYS = 30;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashPassword(password: string): string {
  // bcrypt-style via scrypt (no native bcrypt dep needed on serverless)
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(`${salt}::${password}`).digest("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
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
  const store = cookies();
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
  const store = cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: SESSION_DAYS * 24 * 3600,
    path: "/",
  });
}

export async function clearSessionCookie() {
  const store = cookies();
  store.delete(SESSION_COOKIE);
}
