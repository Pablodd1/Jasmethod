import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

// GET /api/calendar?month=YYYY-MM — calendar events + workouts for the month.
// month=auto spans the previous month, current month and next month so the
// week strip (prev weeks → next week) always has data without extra requests.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  let month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
  const parts = month.split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  let start = new Date(y, m - 1, 1);
  let end = new Date(y, m, 1);
  if (month === "auto") {
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  }

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
