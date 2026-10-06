import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { geocodeLocation, getRaceWeather } from "@/lib/weather";
import { parseRaceUpdate, RaceUpdateError } from "@/lib/race-update";

// GET /api/races — list races. Upcoming races with venue coordinates get
// live race-day weather (Open-Meteo hourly at the start hour, 30-min cache).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const races = await prisma.race.findMany({ where: { userId: user.id }, orderBy: { date: "asc" } });

  const withWeather = await Promise.all(races.map(async (r) => {
    const daysAway = (new Date(r.date).getTime() - Date.now()) / 86400000;
    if (r.lat == null || r.lng == null || daysAway < 0 || daysAway > 16) return { ...r, weather: null };
    const startHour = r.startTime ? Number(String(r.startTime).slice(0, 2)) : 7;
    const w = await getRaceWeather(r.lat, r.lng, new Date(r.date), isNaN(startHour) ? 7 : startHour);
    return { ...r, weather: w };
  }));

  return NextResponse.json({ races: withWeather });
}

// POST /api/races — add a race (goal)
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await req.json();
    if (!b.name || !b.date) return NextResponse.json({ error: "name and date required" }, { status: 400 });
    const f = (v: unknown) => (v === undefined || v === null || v === "" ? null : parseFloat(String(v)));
    // Auto-geocode the venue from the location text (Open-Meteo geocoding,
    // free) so race-day weather can be pulled automatically.
    let lat: number | null = null, lng: number | null = null;
    if (b.location) {
      try {
        const g = await geocodeLocation(String(b.location));
        if (g) { lat = g.lat; lng = g.lng; }
      } catch { /* geocoding is best-effort */ }
    }
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
