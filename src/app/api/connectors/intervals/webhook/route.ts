import { intervalsConnectorEnabled, INTERVALS_DISABLED_MESSAGE } from "@/lib/capabilities";
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
  if (!intervalsConnectorEnabled()) return NextResponse.json({ error: INTERVALS_DISABLED_MESSAGE }, { status: 503 });
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

  // Persist first (Codex review P1-6): if we cannot record the event we must
  // NOT acknowledge it — Intervals will retry, which is the correct behavior.
  // Processing is the durable queue's job; this route only records.
  try {
    await prisma.webhookEvent.create({
      data: {
        provider: "intervals",
        eventId: `${type}:${athleteId}:${body?.event_id || Date.now()}`,
        payload: JSON.stringify(body).slice(0, 8000),
      },
    });
  } catch (e: any) {
    // Duplicate redelivery = already recorded = accept (Intervals must not
    // retry forever). ONLY a genuine storage outage returns 503.
    if (e?.code === "P2002")
      return NextResponse.json({ ok: true, duplicate: true });
    return NextResponse.json({ error: "Could not persist event" }, { status: 503 });
  }

  await logEvent({
    kind: "info",
    source: "sync",
    route: "/api/connectors/intervals/webhook",
    message: `type=${type} athlete=${athleteId}`,
  }).catch(() => {});

  // CONSUMER (Codex review #3 P1-3): route the event to the athlete via the
  // stored externalRef, then enqueue a DURABLE refresh of their connected
  // ingest providers. An Intervals "ACTIVITY_UPLOADED" bell almost always
  // means the athlete's watch also pushed to Strava/Garmin — the refresh is
  // what actually moves data into the athlete record and coaching pipeline.
  const connector = await prisma.connector
    .findFirst({
      where: { provider: "intervals", externalRef: athleteId, status: "connected" },
      select: { userId: true },
    })
    .catch(() => null);
  if (!connector)
    // Unknown athlete: recorded (above) but nothing to refresh — accepted so
    // Intervals stops retrying; the mapping is fixed at connect time.
    return NextResponse.json({ ok: true, routed: false });
  const { enqueueSyncJob } = await import("@/lib/background-jobs");
  const connected = await prisma.connector
    .findMany({
      where: { userId: connector.userId, status: "connected", provider: { in: ["strava", "whoop", "oura", "google_cal"] } },
      select: { provider: true },
    })
    .catch(() => []);
  for (const { provider } of connected)
    await enqueueSyncJob(
      connector.userId,
      "sync",
      `ivwh:${provider}:${connector.userId}:${body?.event_id || type}:${Date.now()}`,
      { provider },
    ).catch(() => {});
  return NextResponse.json({ ok: true, routed: true, providers: connected.length });
}
