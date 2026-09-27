import { dayBounds } from "@/lib/dates";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildFitWorkout, workoutToFitSpec } from "@/lib/fit-export";
import { meterUsage } from "@/lib/telemetry";

function dayStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// POST /api/workout/approve?sessionId=<id>  (or no body → today's session)
// Marks the workout approved and returns the structured-workout .FIT file
// for export. Receiving-app compatibility is not guaranteed.
// GET  /api/workout/approve?sessionId=<id> — the same .FIT WITHOUT marking
// the session approved: a plain download so any athlete can take the
// structured session file without approval or email side effects.
export async function GET(req: Request) {
  return run(req, false);
}
export async function POST(req: Request) {
  return run(req, true);
}

async function run(req: Request, markApproved: boolean) {
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

  if (markApproved)
    await prisma.workout.update({
      where: { id: workout.id },
      data: { approved: true },
    });

  await meterUsage(user.id, "fit_exports", 1);

  const safeNameFit =
    workout.title
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase()
      .slice(0, 40) || "workout";

  // Optional approval email is file delivery, not device publishing.
  let emailed = false;
  try {
    const prefs = markApproved ? await prisma.reminderPref.findUnique({
      where: { userId: user.id },
    }) : null;
    if (markApproved && prefs?.emailEnabled) {
      const { sendEmail } = await import("@/lib/email");
      const es = user.language === "es";
      const steps = (() => {
        try {
          const p = workout.prescription ? JSON.parse(workout.prescription) : null;
          return Array.isArray(p?.steps)
            ? p.steps
                .map((s: any) =>
                  `${s.name} — ${s.reps ? `${s.reps} reps` : `${Math.round(s.seconds / 60)} min`} @ ${String(s.zone).toUpperCase()}`)
                .join("\n")
            : "See the app for the step list.";
        } catch {
          return "See the app for the step list.";
        }
      })();
      const delivery = await sendEmail({
        to: user.email,
        subject: `${es ? "Entrenamiento aprobado" : "Approved workout"}: ${workout.title}`,
        text: es
          ? `Tu entrenamiento aprobado está adjunto (${safeNameFit}.fit).\n\n${steps}\n\nEs un archivo de entrenamiento estructurado. JMM no ha enviado este entrenamiento a tu reloj. Confirma compatibilidad con la app y el dispositivo antes de importarlo.`
          : `Your approved workout is attached (${safeNameFit}.fit).\n\n${steps}\n\nThis is a structured workout file. JMM has not sent this workout to your watch. Confirm receiving-app and device compatibility before importing.`,
        html: `<p>${es ? "Tu entrenamiento aprobado está adjunto. JMM no ha enviado el entrenamiento al reloj; comprueba compatibilidad antes de importar." : "Your approved workout file is attached. JMM has not sent it to your watch; check compatibility before importing."}</p>`,
        userId: user.id,
        attachments: [
          { filename: `${safeNameFit}.fit`, content: Buffer.from(fit) },
        ],
      });
      emailed = delivery.ok;
    }
  } catch (e) {
    // Delivery failure must not block the approval/download.
    console.error("approve email delivery failed:", e);
  }
  return new NextResponse(Buffer.from(fit), {
    headers: {
      "Content-Type": "application/octet-stream",
      "X-Delivered-Email": emailed ? "1" : "0",
      "Content-Disposition": `attachment; filename="${safeNameFit}.fit"`,
    },
  });
}
