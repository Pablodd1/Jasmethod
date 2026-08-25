import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/calendar?month=YYYY-MM — calendar events + workouts for the month
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);

  const [events, workouts, plans] = await Promise.all([
    prisma.calendarEvent.findMany({ where: { userId: user.id, date: { gte: start, lt: end } }, orderBy: { date: "asc" } }),
    prisma.workout.findMany({ where: { userId: user.id, date: { gte: start, lt: end } }, orderBy: { date: "asc" } }),
    prisma.trainingPlan.findMany({
      where: { userId: user.id, status: "active" },
      include: { days: { include: { sessions: true } } },
      orderBy: { startDate: "desc" },
      take: 1,
    }),
  ]);
  return NextResponse.json({ events, workouts, plan: plans[0] || null });
}

// POST /api/calendar — add event
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const ev = await prisma.calendarEvent.create({
      data: {
        userId: user.id,
        title: body.title || "Event",
        date: new Date(body.date || new Date()),
        startTime: body.startTime,
        endTime: body.endTime,
        type: body.type || "note",
        notes: body.notes,
      },
    });
    return NextResponse.json({ ok: true, event: ev });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
