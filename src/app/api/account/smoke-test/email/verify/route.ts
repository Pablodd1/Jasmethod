import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appMutationOriginAllowed } from "@/lib/request-origin";
import { smokeAccountAllowed, SMOKE_CONSENT } from "@/lib/account-smoke-test";
import { smokeCodeMatches, smokeEmailHash } from "@/lib/account-smoke-verification";
export const dynamic = "force-dynamic";
const json = (body: unknown, status: number) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function POST(req: Request) {
  if (!appMutationOriginAllowed(req)) return json({ error: "Same-origin request required" }, 403);
  try {
    const user = await getCurrentUser();
    if (!user) return json({ error: "Sign in to continue" }, 401);
    if (!smokeAccountAllowed(user.id) || new URL(req.url).search) return json({ error: "Smoke test unavailable for this account" }, 403);
    if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json" || Number(req.headers.get("content-length") || 0) > 256) return json({ error: "Invalid verification request" }, 400);
    const reader = req.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try {
      if (reader) while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > 256) { await reader.cancel(); return json({ error: "Request too large" }, 413); } chunks.push(value);
      }
    } finally { reader?.releaseLock(); }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => key !== "code") || typeof body.code !== "string" || !/^[A-F0-9]{12}$/.test(body.code)) return json({ error: "Enter the 12-character code from your smoke-test email" }, 400);
    const now = new Date();
    const verified = await prisma.$transaction(async tx => {
      const current = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { email: true } });
      if (current.email !== user.email) return false;
      const row = await tx.accountSmokeReceipt.findUnique({ where: { userId_channel_consentVersion: { userId: user.id, channel: "email", consentVersion: SMOKE_CONSENT } } });
      if (!row?.verificationHash || !row.verificationExpiresAt || row.verificationExpiresAt <= now || row.verificationAttempts >= 5 || row.verifiedEmailHash !== smokeEmailHash(current.email) || row.verifiedAt) return false;
      const attempt = await tx.accountSmokeReceipt.updateMany({ where: { id: row.id, userId: user.id, verificationHash: row.verificationHash, verificationExpiresAt: { gt: now }, verificationAttempts: { lt: 5 }, verifiedAt: null }, data: { verificationAttempts: { increment: 1 } } });
      if (attempt.count !== 1 || !smokeCodeMatches(user.id, current.email, body.code, row.verificationHash)) return false;
      const result = await tx.accountSmokeReceipt.updateMany({ where: { id: row.id, userId: user.id, verificationHash: row.verificationHash, verifiedAt: null }, data: { verifiedAt: now, verificationHash: null, verificationExpiresAt: null } });
      return result.count === 1;
    }, { isolationLevel: "Serializable" });
    return json(verified ? { verified: true, message: "You confirmed receipt of this smoke-test email. No other email was sent or enabled." } : { error: "Code incorrect, expired or unavailable. The test will not be resent." }, verified ? 200 : 409);
  } catch { return json({ error: "Email verification could not be confirmed. No email was sent." }, 409); }
}
