import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
export const smokeEmailHash = (email: string) => createHash("sha256").update(email).digest("hex");
export const smokeCodeHash = (userId: string, email: string, code: string) => createHash("sha256").update(JSON.stringify(["account-smoke-email-v1", userId, email, code])).digest("hex");
export function newSmokeEmailVerification(userId: string, email: string, now = new Date()) {
  const code = randomBytes(6).toString("hex").toUpperCase();
  return { code, verificationHash: smokeCodeHash(userId, email, code), verificationExpiresAt: new Date(now.getTime() + 15 * 60000), verifiedEmailHash: smokeEmailHash(email) };
}
export function smokeCodeMatches(userId: string, email: string, code: unknown, hash: string | null) {
  return typeof code === "string" && /^[A-F0-9]{12}$/.test(code) && !!hash && /^[a-f0-9]{64}$/.test(hash) && timingSafeEqual(Buffer.from(smokeCodeHash(userId, email, code), "hex"), Buffer.from(hash, "hex"));
}
