import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { logEvent } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

// POST /api/telemetry/error — client-side error intake (window.onerror,
// unhandledrejection, React boundaries). Anonymous-capable (route + message
// only); authenticated errors carry the user id. Hard rate limit per IP.
export async function POST(req: Request) {
  const rl = rateLimit(`telemetry:${req.headers.get("x-forwarded-for") || "ip"}`, 20, 60000);
  if (!rl.ok) return NextResponse.json({ ok: true, dropped: "rate" });
  try {
    const body = await req.json();
    const message = String(body?.message || "").slice(0, 400);
    if (!message) return NextResponse.json({ ok: true });
    const user = await getCurrentUser().catch(() => null);
    await logEvent({
      kind: "error",
      source: "client",
      route: String(body?.route || "").slice(0, 200) || undefined,
      userId: user?.id ?? null,
      message,
      meta: {
        stack: String(body?.stack || "").slice(0, 1200) || undefined,
        userAgent: req.headers.get("user-agent")?.slice(0, 200),
        appVersion: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
