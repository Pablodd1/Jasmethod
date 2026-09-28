import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

// POST /api/connectors/intervals/webhook — Intervals.icu app webhooks.
// Registered in the OAuth application form. Intervals signs nothing; the
// shared secret travels in the Authorization header (configured in the app
// form + INTERVALS_WEBHOOK_SECRET env). Events are persisted to WebhookEvent
// and reconciled by the worker/cron — the route itself only records, so
// retries are always safe.
export async function POST(req: Request) {
  const secret = process.env.INTERVALS_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const auth = req.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}` && auth !== secret)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const type = String(body?.type || "");
  const athleteId = String(body?.athlete_id || body?.athleteId || "");
  if (!type || !athleteId)
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });

  // Persist first, process async (same pattern as Strava/Whoop webhooks).
  await prisma.webhookEvent.create({
    data: {
      provider: "intervals",
      eventId: `${type}:${athleteId}:${body?.event_id || Date.now()}`,
      payload: JSON.stringify(body).slice(0, 8000),
    },
  }).catch(() => {});

  await logEvent({
    kind: "info",
    source: "sync",
    route: "/api/connectors/intervals/webhook",
    message: `type=${type} athlete=${athleteId}`,
  }).catch(() => {});

  // Intervals expects a fast 200; reconciliation happens in the queue.
  return NextResponse.json({ ok: true });
}
