import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, isRevokedDemoPassword, createSession, setSessionCookie } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/ratelimit";
import { syncAdminRole } from "@/lib/admin";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body || {};
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required." }, { status: 400 });
    }
    const normalized = String(email).toLowerCase().trim();
    // Brute-force guard: 10 attempts per email+IP per 15 minutes.
    const rl = rateLimit(`login:${normalized}:${clientIp(req)}`, 10, 15 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json({ error: `Too many attempts — try again in ${Math.ceil(rl.retryAfterSec / 60)} min.` }, { status: 429 });
    }
    if (isRevokedDemoPassword(String(password))) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user || !verifyPassword(String(password), user.passwordHash)) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    user.role = await syncAdminRole(user);
    const token = await createSession(user.id);
    await setSessionCookie(token, req);
    return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e: any) {
    console.error("login error:", e);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
