import { workoutRevision } from "@/lib/workout-update";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dayBounds, dateKey, localDate } from "@/lib/dates";
import { errorResponse, ApiError } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import {calendarWorkoutView} from '@/lib/calendar-workouts';
import {readActivityDecisions} from '@/lib/activity-reconciliation';

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
  const [events, workouts, plans, races, decisions] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { userId: user.id, date: { gte: start, lt: end } },
      orderBy: { date: "asc" },
    }),
    prisma.workout.findMany({
      where: { userId: user.id, date: { gte: start, lt: end } },
      include: {planDay:{select:{plan:{select:{id:true,status:true,userId:true}}}}},
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
      orderBy: { createdAt: "desc" },
      take: 1,
    }),
    // Race rows store entered UTC calendar days; query by those day keys.
    // They inform reviewed preparation/recovery, never compulsory testing.
    prisma.race.findMany({
      where: { userId: user.id, date: { gte: new Date(`${dateKey(start,user.timezone)}T00:00:00Z`), lt: new Date(`${dateKey(end,user.timezone)}T00:00:00Z`) } },
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
    readActivityDecisions(user.id),
  ]);
  const view=calendarWorkoutView(workouts,user.id,plans[0]?.id??null,decisions);
  const visibleIds=new Set(view.workouts.map(w=>w.id));
  return NextResponse.json({
    events,
    workouts: view.workouts.map(w => ({...w, revision: workoutRevision(w)})),
    displayWorkouts:view.displayWorkouts,
    calendarReview:{hiddenUnperformed:view.hiddenUnperformed,possibleCopyGroups:view.possibleCopyGroups},
    // Calendar consumers group timestamps in the athlete timezone. Preserve
    // the entered day while adapting to that display contract (no DB write).
    races: races.map(race=>({...race,dateKey:race.date.toISOString().slice(0,10),date:localDate(race.date.toISOString().slice(0,10),user.timezone)})),
    plan: plans[0] ? {...plans[0], days: plans[0].days.map(day => ({...day, sessions: day.sessions.filter(w=>visibleIds.has(w.id)).map(w => ({...w,revision:workoutRevision(w)}))}))} : null,
  },{headers:{'Cache-Control':'private, no-store'}});
}

// POST /api/calendar — add event
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    let body: any;
    try { body = await req.json(); } catch { throw new ApiError("Invalid JSON body"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("Enter calendar event details");
    for (const [key, max] of [["title", 200], ["notes", 2000]] as const) {
      if (body[key] != null && (typeof body[key] !== "string" || body[key].length > max))
        throw new ApiError(`${key} must be text of at most ${max} characters`);
    }
    if (body.type !== undefined && !["workout", "race", "appointment", "note"].includes(body.type)) throw new ApiError("Choose a valid calendar event type");
    let date = dayBounds(user.timezone).start;
    if (body.date !== undefined) {
      if (typeof body.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) throw new ApiError("Enter a valid calendar date");
      try { date = localDate(body.date, user.timezone); } catch { throw new ApiError("Enter a valid calendar date"); }
    }
    for (const key of ["startTime", "endTime"] as const) {
      if (body[key] != null && (typeof body[key] !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body[key])))
        throw new ApiError(`${key} must use HH:MM`);
    }
    if (body.startTime && body.endTime && body.endTime <= body.startTime) throw new ApiError("End time must follow start time on the event date");
    const ev = await prisma.calendarEvent.create({
      data: {
        userId: user.id,
        title: body.title?.trim() || "Event",
        date,
        startTime: body.startTime,
        endTime: body.endTime,
        type: body.type || "note",
        notes: body.notes,
      },
    });
    return NextResponse.json({ ok: true, event: ev });
  } catch (e) { return errorResponse(e); }
}
