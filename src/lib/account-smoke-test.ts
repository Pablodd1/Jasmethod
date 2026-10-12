import { createHash } from "node:crypto";
import { TELEGRAM_CONSENT_VERSION } from "./coaching-communication";
import { newSmokeEmailVerification } from "./account-smoke-verification";
import { isSmokeEmailAddress, type SmokeResult } from "./account-smoke-transport";

export const SMOKE_CONSENT = "account-smoke-v1";
export const SMOKE_CHANNELS = ["telegram", "email", "calendar"] as const;
export type SmokeChannel = typeof SMOKE_CHANNELS[number];
export type SmokeStatus = "processing" | "provider_accepted" | "rejected" | "unknown" | "cancelled";
export type SmokeReceipt = { channel: string; status: string; receiptId: string | null; createdAt: Date; updatedAt: Date; verificationExpiresAt?: Date | null; verifiedAt?: Date | null };
export type SmokeSnapshot = {
  userId: string; email: string;
  smokeTelegram?: { verifiedChatId: string | null; verifiedActorId: string | null; verifiedAt: Date | null } | null;
  telegram: { verifiedChatId: string | null; verifiedActorId: string | null; verifiedAt: Date | null; verificationTransport: string | null; paused: boolean; consentVersion: string | null; consentAt: Date | null } | null;
  emailPreference: { enabled: boolean; recipient: string | null; verifiedAt: Date | null; consentVersion: string | null; consentAt: Date | null } | null;
  calendar: { id: string; status: string; tokenEnc: string | null; expiresAt: Date | null; scope: string | null } | null;
};
export function smokeAccountAllowed(userId: string, env: Record<string, string | undefined> = process.env) {
  return env.ENABLE_ACCOUNT_SMOKE_TEST === "true" && !!env.JMM_SMOKE_TEST_USER_ID && env.JMM_SMOKE_TEST_USER_ID === userId;
}
export function smokeKey(userId: string, channel: SmokeChannel) {
  // Never client-controlled: one lifetime attempt per channel for this reviewed test version.
  return createHash("sha256").update(JSON.stringify([SMOKE_CONSENT, userId, channel])).digest("hex");
}
export function smokeDestination(s: SmokeSnapshot, channel: SmokeChannel, env: Record<string, string | undefined> = process.env, now = new Date()) {
  let destination: string | null = null;
  let reason: string | null = null;
  if (channel === "telegram") {
    const p = s.telegram; const dedicated = s.smokeTelegram;
    if (!env.TELEGRAM_BOT_TOKEN) reason = "Telegram service is not configured.";
    else if (dedicated?.verifiedAt && dedicated.verifiedChatId && /^[1-9]\d{0,15}$/.test(dedicated.verifiedChatId) && dedicated.verifiedActorId === dedicated.verifiedChatId) destination = dedicated.verifiedChatId;
    else if (!p?.verifiedAt || p.verificationTransport !== "telegram" || !p.verifiedChatId || !/^\d{1,20}$/.test(p.verifiedChatId) || p.verifiedActorId !== p.verifiedChatId) reason = "A verified private Telegram chat is required.";
    else if (p.paused || p.consentVersion !== TELEGRAM_CONSENT_VERSION || !p.consentAt) reason = "Current Telegram consent is required; delivery is paused or consent is missing.";
    else destination = p.verifiedChatId;
  } else if (channel === "email") {
    if (!env.SMTP_HOST || !env.SMTP_FROM) reason = "Email service is not configured.";
    else if (!isSmokeEmailAddress(s.email)) reason = "A valid saved account email is required.";
    else destination = s.email;
  } else {
    const c = s.calendar;
    if (!c || c.status !== "connected" || !c.tokenEnc || !c.expiresAt || c.expiresAt <= now || !c.scope?.split(/\s+/).some(scope => ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.events.owned"].includes(scope))) reason = "A current smoke-only Calendar connection is required. Normal Calendar sync is not used.";
    else destination = "primary";
  }
  const source = channel === "telegram" ? { regular: s.telegram, dedicated: s.smokeTelegram } : channel === "email" ? { email: s.email, ...s.emailPreference } : s.calendar;
  // Digest only; credentials and private recipient IDs never leave the server.
  const revision = createHash("sha256").update(JSON.stringify([SMOKE_CONSENT, s.userId, channel, source])).digest("hex");
  const label = channel === "email" ? s.email : channel === "telegram" ? "Your verified private Telegram chat" : "Primary calendar on your smoke-only Google connection";
  const requiresVerification = channel === "email" && !(s.emailPreference?.verifiedAt && s.emailPreference.recipient === s.email);
  return { destination, reason, revision, label, requiresVerification };
}
export function parseSmokeRequest(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid smoke-test request");
  const b = value as Record<string, unknown>;
  if (Object.keys(b).some(k => !["channel", "consentVersion", "destinationRevision"].includes(k)) || !SMOKE_CHANNELS.includes(b.channel as SmokeChannel) || b.consentVersion !== SMOKE_CONSENT || typeof b.destinationRevision !== "string" || !/^[a-f0-9]{64}$/.test(b.destinationRevision)) throw Error("Review and consent to the fixed smoke test for one channel");
  return { channel: b.channel as SmokeChannel, destinationRevision: b.destinationRevision };
}
export interface SmokeStore {
  snapshot(userId: string): Promise<SmokeSnapshot>;
  claim(userId: string, channel: SmokeChannel, key: string, revision: string, verification?: { verificationHash: string; verificationExpiresAt: Date; verifiedEmailHash: string }): Promise<{ claimed: boolean; receipt: SmokeReceipt }>;
  finish(userId: string, channel: SmokeChannel, result: { status: SmokeStatus; receiptId: string | null }): Promise<SmokeReceipt>;
}
export async function runAccountSmoke(userId: string, request: ReturnType<typeof parseSmokeRequest>, deps: {
  store: SmokeStore; env?: Record<string, string | undefined>;
  send(channel: SmokeChannel, snapshot: SmokeSnapshot, destination: string, key: string, verificationCode?: string): Promise<SmokeResult>;
}) {
  const env = deps.env || process.env;
  if (!smokeAccountAllowed(userId, env)) throw Error("This account is not enabled for the smoke test");
  const snapshot = await deps.store.snapshot(userId);
  if (snapshot.userId !== userId) throw Error("Account mismatch");
  const target = smokeDestination(snapshot, request.channel, env);
  if (!target.destination || target.reason || target.revision !== request.destinationRevision) throw Error(target.reason || "Saved destination or consent changed. Reload before continuing.");
  const key = smokeKey(userId, request.channel);
  const verification = target.requiresVerification ? newSmokeEmailVerification(userId, snapshot.email) : undefined;
  const claim = await deps.store.claim(userId, request.channel, key, target.revision, verification ? { verificationHash: verification.verificationHash, verificationExpiresAt: verification.verificationExpiresAt, verifiedEmailHash: verification.verifiedEmailHash } : undefined);
  if (!claim.claimed) return claim.receipt;
  // Persist the claim BEFORE external I/O. A crash or receipt-storage failure leaves
  // a non-retryable claim. A second request can never reclaim it or resend.
  let current: SmokeSnapshot;
  try {
    current = await deps.store.snapshot(userId);
    const latest = smokeDestination(current, request.channel, env);
    if (!smokeAccountAllowed(userId, env) || current.userId !== userId || latest.reason || latest.revision !== target.revision) {
      return await deps.store.finish(userId, request.channel, { status: "cancelled", receiptId: null });
    }
  } catch {
    return await deps.store.finish(userId, request.channel, { status: "cancelled", receiptId: null });
  }
  let result: SmokeResult;
  try { result = await deps.send(request.channel, current, target.destination, key, verification?.code); }
  catch { result = { status: "unknown", receiptId: null }; }
  return deps.store.finish(userId, request.channel, result);
}
export function publicSmokeReceipt(receipt: SmokeReceipt, now = new Date()) {
  return { channel: receipt.channel, status: receipt.status === "processing" && now.getTime() - receipt.createdAt.getTime() > 60_000 ? "unknown" : receipt.status,
    receiptId: receipt.receiptId, verificationPending: !!receipt.verificationExpiresAt && !receipt.verifiedAt, verifiedAt: receipt.verifiedAt?.toISOString() || null, attemptedAt: receipt.createdAt.toISOString(), updatedAt: receipt.updatedAt.toISOString() };
}
