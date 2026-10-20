import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { effectivePrescription } from "@/lib/effective-prescription";
import { prisma } from "@/lib/db";
import { approvalStatus, buildWorkoutHistory, canRestoreLatest } from "@/lib/workout-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only revision history of one workout, rebuilt from the AuditLog. Never returns raw audit JSON. */
export async function GET(req: Request) {
  try {
    const { athlete } = await trainingAccess(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id || id.length > 200) throw new ApiError("Select a workout.");
    const resolved = await effectivePrescription(athlete.id, id);
    if (!resolved) throw new ApiError("Workout not found", 404);
    const rows = await prisma.auditLog.findMany({ where: { subjectId: athlete.id, entityId: id, action: { startsWith: "workout." } }, orderBy: { createdAt: "desc" }, take: 200 });
    const lang = athlete.language === "es" ? "es" : "en";
    const history = buildWorkoutHistory(rows, { workoutId: id, athleteId: athlete.id }).map(({ summary, ...entry }) => ({ ...entry, summary: summary[lang] }));
    return Response.json({
      workoutId: id, revision: resolved.canonical.revision, history,
      approval: approvalStatus(rows, { workoutId: id, currentRevision: resolved.canonical.revision }),
      canRestoreLatestStepEdit: canRestoreLatest(rows, { workoutId: id, currentPrescription: resolved.workout.prescription ?? null }),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
