import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, createSession, setSessionCookie } from "@/lib/auth";
import { sendEmail, welcomeEmail } from "@/lib/email";
import { youthPolicy } from "@/lib/cycle";
import { isAdminEmail } from "@/lib/admin";
import { rateLimit, clientIp } from "@/lib/ratelimit";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, password, name, birthYear } = body || {};
    if (!email || !password || !name) {
      return NextResponse.json({ error: "Email, password, and name are required." }, { status: 400 });
    }
    const normalized = String(email).toLowerCase().trim();
    const rl = rateLimit(`signup:${clientIp(req)}`, 5, 60 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many signups from this network — try again later." }, { status: 429 });
    }
    const existing = await prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists. Try logging in." }, { status: 409 });
    }
    if (String(password).length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }
    // Age gate: 13+ (platform policy; research: youth training ~7-8+ supervised, AOSSM)
    const by = birthYear ? parseInt(birthYear, 10) : null;
    const gate = youthPolicy(by);
    if (!gate.allowed) {
      return NextResponse.json({ error: gate.note }, { status: 403 });
    }
    const user = await prisma.user.create({
      data: {
        email: normalized,
        passwordHash: hashPassword(String(password)),
        name: String(name).trim(),
        role: isAdminEmail(normalized) ? "admin" : "athlete",
        profile: { create: by ? { birthYear: by } : {} },
        motivation: { create: {} },
      },
    });
    const token = await createSession(user.id);
    await setSessionCookie(token, req);

    // Fire-and-forget welcome email (never blocks signup)
    const { subject, html } = welcomeEmail(user.name);
    void sendEmail({ to: user.email, subject, html, userId: user.id });

    return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e: any) {
    console.error("signup error:", e);
    const code = e?.code as string | undefined;
    const raw = e?.message ? String(e.message) : "";
    let detail: string;
    switch (code) {
      case "P1001": detail = "Base de datos inalcanzable — revisa DATABASE_URL / DIRECT_URL y el acceso de red."; break;
      case "P1000": detail = "Autenticación de base de datos fallida — credenciales inválidas."; break;
      case "P1010": detail = "Acceso del usuario de base de datos rechazado."; break;
      case "P1013": detail = "Nombre de base de datos inválido."; break;
      case "P2021":
      case "P2022": detail = "El esquema de base de datos no existe. Aplícalo con `npx prisma db push` o `prisma migrate deploy`."; break;
      default: detail = raw.replace(/(postgres(ql)?:\/\/)([^@\s]+)@/gi, "$1***@").slice(0, 240); break;
    }
    if (!detail) detail = "Error desconocido.";
    return NextResponse.json({ error: "Signup failed. Please try again.", detail }, { status: 500 });
  }
}
