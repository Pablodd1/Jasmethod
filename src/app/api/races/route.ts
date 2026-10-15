import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { parseRaceCreate, parseRaceUpdate, RaceUpdateError } from "@/lib/race-update";

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
    let body: unknown;
    try { body = await req.json(); } catch { throw new RaceUpdateError("Invalid JSON body"); }
    const data = parseRaceCreate(body);
    // Never infer a race start location from an ambiguous place-name match.
    // Coordinates and provider lookups are explicit in the scenario workspace.
    const race = await prisma.race.create({
      data: { ...data, userId: user.id, lat: null, lng: null },
    });
    return NextResponse.json({ ok: true, race });
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof RaceUpdateError ? e.message : "Race creation failed" }, { status: e instanceof RaceUpdateError ? 400 : 500 });
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
