import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/races — list races
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const races = await prisma.race.findMany({ where: { userId: user.id }, orderBy: { date: "asc" } });
  return NextResponse.json({ races });
}

// POST /api/races — add a race (goal)
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await req.json();
    if (!b.name || !b.date) return NextResponse.json({ error: "name and date required" }, { status: 400 });
    const f = (v: unknown) => (v === undefined || v === null || v === "" ? null : parseFloat(String(v)));
    const race = await prisma.race.create({
      data: {
        userId: user.id,
        name: String(b.name),
        distance: String(b.distance || "olympic"),
        date: new Date(b.date),
        startTime: b.startTime || null,
        location: b.location || null,
        targetTempC: f(b.targetTempC),
        humidity: f(b.humidity),
        baseElevM: f(b.baseElevM),
        goalTimeMin: f(b.goalTimeMin),
        priority: b.priority !== undefined ? parseInt(b.priority, 10) : 1,
        bikeElevM: f(b.bikeElevM),
        bikeTerrain: b.bikeTerrain || null,
        runElevM: f(b.runElevM),
        runTerrain: b.runTerrain || null,
        swimVenue: b.swimVenue || null,
        waterTempC: f(b.waterTempC),
        swimCurrent: b.swimCurrent || null,
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
    const b = await req.json();
    if (!b.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const existing = await prisma.race.findFirst({ where: { id: b.id, userId: user.id } });
    if (!existing) return NextResponse.json({ error: "Race not found" }, { status: 404 });
    const data: Record<string, any> = {};
    const FLOAT_KEYS = ["targetTempC", "humidity", "baseElevM", "goalTimeMin", "bikeElevM", "runElevM", "waterTempC"];
    for (const [k, v] of Object.entries(b)) {
      if (k === "id" || v === undefined) continue;
      if (k === "date") data[k] = new Date(v as string);
      else if (FLOAT_KEYS.includes(k)) data[k] = v === null || v === "" ? null : parseFloat(v as string);
      else if (k === "priority") data[k] = parseInt(v as string, 10);
      else data[k] = v;
    }
    const race = await prisma.race.update({ where: { id: existing.id }, data });
    return NextResponse.json({ ok: true, race });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
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
