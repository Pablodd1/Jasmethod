import { verifyWhoopWebhook } from "@/lib/webhook-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncUserConnectors } from "@/lib/sync";

// Never prerender — webhook.
export const dynamic = "force-dynamic";

// WHOOP webhook — real-time recovery/sleep/workout updates. Whoop POSTs an
// event when member data changes; we match the Whoop user_id to the athlete's
// connector (externalRef, saved at OAuth time) and sync that athlete
// immediately. No verification handshake needed (unlike Strava) — Whoop just
// fires POSTs to the URL registered in the developer dashboard.
// Registered URL: https://<domain>/api/connectors/whoop/webhook (model V2).
//
// DEDUPE: every verified event is persisted in WebhookEvent keyed by the
// Whoop event id before processing — a redelivery is acknowledged (2xx) and
// skipped, never double-synced. Hourly reconciliation catches anything that
// fails after the ack.
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (
      !verifyWhoopWebhook(
        raw,
        req.headers.get("x-whoop-signature-timestamp"),
        req.headers.get("x-whoop-signature"),
        process.env.WHOOP_CLIENT_SECRET,
      )
    )
      return NextResponse.json(
        { error: "Invalid webhook signature" },
        { status: 401 },
      );
    const body = JSON.parse(raw);
    // Whoop webhook payload: { id, workout_id?, user_id, event_type, created_at }
    const whoopUserId = String(body?.user_id ?? "");
    const eventType = String(body?.type ?? "");
    const eventId = String(body?.id ?? body?.trace_id ?? "");
    if (eventId) {
      const claimed = await prisma.webhookEvent
        .createMany({
          data: [{ provider: "whoop", eventId, payload: raw.slice(0, 8000) }],
          skipDuplicates: true,
        })
        .catch(() => ({ count: 1 })); // ledger failure must never drop the event
      if (!claimed.count)
        return NextResponse.json({ ok: true, deduplicated: true });
    }
    if (whoopUserId) {
      const conn = await prisma.connector.findFirst({
        where: {
          provider: "whoop",
          status: "connected",
          externalRef: whoopUserId,
        },
      });
      if (conn) {
        const sync = await syncUserConnectors(conn.userId, "whoop");
        if (eventId)
          await prisma.webhookEvent
            .updateMany({
              where: { provider: "whoop", eventId, processedAt: null },
              data: { processedAt: new Date() },
            })
            .catch(() => {});
        if (sync.results.some((r) => !r.ok))
          return NextResponse.json(
            { error: "Sync failed; retry later" },
            { status: 503 },
          );
      }
    }
    // Always 200 — Whoop retries on non-2xx and we'd rather stay quiet.
    return NextResponse.json({ ok: true, received: eventType || "unknown" });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
