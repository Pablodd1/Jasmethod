import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { intervalsConnectorEnabled, INTERVALS_DISABLED_MESSAGE } from "@/lib/capabilities";
import { intervalsEventTypes, intervalsEventHash, intervalsSecretMatches } from "@/lib/intervals-ingest";
export const dynamic = "force-dynamic";
// Official app webhook contract: { secret, events: [...] }. Do not persist the secret.
// https://forum.intervals.icu/t/intervals-icu-api-integration-cookbook/80090
export async function POST(req: Request) {
  if (!intervalsConnectorEnabled()) return NextResponse.json({ error: INTERVALS_DISABLED_MESSAGE }, { status: 503 });
  const secret = process.env.INTERVALS_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  let body: any;
  try {
    if (Number(req.headers.get("content-length")) > 1048576) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    const text = await req.text();
    if (Buffer.byteLength(text) > 1048576) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
    body = JSON.parse(text);
  } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!intervalsSecretMatches(body?.secret, secret)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!Array.isArray(body.events) || body.events.length > 100 || body.events.some((e: any) => !e || typeof e.type !== "string" || typeof e.athlete_id !== "string" || !e.athlete_id || e.athlete_id.length > 128 || typeof e.timestamp !== "string" || !Number.isFinite(Date.parse(e.timestamp))))
    return NextResponse.json({ error: "Invalid events" }, { status: 400 });
  try {
    const result = await prisma.$transaction(async tx => {
      let queued = 0, ignored = 0;
      for (const event of body.events) {
        if (!intervalsEventTypes.has(event.type)) { ignored++; continue; }
        const connections = await tx.connector.findMany({ where: { provider: "intervals", externalRef: event.athlete_id, status: { in: ["connected", "error"] } }, select: { id: true, userId: true } });
        if (!connections.length) { ignored++; continue; }
        if (connections.length > 1) throw new Error("Ambiguous Intervals athlete mapping");
        const conn = connections[0];
        // Carry only routing metadata; the worker fetches the current, authorized record.
        const safeEvent = { athlete_id: event.athlete_id, type: event.type, timestamp: event.timestamp,
          ...(event.activity?.id != null ? { activity: { id: event.activity.id } } : {}) };
        const dedupeKey = `intervals:${conn.id}:${intervalsEventHash(event)}`;
        await tx.syncJob.upsert({ where: { dedupeKey }, update: {}, create: {
          userId: conn.userId, kind: "intervals", dedupeKey, payload: JSON.stringify({ connectorId: conn.id, event: safeEvent }),
        } });
        queued++;
      }
      return { queued, ignored };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch { return NextResponse.json({ error: "Could not queue events" }, { status: 503 }); }
}
