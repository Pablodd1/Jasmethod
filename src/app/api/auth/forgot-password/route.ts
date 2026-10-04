import { NextResponse } from "next/server";
import { requestPasswordReset, resetOriginAllowed, resetRequestMessage } from "@/lib/password-reset";
import { clientIp, rateLimit } from "@/lib/ratelimit";
export async function POST(req: Request) {
  const response = () => NextResponse.json({ ok: true, message: resetRequestMessage }, { headers: { "Cache-Control": "no-store" } });
  try {
    if (!resetOriginAllowed(req)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
    if (!rateLimit(`password-reset-request:${clientIp(req)}`, 5, 15 * 60_000).ok) return response();
    const raw = await req.text();
    if (raw.length > 4096) return response();
    const body = JSON.parse(raw);
    if (typeof body?.email !== "string") return response();
    const email = body.email.trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return response();
    const result = await requestPasswordReset(req, email);
    // Report operational failure without an address, token, or raw SMTP error.
    if (result === "delivery-failed") console.error("[PASSWORD_RESET] Email transport unavailable.");
    return response();
  } catch {
    console.error("[PASSWORD_RESET] Request could not be processed.");
    return response();
  }
}
