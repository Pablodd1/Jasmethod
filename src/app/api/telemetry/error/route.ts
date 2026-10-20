import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { acceptedClientError, readTelemetryBody } from "@/lib/client-error-payload";
import { sanitizeBuildId } from "@/lib/client-error-diagnostics";
import { logEvent } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

// POST /api/telemetry/error — client-side error intake (window.onerror,
// unhandledrejection, React boundaries). Anonymous-capable (route + message
// only); authenticated errors carry the user id. Hard rate limit per IP.
export async function POST(req: Request) {
  const rl = rateLimit(`telemetry:${req.headers.get("x-forwarded-for") || "ip"}`, 20, 60000);
  if (!rl.ok) return NextResponse.json({ ok: true, dropped: "rate" });
  try {
    const { message, route } = acceptedClientError(await readTelemetryBody(req));
    const user = await getCurrentUser().catch(() => null);
    await logEvent({
      kind: "error",
      source: "client",
      route: route,
      userId: user?.id ?? null,
      message,
      meta: {
        appVersion: sanitizeBuildId(process.env.VERCEL_GIT_COMMIT_SHA),
      },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
