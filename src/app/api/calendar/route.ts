import { workoutRevision } from "@/lib/workout-update";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dayBounds, dateKey, localDate, parseDate } from "@/lib/dates";
import { errorResponse, ApiError } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";

// GET /api/calendar?month=YYYY-MM — calendar events + workouts for the month.
// month=auto spans the previous month, current month and next month so the
// week strip (prev weeks → next week) always has data without extra requests.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  let month =
    url.searchParams.get("month") ||
    dateKey(new Date(), user.timezone).slice(0, 7);
  if (month !== "auto" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  const parts = (
    month === "auto" ? dateKey(new Date(), user.timezone).slice(0, 7) : month
  ).split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  let start = new Date(y, m - 1, 1);
  let end = new Date(y, m, 1);
  if (month === "auto") {
    const now = new Date(y, m - 1, 15);
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  }

  start = localDate(
    `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`,
    user.timezone,
  );
  end = localDate(
    `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-01`,
    user.timezone,
  );
  const [events, workouts, plans, races] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { userId: user.id, date: { gte: start, lt: end } },
      orderBy: { date: "asc" },
    }),
    prisma.workout.findMany({
      where: { userId: user.id, date: { gte: start, lt: end } },
      orderBy: { date: "asc" },
    }),
    prisma.trainingPlan.findMany({
      where: { userId: user.id, status: "active" },
      include: {
        days: {
          where: { date: { gte: start, lt: end } },
          include: { sessions: true },
        },
      },
      orderBy: { startDate: "desc" },
      take: 1,
    }),
    // Races (A/B/C) belong on the training calendar — they drive taper,
    // testing and prediction. Priority: 1 = A, 2 = B, 3 = C.
    prisma.race.findMany({
      where: { userId: user.id, date: { gte: start, lt: end } },
      orderBy: [{ date: "asc" }],
      select: {
        id: true,
        name: true,
        date: true,
        startTime: true,
        priority: true,
        distance: true,
        location: true,
      },
    }),
  ]);
  return NextResponse.json({
    events,
    workouts: workouts.map(w => ({...w, revision: workoutRevision(w)})),
    races,
    plan: plans[0] ? {...plans[0], days: plans[0].days.map(day => ({...day, sessions: day.sessions.map(w => ({...w,revision:workoutRevision(w)}))}))} : null,
  });
}

// POST /api/calendar — add event
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const ev = await prisma.calendarEvent.create({
      data: {
        userId: user.id,
        title: body.title || "Event",
        date: body.date
          ? parseDate(body.date, user.timezone)
          : dayBounds(user.timezone).start,
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
