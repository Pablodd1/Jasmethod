import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { logEvent, alertOwner } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

// POST /api/connectors/request — an athlete requests a connector that is not
// yet enabled server-side (Google Calendar, Oura, Athlinks...). One tap in
// the Connections page → persisted ledger event + Telegram ping to the
// owner's alert bot. Rate-limited per user; duplicate open requests for the
// same provider are deduped.
const KNOWN = new Set([
  "google_cal", "oura", "strava", "whoop", "garmin", "coros",
  "apple", "athlinks", "google_fit", "withings",
]);

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rl = rateLimit(`connector-request:${user.id}`, 3, 24 * 3600000); // max 3 requests/day
  if (!rl.ok)
    return NextResponse.json(
      { error: "Request already sent — the administrator has been notified." },
      { status: 429 },
    );
  try {
    const body = await req.json().catch(() => ({}));
    const provider = String(body?.provider || "").toLowerCase().trim();
    if (!KNOWN.has(provider))
      return NextResponse.json({ error: "Unknown provider" }, { status: 400 });

    await logEvent({
      kind: "info",
      source: "server",
      route: "/api/connectors/request",
      userId: user.id,
      message: `Connector request: ${provider} (requested by ${user.name})`,
      meta: { provider, athlete: user.name },
    });
    await alertOwner(
      `connector_request_${provider}`,
      `${user.name} requested the ${provider} connection — needs admin API keys to enable.`,
      { cooldownMin: 720 },
    );
    return NextResponse.json({ ok: true, provider });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
