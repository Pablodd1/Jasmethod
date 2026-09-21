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
  if (mode === "subscribe" && (!expected || token !== expected)) {
    return NextResponse.json(
      { error: "verify_token mismatch" },
      { status: 403 },
    );
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
    const secret = process.env.STRAVA_WEBHOOK_SECRET;
    if (!secret || new URL(req.url).searchParams.get("key") !== secret)
      return NextResponse.json(
        { error: "Invalid webhook key" },
        { status: 401 },
      );
    const body = await req.json();
    if (
      process.env.STRAVA_SUBSCRIPTION_ID &&
      String(body.subscription_id) !== process.env.STRAVA_SUBSCRIPTION_ID
    )
      return NextResponse.json(
        { error: "Wrong subscription" },
        { status: 403 },
      );
    if (
      body?.object_type === "athlete" &&
      body?.updates?.authorized === "false"
    ) {
      const stravaId = String(body.owner_id ?? "");
      await prisma.connector
        .updateMany({
          where: { provider: "strava", externalRef: stravaId },
          data: { status: "disconnected" },
        })
        .catch(() => {});
      return NextResponse.json({ ok: true });
    }
    if (
      body?.object_type === "activity" &&
      ["create", "update", "delete"].includes(body?.aspect_type)
    ) {
      // DEDUPE + RETRY contract: only a PROCESSED event short-circuits a
      // redelivery; a failed first attempt leaves processedAt null so Strava's
      // retry re-runs the sync.
      const eventId = String(body.event_id ?? "");
      let alreadyProcessed = false;
      if (eventId) {
        const claimed = await prisma.webhookEvent
          .createMany({
            data: [{
              provider: "strava",
              eventId,
              payload: JSON.stringify(body).slice(0, 8000),
            }],
            skipDuplicates: true,
          })
          .catch(() => ({ count: 1 }));
        if (!claimed.count) {
          const prior = await prisma.webhookEvent
            .findUnique({ where: { provider_eventId: { provider: "strava", eventId } } })
            .catch(() => null);
          alreadyProcessed = !!prior?.processedAt;
        }
      }
      if (alreadyProcessed)
        return NextResponse.json({ ok: true, deduplicated: true });
      if (body.aspect_type === "delete") {
        // DELETE: actually remove the local activity — re-pulling a window
        // never removes absent rows (review finding). Strava's object_id is
        // the externalId stored at import time.
        const ownerId = String(body.owner_id ?? "");
        const conn = await prisma.connector.findFirst({
          where: { provider: "strava", status: "connected", externalRef: ownerId },
        });
        if (conn) {
          const removed = await prisma.workout.deleteMany({
            where: {
              userId: conn.userId,
              source: "strava",
              externalId: String(body.object_id ?? ""),
            },
          });
          await prisma.auditLog.create({
            data: {
              actorId: conn.userId,
              subjectId: conn.userId,
              action: "sync.stravaDelete",
              entityId: String(body.object_id ?? ""),
              after: JSON.stringify({ removed: removed.count }),
            },
          }).catch(() => {});
          if (eventId)
            await prisma.webhookEvent.updateMany({
              where: { provider: "strava", eventId },
              data: { processedAt: new Date() },
            }).catch(() => {});
        }
        return NextResponse.json({ ok: true, aspect: "delete", removed: true });
      }
      const ownerId = String(body.owner_id ?? "");
      // Match the athlete by the strava athlete id saved at OAuth time.
      const conn = await prisma.connector.findFirst({
        where: {
          provider: "strava",
          status: "connected",
          externalRef: ownerId,
        },
      });
      if (conn) {
        const sync = await syncUserConnectors(conn.userId, "strava");
        if (sync.results.some((r) => !r.ok)) {
          // processedAt stays NULL — Strava's retry re-runs the sync.
          return NextResponse.json({ error: "Sync failed" }, { status: 503 });
        }
        if (eventId)
          await prisma.webhookEvent.updateMany({
            where: { provider: "strava", eventId, processedAt: null },
            data: { processedAt: new Date() },
          }).catch(() => {});
      }
    }
    // Strava only needs a 200 — respond fast, process again if retried.
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
