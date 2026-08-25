import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession, setSessionCookie } from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password } = body || {};
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required." }, { status: 400 });
    }
    const normalized = String(email).toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalized } });
    if (!user || !verifyPassword(String(password), user.passwordHash)) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    const token = await createSession(user.id);
    await setSessionCookie(token, req);
    return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e: any) {
    console.error("login error:", e);
    return NextResponse.json({ error: "Login failed." }, { status: 500 });
  }
}
