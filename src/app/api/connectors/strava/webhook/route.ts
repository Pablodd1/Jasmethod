import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncUserConnectors } from "@/lib/sync";

// Never prerender — webhook.
export const dynamic = "force-dynamic";

// Strava webhook subscription (real-time device sync, the best automatic
// path available without Garmin's paused partner program):
//   Athlete's watch -> Garmin/COROS app -> Strava -> THIS webhook -> app.
// One-time setup (server env + Strava API settings):
//   STRAVA_VERIFY_TOKEN   any string you also enter in the Strava webhook form
//   STRAVA_CLIENT_ID/SECRET already required for OAuth
//   Subscribe: POST https://www.strava.com/api/v3/push_subscriptions
//     client_id, client_secret, callback_url=https://<domain>/api/connectors/strava/webhook,
//     verify_token=$STRAVA_VERIFY_TOKEN
//
// GET — Strava verification handshake (echo hub.challenge).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.STRAVA_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token !== expected) {
    return NextResponse.json({ error: "verify_token mismatch" }, { status: 403 });
  }
  if (mode === "subscribe" && challenge) {
    return NextResponse.json({ "hub.challenge": challenge });
  }
  return NextResponse.json({ ok: true, endpoint: "strava-webhook" });
}

// POST — activity/deauthentication events. Find the athlete by the Strava
// athlete id stored on their connector (externalId prefix trick is not needed:
// we match the callback-saved strava athlete id if present, else sync every
// connected strava user for that owner id) and sync immediately.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body?.object_type === "athlete" && body?.aspect_type === "deauthorize") {
      const stravaId = String(body.athlete_id ?? "");
      await prisma.connector.updateMany({ where: { provider: "strava", externalRef: stravaId }, data: { status: "disconnected" } }).catch(() => {});
      return NextResponse.json({ ok: true });
    }
    if (body?.object_type === "activity" && body?.aspect_type === "create") {
      const ownerId = String(body.owner_id ?? "");
      // Match the athlete by the strava athlete id saved at OAuth time.
      const conn = await prisma.connector.findFirst({ where: { provider: "strava", status: "connected", externalRef: ownerId } });
      if (conn) await syncUserConnectors(conn.userId, "strava").catch(() => {});
    }
    // Strava only needs a 200 — respond fast, process again if retried.
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
