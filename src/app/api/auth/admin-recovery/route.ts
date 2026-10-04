import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { timingSafeEqual } from "crypto";
import { passwordResetError } from "@/lib/password-reset";

// POST /api/auth/admin-recovery — owner-only account recovery.
// Break-glass recovery when email is unavailable. Requires the server-only
// ADMIN_RECOVERY_TOKEN and an ADMIN_EMAILS-listed existing account. Does not
// grant or change roles; resets credentials and revokes prior access atomically.
export async function POST(req: Request) {
  const rl = rateLimit(`admin-recovery:${clientIp(req)}`, 5, 15 * 60 * 1000);
  if (!rl.ok)
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  try {
    const { token, email, newPassword } = (await req.json()) || {};
    const expected = process.env.ADMIN_RECOVERY_TOKEN;
    if (!expected)
      return NextResponse.json(
        { error: "Recovery is not configured." },
        { status: 503 },
      );
    if (typeof token !== "string" || Buffer.byteLength(token) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(token), Buffer.from(expected)))
      return NextResponse.json({ error: "Invalid recovery token." }, { status: 401 });
    const normalized = String(email || "").toLowerCase().trim();
    if (!isAdminEmail(normalized))
      return NextResponse.json(
        { error: "This email is not on the admin allowlist." },
        { status: 403 },
      );
    const policyError = passwordResetError(newPassword);
    if (policyError)
      return NextResponse.json(
        { error: policyError },
        { status: 400 },
      );
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user)
      return NextResponse.json(
        { error: "No account with this email — sign up first, then recover." },
        { status: 404 },
      );
    const passwordHash = hashPassword(newPassword);
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
      await tx.authSession.deleteMany({ where: { userId: user.id } });
      await tx.passwordReset.deleteMany({ where: { userId: user.id } });
      await tx.signInTransaction.deleteMany({ where: { linkUserId: user.id } });
      await tx.auditLog.create({ data: { actorId: user.id, subjectId: user.id, action: "owner_password_recovery", note: "Secret-gated owner recovery; role unchanged and sessions revoked." } });
    });
    return NextResponse.json({ ok: true });
  } catch {
    console.error("[ADMIN_RECOVERY] Recovery failed.");
    return NextResponse.json({ error: "Recovery failed." }, { status: 500 });
  }
}
