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
// GET  /api/workout/approve?sessionId=<id> — the same .FIT WITHOUT marking
// the session approved: a plain download so any athlete can take the
// structured session + alerts to their watch at any time.
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

  const safeNameFit =
    workout.title
      .replace(/[^a-z0-9]+/gi, "-")
      .toLowerCase()
      .slice(0, 40) || "workout";

  // DELIVER: push the approved workout to the athlete's inbox with the .FIT
  // attached (steps + HR/power alerts inside) and 3-step import instructions.
  // True watch-push requires Garmin's partner-approved delivery API; until
  // that entitlement exists this is the fastest reliable path to the watch:
  // import once, then Garmin syncs it to the device automatically.
  let emailed = false;
  try {
    const prefs = await prisma.reminderPref.findUnique({
      where: { userId: user.id },
    });
    if (prefs?.emailEnabled) {
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
      await sendEmail({
        to: user.email,
        subject: `📲 ${es ? "Entreno para Garmin" : "Garmin workout ready"}: ${workout.title}`,
        text: es
          ? `Tu entrenamiento aprobado está adjunto (${safeNameFit}.fit).\n\n${steps}\n\nPara llevarlo al reloj: 1) Garmin Connect web → Entrenamiento → Workouts → Importar (arrastra el archivo). 2) Envíalo a tu reloj. 3) Los avisos de zona/FC sonarán en cada paso.`
          : `Your approved workout is attached (${safeNameFit}.fit).\n\n${steps}\n\nTo get it on your watch: 1) Garmin Connect web → Training → Workouts → Import (drag the file). 2) Send it to your device. 3) The zone/HR alerts beep at every step.`,
        html: `<div style="font-family:system-ui;max-width:600px;margin:auto">
  <h2 style="color:#0c4a6e">📲 ${workout.title} — ${workout.durationMin} min</h2>
  <p style="color:#334155">Your approved workout is attached as <strong>${safeNameFit}.fit</strong> — the structured steps with zone/HR/power alerts are inside.</p>
  <div style="background:#f0f9ff;border-radius:12px;padding:14px;color:#175793">
    <strong>${es ? "Al reloj en 3 pasos" : "To your watch in 3 steps"}</strong>
    <ol style="margin:8px 0 0;padding-left:18px">
      <li>${es ? "Abre Garmin Connect en la web → Entrenamiento → Workouts → <strong>Importar</strong> y arrastra el archivo." : "Open Garmin Connect on the web → Training → Workouts → <strong>Import</strong> and drag the attached file."}</li>
      <li>${es ? "Envíalo a tu reloj (se sincroniza solo la próxima vez)." : "Send it to your device (it syncs on your watch's next sync)."}</li>
      <li>${es ? "Sigue los avisos: cada paso avisa de tu zona y FC objetivo." : "Follow the alerts: every step beeps with your target zone and HR."}</li>
    </ol>
  </div>
  <pre style="white-space:pre-wrap;font-size:12px;color:#334155;background:#f1f5f9;padding:12px;border-radius:8px">${steps.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>
</div>`,
        userId: user.id,
        attachments: [
          { filename: `${safeNameFit}.fit`, content: Buffer.from(fit) },
        ],
      });
      emailed = true;
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
