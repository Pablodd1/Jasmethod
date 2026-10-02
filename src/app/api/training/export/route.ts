export const dynamic = "force-dynamic";
import { trainingAccess, errorResponse } from "@/lib/access";
import { prisma } from "@/lib/db";
import { buildTrainingBundle } from "@/lib/training-export";
import { effectivePrescription } from "@/lib/effective-prescription";
import { SessionResolutionError } from "@/lib/canonical-session";

export async function GET(req: Request) {
  try {
    const { athlete } = await trainingAccess(req);
    const [workouts, metrics, sleep, checkins, plan] = await Promise.all([
      prisma.workout.findMany({
        where: { userId: athlete.id },
        orderBy: { date: "asc" },
      }),
      prisma.dailyMetrics.findMany({
        where: { userId: athlete.id },
        orderBy: { date: "asc" },
      }),
      prisma.sleepRecord.findMany({
        where: { userId: athlete.id },
        orderBy: { date: "asc" },
      }),
      prisma.dailyCheckin.findMany({
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
    const zip = buildTrainingBundle({
      resolvedSessions,
      resolutionErrors,
      athlete: {
        name: athlete.name,
        email: athlete.email,
        timezone: athlete.timezone,
      },
      profile: athlete.profile,
      workouts,
      metrics,
      sleep,
      checkins,
      plan,
    });
    const safeName =
      athlete.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() ||
      "athlete";
    return new Response(Buffer.from(zip), {
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
