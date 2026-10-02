import { createHmac, timingSafeEqual } from "node:crypto";
const WINDOW_MS = 10 * 60_000;
export function telegramPairingCode(userId: string, secret: string, now = Date.now()): string {
  if (!secret) throw new Error("Telegram pairing is not configured");
  return createHmac("sha256", secret).update(`jmm-private-chat:${userId}:${Math.floor(now / WINDOW_MS)}`).digest("hex").slice(0, 24).toUpperCase();
}
export function matchesTelegramPairing(message: { text?: unknown; date?: unknown; chat?: { id?: unknown; type?: unknown } }, userId: string, secret: string, now = Date.now()): boolean {
  if (!secret || message.chat?.type !== "private" || !message.chat.id || typeof message.date !== "number") return false;
  const age = now - message.date * 1000;
  if (!Number.isFinite(age) || age < 0 || age > WINDOW_MS) return false;
  const text = typeof message.text === "string" ? message.text.trim().replace(/^\/start\s+/i, "").toUpperCase() : "";
  if (!/^[0-9A-F]{24}$/.test(text)) return false;
  return [now, now - WINDOW_MS].some(time => timingSafeEqual(Buffer.from(text), Buffer.from(telegramPairingCode(userId, secret, time))));
}
