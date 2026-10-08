import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseRaceUpdate, RaceUpdateError } from "@/lib/race-update";

// Race listing is read-only and does not silently disclose venue details to a
// provider. The scenario workspace offers explicit licensed weather lookup.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const races = await prisma.race.findMany({ where: { userId: user.id }, orderBy: { date: "asc" } });
  return NextResponse.json({ races: races.map(r => ({...r, weather: null})) }, {headers:{"Cache-Control":"private, no-store"}});
}

// POST /api/races — add a race (goal)
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await req.json();
    if (["boxing", "lifting"].includes(String(b?.distance || "").toLowerCase())) return NextResponse.json({ error: "Choose swimming, cycling, running, HYROX or triathlon." }, { status: 400 });
    if (!b.name || !b.date) return NextResponse.json({ error: "name and date required" }, { status: 400 });
    const f = (v: unknown) => (v === undefined || v === null || v === "" ? null : parseFloat(String(v)));
    // Never infer a race start location from an ambiguous place-name match.
    // Coordinates and provider lookups are explicit in the scenario workspace.
    const lat: number | null = null, lng: number | null = null;
    const race = await prisma.race.create({
      data: {
        userId: user.id,
        name: String(b.name),
        distance: String(b.distance || "olympic"),
        date: new Date(b.date),
        startTime: b.startTime || null,
        location: b.location || null,
        lat,
        lng,
        targetTempC: f(b.targetTempC),
        humidity: f(b.humidity),
        baseElevM: f(b.baseElevM),
        goalTimeMin: f(b.goalTimeMin),
        resultMin: f(b.resultMin),
        priority: b.priority !== undefined ? parseInt(b.priority, 10) : 1,
        bikeElevM: f(b.bikeElevM),
        bikeTerrain: b.bikeTerrain || null,
        runElevM: f(b.runElevM),
        runTerrain: b.runTerrain || null,
        swimVenue: b.swimVenue || null,
        waterTempC: f(b.waterTempC),
        swimCurrent: b.swimCurrent || null,
        federation: b.federation || null,
        category: b.category || null,
        notes: b.notes || null,
      },
    });
    return NextResponse.json({ ok: true, race });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}

// PUT /api/races — update a race
export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    let body: unknown;
    try { body = await req.json(); } catch { throw new RaceUpdateError("Invalid JSON body"); }
    const { id, data } = parseRaceUpdate(body);
    const existing = await prisma.race.findFirst({ where: { id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Race not found" }, { status: 404 });
    const race = await prisma.race.update({ where: { id: existing.id, userId: user.id }, data });
    return NextResponse.json({ ok: true, race });
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof RaceUpdateError ? e.message : "Race update failed" }, { status: e instanceof RaceUpdateError ? 400 : 500 });
  }
}

// DELETE /api/races?id=... — remove a race
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const existing = await prisma.race.findFirst({ where: { id, userId: user.id } });
  if (!existing) return NextResponse.json({ error: "Race not found" }, { status: 404 });
  await prisma.race.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
