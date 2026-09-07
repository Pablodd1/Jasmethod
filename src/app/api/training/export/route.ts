export const dynamic = "force-dynamic";
import { trainingAccess, errorResponse } from "@/lib/access";
import { prisma } from "@/lib/db";
import { buildTrainingBundle } from "@/lib/training-export";

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
    const zip = buildTrainingBundle({
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
