import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/workouts?days=14 — user workouts (planned + completed)
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const days = Math.min(90, parseInt(url.searchParams.get("days") || "14", 10));
  const since = new Date(Date.now() - days * 86400000);
  const workouts = await prisma.workout.findMany({
    where: { userId: user.id, date: { gte: since } },
    orderBy: { date: "asc" },
  });
  return NextResponse.json({ workouts });
}

// POST /api/workouts — log a completed workout (manual)
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const workout = await prisma.workout.create({
      data: {
        userId: user.id,
        date: new Date(body.date || new Date()),
        sport: body.sport || "run",
        title: body.title || "Manual workout",
        type: body.type || "endurance",
        durationMin: parseInt(body.durationMin || "30", 10),
        distanceKm: body.distanceKm !== undefined ? parseFloat(body.distanceKm) : undefined,
        intensity: body.intensity,
        rpe: body.rpe !== undefined ? parseInt(body.rpe, 10) : undefined,
        avgHr: body.avgHr !== undefined ? parseInt(body.avgHr, 10) : undefined,
        maxHr: body.maxHr !== undefined ? parseInt(body.maxHr, 10) : undefined,
        avgPower: body.avgPower !== undefined ? parseFloat(body.avgPower) : undefined,
        calories: body.calories !== undefined ? parseInt(body.calories, 10) : undefined,
        notes: body.notes,
        planned: false,
        completed: true,
        source: "manual",
      },
    });
    return NextResponse.json({ ok: true, workout });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
