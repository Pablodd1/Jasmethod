import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requestPasswordReset, resetOriginAllowed } from "@/lib/password-reset";
import { rateLimit } from "@/lib/ratelimit";
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCurrentUser();
    if (!actor) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    if (actor.role !== "admin") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
    if (!resetOriginAllowed(req)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
    if (!rateLimit(`admin-password-reset:${actor.id}`, 20, 15 * 60_000).ok)
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    const { id } = await context.params;
    const user = await prisma.user.findUnique({ where: { id }, select: { email: true } });
    if (!user) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    const result = await requestPasswordReset(req, user.email, actor.id);
    if (result === "throttled") return NextResponse.json({ error: "A reset was requested recently. Wait one minute." }, { status: 429 });
    if (result !== "sent") return NextResponse.json({ error: "Reset email could not be sent. Check SMTP configuration." }, { status: 502 });
    return NextResponse.json({ ok: true, message: "Email accepted by the mail server. Ask the user to check their inbox and spam folder." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not request password reset." }, { status: 500 });
  }
}
