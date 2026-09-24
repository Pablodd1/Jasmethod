import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { syncUserConnectors } from "@/lib/sync";
import { decryptSecret } from "@/lib/crypto";
import { storeActivity } from "@/lib/activity-store";
import * as api from "@/lib/importers";

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
    // Two accepted auth paths: the ?key= secret (legacy registration) OR the
    // pinned subscription id on every event body (the live registration —
    // Strava rejects callback URLs with query strings, so the key param
    // cannot ride on the registered URL).
    const body = await req.json();
    const key = new URL(req.url).searchParams.get("key");
    const keyOk =
      process.env.STRAVA_WEBHOOK_SECRET && key === process.env.STRAVA_WEBHOOK_SECRET;
    const subOk =
      process.env.STRAVA_SUBSCRIPTION_ID &&
      String(body?.subscription_id) === process.env.STRAVA_SUBSCRIPTION_ID;
    if (!keyOk && !subOk)
      return NextResponse.json(
        { error: "Invalid webhook credentials" },
        { status: 401 },
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
      // Strava webhook payloads carry NO event_id — derive a stable key from
      // the delivery identity: owner + object + aspect + event_time.
      const eventId = String(
        body.event_id ??
        (body.object_id && body.aspect_type && body.event_time
          ? `${body.owner_id}:${body.object_id}:${body.aspect_type}:${body.event_time}`
          : ""),
      );
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
        // never removes absent rows (review finding). Activities are stored
        // with PREFIXED externalId `strava:${id}` (importers.ts) — match both
        // prefixed and legacy unprefixed forms.
        const ownerId = String(body.owner_id ?? "");
        const conn = await prisma.connector.findFirst({
          where: { provider: "strava", externalRef: ownerId },
        });
        if (conn) {
          const objectId = String(body.object_id ?? "");
          const removed = await prisma.workout.deleteMany({
            where: {
              userId: conn.userId,
              source: "strava",
              OR: [
                { externalId: `strava:${objectId}` },
                { externalId: objectId },
              ],
            },
          });
          await prisma.auditLog.create({
            data: {
              actorId: conn.userId,
              subjectId: conn.userId,
              action: "sync.stravaDelete",
              entityId: objectId,
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
      // Match the athlete whether the connector is healthy OR in error state —
      // a transient failure must not make later webhook events invisible.
      const ownerId = String(body.owner_id ?? "");
      const conn = await prisma.connector.findFirst({
        where: {
          provider: "strava",
          externalRef: ownerId,
          status: { in: ["connected", "error"] },
        },
      });
      if (conn) {
        // Targeted processing: fetch just the changed activity by ID so
        // updates to older activities (outside the sync window) survive.
        const athlete = await prisma.user.findUnique({
          where: { id: conn.userId },
          select: { timezone: true },
        });
        const tz = athlete?.timezone || "America/New_York";
        const accessToken = conn.tokenEnc
          ? decryptSecret(conn.tokenEnc)
          : null;
        let stored = false;
        if (accessToken) {
          try {
            const activity = await api.stravaGetActivity(accessToken, String(body.object_id ?? ""));
            if (activity && !activity.deleted) {
              stored = await storeActivity(conn.userId, tz, {
                ...api.stravaActivityToWorkout(activity),
                source: "strava",
              });
            }
          } catch (fetchErr) {
            console.warn("[strava webhook] by-ID fetch failed, falling back to sync:", String(fetchErr).slice(0, 120));
          }
        }
        if (!stored) {
          // Fallback: bounded reconciliation (token refresh, windowed pull).
          const sync = await syncUserConnectors(conn.userId, "strava");
          if (sync.results.some((r) => !r.ok)) {
            // processedAt stays NULL — Strava's retry re-runs the sync.
            return NextResponse.json({ error: "Sync failed" }, { status: 503 });
          }
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
