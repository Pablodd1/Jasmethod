import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import {
  athlinksConfigured,
  getAthleteResults,
  importAthlinksResults,
} from "@/lib/athlinks";

export const dynamic = "force-dynamic";

// GET /api/connectors/athlinks — link status + result count for this athlete
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const conn = await prisma.connector.findUnique({
    where: { userId_provider: { userId: user.id, provider: "athlinks" } },
  });
  const raceCount = conn?.externalRef
    ? await prisma.race.count({ where: { userId: user.id, source: "athlinks" } })
    : 0;
  return NextResponse.json({
    ok: true,
    configured: athlinksConfigured(),
    linked: !!conn?.externalRef,
    status: conn?.status ?? "disconnected",
    racerId: conn?.externalRef ?? null,
    lastSyncAt: conn?.lastSyncAt ?? null,
    lastError: conn?.lastError ?? null,
    raceCount,
  });
}

// DELETE /api/connectors/athlinks — unlink (races already imported stay)
export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.connector.deleteMany({
    where: { userId: user.id, provider: "athlinks" },
  });
  return NextResponse.json({ ok: true });
}

// POST /api/connectors/athlinks — confirm-and-link an Athlinks athlete, then
// import their race history immediately.
//   body: { racerId, name }  (name is the confirmed profile the athlete picked)
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`athlinks:${user.id}`, 5, 60000).ok)
    return NextResponse.json({ error: "Please wait a moment." }, { status: 429 });
  if (!athlinksConfigured())
    return NextResponse.json(
      { error: "Athlinks is not configured on the server (ATHLINKS_API_KEY)." },
      { status: 503 },
    );
  try {
    const { racerId, name } = (await req.json()) || {};
    if (!racerId)
      return NextResponse.json({ error: "racerId is required" }, { status: 400 });

    const results = await getAthleteResults(String(racerId));
    const { imported, merged } = await importAthlinksResults(user.id, results);
    await prisma.connector.upsert({
      where: { userId_provider: { userId: user.id, provider: "athlinks" } },
      create: {
        userId: user.id,
        provider: "athlinks",
        status: "connected",
        externalRef: String(racerId),
        lastSyncAt: new Date(),
        lastSyncCount: imported,
        lastError: null,
      },
      update: {
        status: "connected",
        externalRef: String(racerId),
        lastSyncAt: new Date(),
        lastSyncCount: imported,
        lastError: null,
      },
    });
    return NextResponse.json({
      ok: true,
      linked: String(racerId),
      confirmedName: name || null,
      racesImported: imported,
      racesMerged: merged,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || "Athlinks link failed").slice(0, 200) },
      { status: 500 },
    );
  }
}

// PATCH /api/connectors/athlinks — re-pull results for an already-linked athlete
export async function PATCH() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const conn = await prisma.connector.findUnique({
    where: { userId_provider: { userId: user.id, provider: "athlinks" } },
  });
  if (!conn?.externalRef)
    return NextResponse.json({ error: "Link an Athlinks profile first." }, { status: 400 });
  try {
    const results = await getAthleteResults(conn.externalRef);
    const { imported, merged } = await importAthlinksResults(user.id, results);
    await prisma.connector.update({
      where: { id: conn.id },
      data: { lastSyncAt: new Date(), lastSyncCount: imported, status: "connected", lastError: null },
    });
    return NextResponse.json({ ok: true, racesImported: imported, racesMerged: merged });
  } catch (e: any) {
    const error = String(e?.message || "Athlinks sync failed").slice(0, 250);
    await prisma.connector.update({
      where: { id: conn.id },
      data: { status: "error", lastError: error },
    });
    return NextResponse.json({ error }, { status: 500 });
  }
}
