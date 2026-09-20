import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";

// POST /api/auth/admin-recovery — owner-only account recovery.
// The account exists in production with a password that was forgotten, SMTP
// (email reset) is broken, and Google Sign-In isn't configured yet — so this
// endpoint lets the OWNER set a new password directly, gated by a secret
// recovery token (ADMIN_RECOVERY_TOKEN env) AND the ADMIN_EMAILS allowlist.
// Two independent server-side secrets must both match; nobody who merely
// knows the admin email can use it.
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
    if (typeof token !== "string" || token !== expected)
      return NextResponse.json({ error: "Invalid recovery token." }, { status: 401 });
    const normalized = String(email || "").toLowerCase().trim();
    if (!isAdminEmail(normalized))
      return NextResponse.json(
        { error: "This email is not on the admin allowlist." },
        { status: 403 },
      );
    if (typeof newPassword !== "string" || newPassword.length < 8)
      return NextResponse.json(
        { error: "New password must be at least 8 characters." },
        { status: 400 },
      );
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user)
      return NextResponse.json(
        { error: "No account with this email — sign up first, then recover." },
        { status: 404 },
      );
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(newPassword), role: "admin" },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("admin-recovery error:", e);
    return NextResponse.json({ error: "Recovery failed." }, { status: 500 });
  }
}
