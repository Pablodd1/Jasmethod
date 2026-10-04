import { createHash, randomBytes } from "crypto";
import nodemailer from "nodemailer";
import { prisma } from "./db";
import { hashPassword, isRevokedDemoPassword } from "./auth";
import { signInBase } from "./sign-in-config";

export const resetRequestMessage = "If an account matches and email delivery is available, you will receive a password reset link. Check your inbox and spam folder.";
export function passwordResetError(password: unknown): string | null {
  if (typeof password !== "string" || password.length < 12 || Buffer.byteLength(password, "utf8") > 72)
    return "Use at least 12 characters and no more than 72 UTF-8 bytes.";
  return isRevokedDemoPassword(password) ? "Choose a new, unique password." : null;
}
export function resetTokenHash(token: string) {
  return createHash("sha256").update("jmm-password-reset:v1:").update(token).digest("hex");
}
export function resetOriginAllowed(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || origin === signInBase(req);
}

// Reset emails deliberately bypass the general email logger: neither bodies,
// bearer links nor raw transport errors may be persisted or logged.
async function sendResetEmail(email: string, link: string): Promise<boolean> {
  if (!process.env.SMTP_HOST) return false;
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true", requireTLS: process.env.SMTP_SECURE !== "true",
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    auth: { user: process.env.SMTP_USER || "", pass: process.env.SMTP_PASS || "" },
  });
  try {
    const result = await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email, subject: "Reset your JMM password",
      text: `A password reset was requested for your JMM account. Open this link within 30 minutes:\n${link}\n\nIf you did not request this, ignore this email. Your password has not changed.`,
    });
    return Array.isArray(result.accepted) && result.accepted.length > 0 && !result.rejected?.length;
  } catch { return false; }
  finally { transport.close(); }
}

export async function requestPasswordReset(req: Request, email: string, actorId?: string) {
  const base = signInBase(req);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) return "not-found" as const;
  const token = randomBytes(32).toString("base64url"), tokenHash = resetTokenHash(token);
  const now = new Date();
  const issued = await prisma.$transaction(async tx => {
    // Serialize issuance and consumption per account, across all app instances.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
    const current = await tx.passwordReset.findUnique({ where: { userId: user.id } });
    if (current && current.createdAt.getTime() > now.getTime() - 60_000) return false;
    await tx.passwordReset.upsert({ where: { userId: user.id },
      create: { userId: user.id, tokenHash, createdAt: now, expiresAt: new Date(now.getTime() + 30 * 60_000) },
      update: { tokenHash, createdAt: now, expiresAt: new Date(now.getTime() + 30 * 60_000) } });
    if (actorId) await tx.auditLog.create({ data: { actorId, subjectId: user.id, action: "password_reset_requested", note: "Administrator requested email recovery; no credentials disclosed." } });
    return true;
  });
  if (!issued) return "throttled" as const;
  const sent = await sendResetEmail(user.email, `${base}/reset-password#token=${token}`);
  if (!sent) await prisma.passwordReset.deleteMany({ where: { userId: user.id, tokenHash } });
  if (actorId) await prisma.auditLog.create({ data: { actorId, subjectId: user.id,
    action: sent ? "password_reset_email_accepted" : "password_reset_email_failed",
    note: sent ? "SMTP accepted the message; inbox delivery is not guaranteed." : "SMTP did not accept the message; reset token invalidated." } });
  return sent ? "sent" as const : "delivery-failed" as const;
}

export async function resetPassword(token: unknown, password: unknown): Promise<boolean> {
  if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token) || passwordResetError(password)) return false;
  const tokenHash = resetTokenHash(token);
  const record = await prisma.passwordReset.findUnique({ where: { tokenHash } });
  if (!record || record.expiresAt <= new Date()) return false;
  const passwordHash = hashPassword(password as string);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${record.userId} FOR UPDATE`;
    const consumed = await tx.passwordReset.deleteMany({ where: { userId: record.userId, tokenHash, expiresAt: { gt: new Date() } } });
    if (consumed.count !== 1) return false;
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.authSession.deleteMany({ where: { userId: record.userId } });
    await tx.signInTransaction.deleteMany({ where: { linkUserId: record.userId } });
    await tx.auditLog.create({ data: { actorId: record.userId, subjectId: record.userId, action: "password_reset_completed", note: "Password changed; all sessions and pending sign-in links revoked." } });
    return true;
  });
}
