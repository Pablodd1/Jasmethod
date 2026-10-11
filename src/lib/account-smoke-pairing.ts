import { createHash, randomBytes } from "node:crypto";
import { prisma } from "./db";
import { ApiError } from "./access";
import { smokeAccountAllowed } from "./account-smoke-test";
import { parseTelegramUpdate } from "./telegram-coaching-transport";

export const TELEGRAM_SMOKE_PAIR_CONSENT = "telegram-smoke-pair-v1";
const challengeHash = (token: string) => createHash("sha256").update(token).digest("hex");
function botUsername(env: Record<string, string | undefined>) {
  return env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || env.TELEGRAM_BOT_USERNAME || "";
}
export function smokeTelegramPairingConfigured(env: Record<string, string | undefined> = process.env) {
  return !!env.JMM_SMOKE_TEST_USER_ID && smokeAccountAllowed(env.JMM_SMOKE_TEST_USER_ID, env)
    && !!env.TELEGRAM_BOT_TOKEN && !!env.TELEGRAM_COACHING_WEBHOOK_SECRET
    && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(botUsername(env));
}

/** Small byte-bounded body reader, including requests without Content-Length. */
export async function smokeBoundedBody(req: Request, limit: number): Promise<string> {
  if (Number(req.headers.get("content-length") || 0) > limit) throw new ApiError("Request too large", 413);
  const reader = req.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    if (reader) while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new ApiError("Request too large", 413); }
      chunks.push(value);
    }
  } finally { reader?.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
export function parseSmokePairConsent(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)
      || Object.keys(value).length !== 1
      || (value as Record<string, unknown>).consentVersion !== TELEGRAM_SMOKE_PAIR_CONSENT)
    throw new ApiError("Review the smoke-only Telegram pairing consent", 400);
}
export async function startSmokeTelegramPairing(userId: string, now = new Date()) {
  if (!smokeAccountAllowed(userId) || !smokeTelegramPairingConfigured())
    throw new ApiError("Smoke-only Telegram pairing is unavailable", 403);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + 10 * 60_000);
  const data = { challengeHash: challengeHash(token), challengeExpiresAt: expiresAt,
    verifiedChatId: null, verifiedActorId: null, verifiedAt: null };
  await prisma.accountSmokeTelegram.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return { pairingUrl: `https://t.me/${botUsername(process.env)}?start=${token}`, expiresAt, paired: false };
}

/** Called only after the existing webhook secret has been authenticated. Never sends a bot reply. */
export async function processSmokeTelegramPairing(value: unknown, now = new Date()): Promise<{ handled: boolean; paired?: boolean }> {
  if (!smokeTelegramPairingConfigured()) return { handled: false };
  let update: ReturnType<typeof parseTelegramUpdate>;
  try { update = parseTelegramUpdate(value, now); } catch { return { handled: false }; }
  if (update.kind !== "pair") return { handled: false };
  const userId = process.env.JMM_SMOKE_TEST_USER_ID!;
  const hash = challengeHash(update.token);
  return prisma.$transaction(async tx => {
    const pairing = await tx.accountSmokeTelegram.findUnique({ where: { userId } });
    if (!pairing || pairing.challengeHash !== hash) return { handled: false };
    if (!smokeAccountAllowed(userId) || !pairing.challengeExpiresAt || pairing.challengeExpiresAt <= now)
      return { handled: true, paired: false };
    const foreign = await tx.communicationPreference.findFirst({ where: {
      verifiedChatId: update.chatId, userId: { not: userId },
    } });
    if (foreign) return { handled: true, paired: false };
    const claim = await tx.accountSmokeTelegram.updateMany({ where: { userId,
      challengeHash: hash, challengeExpiresAt: { gt: now } }, data: {
      verifiedChatId: update.chatId, verifiedActorId: update.actorId, verifiedAt: now,
      challengeHash: null, challengeExpiresAt: null,
    } });
    return { handled: true, paired: claim.count === 1 };
  }, { isolationLevel: "Serializable" });
}
