export const dynamic = "force-dynamic";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { prisma } from "@/lib/db";
import { buildTrainingBundle, buildTrainingCalendar, type TrainingExportData } from "@/lib/training-export";
import { effectivePrescription } from "@/lib/effective-prescription";
import { SessionResolutionError } from "@/lib/canonical-session";

export async function GET(req: Request) {
  try {
    const { athlete } = await trainingAccess(req);
    const format = new URL(req.url).searchParams.get("format") || "zip";
    if (format !== "zip" && format !== "ics") throw new ApiError("Choose zip or ics export format", 400);
    const calendarOnly = format === "ics";
    const [workouts, metrics, sleep, checkins, plan] = await Promise.all([
      calendarOnly ? Promise.resolve([]) : prisma.workout.findMany({
        where: { userId: athlete.id },
        orderBy: { date: "asc" },
      }),
      calendarOnly ? Promise.resolve([]) : prisma.dailyMetrics.findMany({
        where: { userId: athlete.id },
        orderBy: { date: "asc" },
      }),
      calendarOnly ? Promise.resolve([]) : prisma.sleepRecord.findMany({
        where: { userId: athlete.id },
        orderBy: { date: "asc" },
      }),
      calendarOnly ? Promise.resolve([]) : prisma.dailyCheckin.findMany({
        where: { userId: athlete.id },
        orderBy: { date: "asc" },
      }),
      prisma.trainingPlan.findFirst({
        where: { userId: athlete.id, status: "active" },
        include: {
          days: {
            include: { sessions: true },
            orderBy: { date: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const resolutionErrors: Record<string, string> = {};
    const resolved = await Promise.all((plan?.days || []).flatMap(day => day.sessions.map(async session => {
      try { return await effectivePrescription(athlete.id, session.id); }
      catch (error) {
        if (!(error instanceof SessionResolutionError)) throw error;
        resolutionErrors[session.id] = error.message;
        return null;
      }
    })));
    const resolvedSessions = Object.fromEntries(resolved.filter((r): r is NonNullable<typeof r> => r !== null).map(r => [r.workout.id, r.canonical]));
    const data: TrainingExportData = {
      resolvedSessions,
      resolvedNutrition: Object.fromEntries(resolved.filter((r): r is NonNullable<typeof r> => r !== null).map(r => [r.workout.id, r.nutrition])),
      resolutionErrors,
      athlete: {
        name: athlete.name,
        email: athlete.email,
        timezone: athlete.timezone,
        language: athlete.language,
      },
      profile: athlete.profile,
      workouts,
      metrics,
      sleep,
      checkins,
      plan,
    };
    const safeName =
      athlete.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() ||
      "athlete";
    if (calendarOnly) return new Response(buildTrainingCalendar(data), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}-training-calendar.ics"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
    return new Response(Buffer.from(buildTrainingBundle(data)), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}-training-export.zip"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
