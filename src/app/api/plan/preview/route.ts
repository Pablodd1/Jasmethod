import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { prisma } from "@/lib/db";
import { evidencedTargetProfile } from "@/lib/anchor-evidence";
import { savedWorkoutPreview } from "@/lib/saved-workout-preview";
import { validSavedSessionId } from "@/lib/saved-workout-preview-contract";
import { unitsOf } from "@/lib/units";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

// One requested saved session, not a bulk cycle expansion or execution endpoint.
export async function GET(req: Request) {
  try {
    const { athlete } = await trainingAccess(req);
    const query = new URL(req.url).searchParams;
    const id = query.get("sessionId");
    if (query.getAll("sessionId").length !== 1 || !validSavedSessionId(id)) throw new ApiError("Invalid session ID");
    const [workout, applied, tests] = await Promise.all([
      prisma.workout.findFirst({ where: { id, userId: athlete.id, planned: true }, select: {
        id: true, userId: true, planned: true, date: true, sport: true, title: true, durationMin: true, prescription: true,
        planDay: { select: { dayOff: true } },
      } }),
      prisma.auditLog.findMany({ where: { subjectId: athlete.id, action: "baseline.fromTest" }, orderBy: { createdAt: "desc" }, take: 100, select: { entityId: true } }),
      prisma.benchmarkTest.findMany({ where: { userId: athlete.id, completed: true, skipped: false }, orderBy: { date: "desc" }, take: 100, select: {
        id: true, date: true, type: true, result: true, completed: true, skipped: true,
      } }),
    ]);
    if (!workout) throw new ApiError("Session not found", 404);
    const profile = evidencedTargetProfile(athlete.profile ? { ...athlete.profile, units: unitsOf(athlete.profile.units, athlete.language) } : null,
      tests, applied.flatMap(row => row.entityId ? [row.entityId] : []),new Date(Math.max(Date.now(), workout.date.getTime())),athlete.timezone);
    return Response.json(savedWorkoutPreview(workout, athlete.id, athlete.timezone, profile), { headers });
  } catch (error) {
    const response = errorResponse(error);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  }
}
