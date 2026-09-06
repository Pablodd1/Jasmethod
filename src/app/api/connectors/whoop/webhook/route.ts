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
export async function POST(req: Request) {
  try {
    const body = await req.json();
    // Whoop webhook payload: { id, workout_id?, user_id, event_type, created_at }
    const whoopUserId = String(body?.user_id ?? "");
    const eventType = String(body?.event_type ?? "");
    if (whoopUserId) {
      const conn = await prisma.connector.findFirst({
        where: { provider: "whoop", status: "connected", externalRef: whoopUserId },
      });
      if (conn) {
        await syncUserConnectors(conn.userId, "whoop").catch(() => {});
      }
    }
    // Always 200 — Whoop retries on non-2xx and we'd rather stay quiet.
    return NextResponse.json({ ok: true, received: eventType || "unknown" });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
