export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canCoach, canAccessAthlete, ApiError, errorResponse } from "@/lib/access";
import { coachingSummary } from "@/lib/coaching";
import { dayBounds } from "@/lib/dates";

export async function GET(
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
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        timezone: true,
        language: true,
        avatar: true,
        createdAt: true,
        profile: true,
      },
    });
    if (!athlete) throw new ApiError("Athlete not found", 404);
    const days = Math.max(
      7,
      Math.min(180, Number(new URL(req.url).searchParams.get("days")) || 30),
    );
    const since = new Date(Date.now() - days * 86400000),
      until = new Date(Date.now() + 28 * 86400000);
    const [
      workouts,
      metrics,
      checkins,
      races,
      benchmarks,
      blood,
      nutrition,
      sleep,
      connectors,
      audit,
      plan,
    ] = await Promise.all([
      prisma.workout.findMany({
        where: { userId: athlete.id, date: { gte: since, lte: until } },
        orderBy: { date: "asc" },
        include: { planDay: { select: { dayOff: true } } },
      }),
      prisma.dailyMetrics.findMany({
        where: { userId: athlete.id, date: { gte: since } },
        orderBy: { date: "asc" },
      }),
      prisma.dailyCheckin.findMany({
        where: { userId: athlete.id, date: { gte: since } },
        orderBy: { date: "desc" },
        take: 30,
      }),
      prisma.race.findMany({
        where: { userId: athlete.id },
        orderBy: { date: "desc" },
        take: 20,
      }),
      prisma.benchmarkTest.findMany({
        where: { userId: athlete.id },
        orderBy: { date: "desc" },
        take: 30,
      }),
      prisma.bloodPanel.findMany({
        where: { userId: athlete.id },
        include: { results: true },
        orderBy: { date: "desc" },
        take: 3,
      }),
      prisma.nutritionLog.findMany({
        where: { userId: athlete.id, date: { gte: since } },
        orderBy: { date: "desc" },
        take: 60,
      }),
      prisma.sleepRecord.findMany({
        where: { userId: athlete.id, date: { gte: since } },
        orderBy: { date: "desc" },
      }),
      prisma.connector.findMany({
        where: { userId: athlete.id },
        select: {
          provider: true,
          status: true,
          lastSyncAt: true,
          lastSyncCount: true,
          lastError: true,
        },
      }),
      prisma.auditLog.findMany({
        where: { subjectId: athlete.id },
        include: { actor: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.trainingPlan.findFirst({
        where: { userId: athlete.id, status: "active" },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return Response.json({
      athlete,
      workouts,
      metrics,
      checkins,
      races,
      benchmarks,
      blood,
      nutrition,
      sleep,
      connectors,
      audit,
      plan,
      days,
      today: dayBounds(athlete.timezone).key,
      analysis: coachingSummary(
        workouts,
        metrics,
        athlete.profile,
        athlete.timezone,
      ),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
