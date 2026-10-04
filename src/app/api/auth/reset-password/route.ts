import { NextResponse } from "next/server";
import { passwordResetError, resetPassword, resetOriginAllowed } from "@/lib/password-reset";
import { clearSessionCookie } from "@/lib/auth";
import { clientIp, rateLimit } from "@/lib/ratelimit";
export async function POST(req: Request) {
  try {
    if (!resetOriginAllowed(req)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
    if (!rateLimit(`password-reset-consume:${clientIp(req)}`, 10, 15 * 60_000).ok)
      return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    const raw = await req.text();
    if (raw.length > 4096) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    const body = JSON.parse(raw);
    const error = passwordResetError(body?.password);
    if (error) return NextResponse.json({ error }, { status: 400 });
    if (!await resetPassword(body?.token, body.password))
      return NextResponse.json({ error: "This reset link is invalid or expired. Request a new link." }, { status: 400 });
    await clearSessionCookie();
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not reset your password. Please try again." }, { status: 400 });
  }
}
