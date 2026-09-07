import { dayBounds } from "@/lib/dates";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildFitWorkout, workoutToFitSpec } from "@/lib/fit-export";

function dayStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// POST /api/workout/approve?sessionId=<id>  (or no body → today's session)
// Marks the workout approved and returns the structured-workout .FIT file
// for import into Garmin Connect / COROS Training Hub.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  const { start: today, end } = dayBounds(user.timezone);
  const workout = sessionId
    ? await prisma.workout.findFirst({
        where: { id: sessionId, userId: user.id },
      })
    : await prisma.workout.findFirst({
        where: {
          userId: user.id,
          date: { gte: today, lt: end },
          planned: true,
          completed: false,
        },
        orderBy: { date: "asc" },
      });
  if (!workout)
    return NextResponse.json(
      { error: "No workout to approve" },
      { status: 404 },
    );

  const day = workout.planDayId
    ? await prisma.planDay.findUnique({ where: { id: workout.planDayId } })
    : null;
  if (user.profile?.injured || day?.dayOff || workout.durationMin <= 0)
    return NextResponse.json(
      { error: "Rest day has no workout to export" },
      { status: 400 },
    );

  const profile = await prisma.athleteProfile.findUnique({
    where: { userId: user.id },
  });
  const fit = buildFitWorkout(
    workoutToFitSpec(
      {
        title: workout.title,
        sport: workout.sport,
        durationMin: workout.durationMin,
        type: workout.type,
        prescription: workout.prescription,
        originalPlan: workout.originalPlan,
        lthr: profile?.lthr,
        ftp: profile?.ftp,
      },
      { zone: workout.intensity },
    ),
  );

  await prisma.workout.update({
    where: { id: workout.id },
    data: { approved: true },
  });
  const safeName =
    workout.title
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase()
      .slice(0, 40) || "workout";
  return new NextResponse(Buffer.from(fit), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safeName}.fit"`,
    },
  });
}
