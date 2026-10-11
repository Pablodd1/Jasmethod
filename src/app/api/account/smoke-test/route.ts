import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appMutationOriginAllowed } from "@/lib/request-origin";
import { rateLimit } from "@/lib/ratelimit";
import { accountSmokeStore } from "@/lib/account-smoke-store";
import { parseSmokeRequest, publicSmokeReceipt, runAccountSmoke, SMOKE_CHANNELS, SMOKE_CONSENT, smokeAccountAllowed, smokeDestination } from "@/lib/account-smoke-test";
import { sendSmokeCalendar, sendSmokeEmail, sendSmokeEmailVerification, sendSmokeTelegram } from "@/lib/account-smoke-transport";
import { decryptSecret } from "@/lib/crypto";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function actor(req: Request) {
  const user = await getCurrentUser();
  if (!user) return { response: json({ error: "Sign in to continue" }, 401) };
  if (new URL(req.url).search || !smokeAccountAllowed(user.id)) return { response: json({ error: "This smoke test is restricted to its enabled account" }, 403) };
  return { user };
}
export async function GET(req: Request) {
  try {
    const auth = await actor(req); if (auth.response) return auth.response;
    const user = auth.user!;
    const [snapshot, receipts] = await Promise.all([accountSmokeStore.snapshot(user.id), prisma.accountSmokeReceipt.findMany({ where: { userId: user.id, consentVersion: SMOKE_CONSENT } })]);
    return json({ consentVersion: SMOKE_CONSENT, channels: SMOKE_CHANNELS.map(channel => {
      const { reason, revision, label, requiresVerification } = smokeDestination(snapshot, channel);
      const receipt = receipts.find(r => r.channel === channel);
      return { channel, label, reason, requiresVerification, destinationRevision: revision, receipt: receipt ? publicSmokeReceipt(receipt) : null };
    }) });
  } catch { return json({ error: "Smoke-test status is unavailable. No new test was started." }, 503); }
}
export async function POST(req: Request) {
  if (!appMutationOriginAllowed(req)) return json({ error: "Same-origin request required" }, 403);
  try {
    const auth = await actor(req); if (auth.response) return auth.response;
    const user = auth.user!;
    if (!rateLimit(`account-smoke:${user.id}`, 10, 60_000).ok) return json({ error: "Please wait before checking again" }, 429);
    if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" || Number(req.headers.get("content-length") || 0) > 1024) return json({ error: "Invalid request" }, 400);
    const reader = req.body?.getReader(); const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      if (reader) while (true) {
        const { done, value } = await reader.read(); if (done) break;
        bytes += value.byteLength;
        if (bytes > 1024) { await reader.cancel(); return json({ error: "Request too large" }, 413); }
        chunks.push(value);
      }
    } finally { reader?.releaseLock(); }
    const text = Buffer.concat(chunks).toString("utf8");
    let request;
    try { request = parseSmokeRequest(JSON.parse(text)); } catch { return json({ error: "Review and consent to the fixed test for one channel" }, 400); }
    const receipt = await runAccountSmoke(user.id, request, { store: accountSmokeStore, send: async (channel, snapshot, destination, key, verificationCode) => {
      if (channel === "telegram") return sendSmokeTelegram(destination);
      if (channel === "email") return verificationCode ? sendSmokeEmailVerification(destination, verificationCode) : sendSmokeEmail(destination);
      const token = decryptSecret(snapshot.calendar?.tokenEnc);
      if (!token) return { status: "rejected", receiptId: null };
      return sendSmokeCalendar({ token, eventId: key, start: new Date(Date.now() + 5 * 60_000) });
    } });
    const result = publicSmokeReceipt(receipt);
    // Only verified provider acceptance is a successful HTTP completion.
    return json({ receipt: result }, result.status === "provider_accepted" ? 200 : result.status === "processing" ? 202 : 409);
  } catch {
    return json({ error: "Test could not be confirmed. Reload status before any further action; an uncertain attempt is never resent." }, 409);
  }
}
