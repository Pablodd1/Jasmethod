import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canCoach, canAccessAthlete, ApiError, errorResponse } from "@/lib/access";
import { localDate, addDaysKey, dateKey } from "@/lib/dates";

export const dynamic = "force-dynamic";

// PATCH /api/admin/athletes/[id] — coach-grade mutations on an athlete's
// profile and plan. Every action writes an AuditLog row (actor=admin,
// subject=athlete, before/after) so changes live in the athlete's permanent
// record — visible on the athlete's admin page forever.
//
// Actions:
//   setProfile   { goal?, intensityPct?, weeklyHours?, experience? }
//   moveWorkout  { workoutId, date }        — drag a session to another day
//   editWorkout  { workoutId, ...fields }   — title/sport/type/intensity/duration/startTime/notes
//   deleteWorkout{ workoutId }              — erase (works on completed too; audited)
//   addWorkout   { date, title, sport, type, intensity, durationMin, startTime? }
//   setDayOff    { date, dayOff }           — pick/unpick a rest day
//   clearDay     { date }                   — remove all planned, uncompleted sessions that day
async function audit(
  actorId: string,
  subjectId: string,
  action: string,
  entityId: string | null,
  before: unknown,
  after: unknown,
  note?: string,
) {
  await prisma.auditLog.create({
    data: {
      actorId,
      subjectId,
      action,
      entityId,
      before: before == null ? null : JSON.stringify(before).slice(0, 2000),
      after: after == null ? null : JSON.stringify(after).slice(0, 2000),
      note: note ?? null,
    },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const actor = await getCurrentUser();
    if (!actor) throw new ApiError("Sign in", 401);
    if (!canCoach(actor))
      throw new ApiError("Administrator access required", 403);
    if (actor.role !== "admin" && !(await canAccessAthlete(actor, params.id)))
      throw new ApiError("This athlete is not assigned to you", 403);
    const athlete = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, timezone: true, profile: { select: { id: true } } },
    });
    if (!athlete) throw new ApiError("Athlete not found", 404);
    const tz = athlete.timezone;
    const body = await req.json();
    const action = String(body?.action || "");

    switch (action) {
      case "setProfile": {
        const before = await prisma.athleteProfile.findUnique({
          where: { userId: athlete.id },
        });
        const data: Record<string, unknown> = {};
        if (body.goal !== undefined) data.goal = body.goal || null;
        if (body.intensityPct !== undefined) {
          const pct = Number(body.intensityPct);
          if (!Number.isFinite(pct) || pct < 50 || pct > 130)
            throw new ApiError("intensityPct must be 50–130");
          data.intensityPct = pct === 100 ? null : pct;
        }
        if (body.weeklyHours !== undefined) {
          const h = Number(body.weeklyHours);
          if (!Number.isFinite(h) || h < 1 || h > 40)
            throw new ApiError("weeklyHours must be 1–40");
          data.weeklyHours = h;
        }
        if (body.experience !== undefined) data.experience = String(body.experience);
        if (!Object.keys(data).length) throw new ApiError("Nothing to update");
        const after = await prisma.athleteProfile.update({
          where: { userId: athlete.id },
          data,
        });
        await audit(actor.id, athlete.id, "admin.setProfile", after.id, {
          goal: before?.goal,
          intensityPct: before?.intensityPct,
          weeklyHours: before?.weeklyHours,
          experience: before?.experience,
        }, {
          goal: after.goal,
          intensityPct: after.intensityPct,
          weeklyHours: after.weeklyHours,
          experience: after.experience,
        });
        return Response.json({ ok: true, profile: after });
      }

      case "moveWorkout": {
        const w = await prisma.workout.findFirst({
          where: { id: String(body.workoutId), userId: athlete.id },
        });
        if (!w) throw new ApiError("Workout not found", 404);
        const key = String(body.date);
        const newDate = localDate(key, tz);
        // Attach to that day's PlanDay in the active plan when one exists.
        const plan = await prisma.trainingPlan.findFirst({
          where: { userId: athlete.id, status: "active" },
          orderBy: { createdAt: "desc" },
        });
        const planDay = plan
          ? await prisma.planDay.findFirst({
              where: { planId: plan.id, date: newDate },
            })
          : null;
        const after = await prisma.workout.update({
          where: { id: w.id },
          data: { date: newDate, ...(planDay ? { planDayId: planDay.id } : {}) },
        });
        await audit(actor.id, athlete.id, "admin.moveWorkout", w.id,
          { date: dateKey(w.date, tz), title: w.title },
          { date: key, title: w.title });
        return Response.json({ ok: true, workout: after });
      }

      case "editWorkout": {
        const w = await prisma.workout.findFirst({
          where: { id: String(body.workoutId), userId: athlete.id },
        });
        if (!w) throw new ApiError("Workout not found", 404);
        const data: Record<string, unknown> = {};
        for (const f of ["title", "sport", "type", "intensity", "startTime", "notes"] as const)
          if (body[f] !== undefined) data[f] = body[f] === null ? null : String(body[f]);
        if (body.durationMin !== undefined) {
          const d = Number(body.durationMin);
          if (!Number.isFinite(d) || d < 0 || d > 600)
            throw new ApiError("durationMin must be 0–600");
          data.durationMin = Math.round(d);
        }
        if (!Object.keys(data).length) throw new ApiError("Nothing to update");
        // Editing the plan clears the stale stored prescription so the next
        // today-view regenerates it from the new session shape.
        if (data.durationMin !== undefined || data.intensity !== undefined || data.type !== undefined)
          data.prescription = null;
        const after = await prisma.workout.update({ where: { id: w.id }, data });
        await audit(actor.id, athlete.id, "admin.editWorkout", w.id,
          { title: w.title, sport: w.sport, type: w.type, intensity: w.intensity, durationMin: w.durationMin, startTime: w.startTime },
          data);
        return Response.json({ ok: true, workout: after });
      }

      case "deleteWorkout": {
        const w = await prisma.workout.findFirst({
          where: { id: String(body.workoutId), userId: athlete.id },
        });
        if (!w) throw new ApiError("Workout not found", 404);
        await prisma.workout.delete({ where: { id: w.id } });
        await audit(actor.id, athlete.id, "admin.deleteWorkout", w.id,
          { title: w.title, date: dateKey(w.date, tz), completed: w.completed },
          null,
          w.completed ? "ERASED A COMPLETED SESSION — permanent record kept here" : undefined);
        return Response.json({ ok: true });
      }

      case "addWorkout": {
        const key = String(body.date);
        const d = Number(body.durationMin);
        if (!Number.isFinite(d) || d <= 0 || d > 600)
          throw new ApiError("durationMin must be 1–600");
        const newDate = localDate(key, tz);
        const plan = await prisma.trainingPlan.findFirst({
          where: { userId: athlete.id, status: "active" },
          orderBy: { createdAt: "desc" },
        });
        const planDay = plan
          ? await prisma.planDay.findFirst({ where: { planId: plan.id, date: newDate } })
          : null;
        const w = await prisma.workout.create({
          data: {
            userId: athlete.id,
            planDayId: planDay?.id ?? null,
            date: newDate,
            startTime: body.startTime ? String(body.startTime) : null,
            sport: String(body.sport || "run"),
            title: String(body.title || "Coach-added session"),
            type: String(body.type || "endurance"),
            durationMin: Math.round(d),
            intensity: body.intensity ? String(body.intensity) : null,
            planned: true,
            completed: false,
            source: "admin",
            notes: body.notes ? String(body.notes) : null,
          },
        });
        await audit(actor.id, athlete.id, "admin.addWorkout", w.id, null,
          { title: w.title, date: key, sport: w.sport, type: w.type, intensity: w.intensity, durationMin: w.durationMin });
        return Response.json({ ok: true, workout: w });
      }

      case "setDayOff": {
        const key = String(body.date);
        const dayOff = Boolean(body.dayOff);
        const d = localDate(key, tz);
        const plan = await prisma.trainingPlan.findFirst({
          where: { userId: athlete.id, status: "active" },
          orderBy: { createdAt: "desc" },
        });
        if (!plan) throw new ApiError("No active plan for this athlete", 404);
        const existing = await prisma.planDay.findFirst({
          where: { planId: plan.id, date: d },
        });
        const before = existing?.dayOff ?? false;
        const after = existing
          ? await prisma.planDay.update({ where: { id: existing.id }, data: { dayOff } })
          : await prisma.planDay.create({
              data: {
                planId: plan.id,
                date: d,
                week: Math.max(0, Math.floor(
                  (d.getTime() - plan.startDate.getTime()) / (7 * 86400000),
                )),
                dayOfWeek: ((d.getDay() + 6) % 7),
                focus: dayOff ? "rest" : null,
                dayOff,
              },
            });
        await audit(actor.id, athlete.id, "admin.setDayOff", after.id,
          { date: key, dayOff: before }, { date: key, dayOff });
        return Response.json({ ok: true, planDay: after });
      }

      case "clearDay": {
        const key = String(body.date);
        const d = localDate(key, tz);
        const next = localDate(addDaysKey(key, 1), tz);
        const removed = await prisma.workout.deleteMany({
          where: {
            userId: athlete.id,
            date: { gte: d, lt: next },
            planned: true,
            completed: false,
          },
        });
        await audit(actor.id, athlete.id, "admin.clearDay", null,
          { date: key, plannedUncompleted: removed.count }, null);
        return Response.json({ ok: true, removed: removed.count });
      }

      default:
        throw new ApiError(`Unknown action "${action}"`);
    }
  } catch (e) {
    return errorResponse(e);
  }
}
