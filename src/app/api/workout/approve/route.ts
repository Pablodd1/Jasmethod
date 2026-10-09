import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { buildSessionDownload } from "@/lib/fit-export";
import { effectivePrescription } from "@/lib/effective-prescription";
import { requireSessionRevision, SessionResolutionError } from "@/lib/canonical-session";
import { meterUsage } from "@/lib/telemetry";
export const dynamic = "force-dynamic";

// GET downloads only. POST explicitly approves; a separate consent-verified worker handles email.
export async function GET(req: Request) { return run(req, false); }
export async function POST(req: Request) { return run(req, true); }
async function run(req: Request, markApproved: boolean) {
  try {
    const { athlete: user, actor } = await trainingAccess(req);
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) throw new ApiError("Select the session to download.");
    const resolved = await effectivePrescription(user.id, sessionId);
    if (!resolved) throw new ApiError("Session not found", 404);
    const { workout, canonical } = resolved;
    const expectedRevision = url.searchParams.get("expectedRevision");
    if (markApproved && !expectedRevision) throw new ApiError("Refresh and approve the current workout revision.", 409);
    requireSessionRevision(canonical, expectedRevision);
    const { bytes: fit, filename, contentType } = buildSessionDownload(canonical);
    if (markApproved) await prisma.$transaction(async db => {
      const changed = await db.workout.updateMany({ where: { id: workout.id, userId: user.id, approved: false, prescription: workout.prescription }, data: { approved: true } });
      if (!changed.count && !await db.workout.findFirst({ where: { id: workout.id, userId: user.id, approved: true, prescription: workout.prescription } })) throw new ApiError("The workout changed. Refresh before approving.", 409);
      await db.auditLog.create({ data: { actorId: actor.id, subjectId: user.id, action: "workout.approved", entityId: workout.id, after: JSON.stringify({ revision: canonical.revision }) } });
      return changed;
    });
    await meterUsage(user.id, "fit_exports", 1);
    // Manual email delivery is handled by the consent-verified durable worker.
    // Legacy reminderPref.emailEnabled is never sufficient authorization.
    return new NextResponse(Buffer.from(fit), { headers: {
      "Content-Type": contentType, "X-Delivered-Email": "0",
      "X-Workout-Revision": canonical.revision, "X-Workout-Compatibility": "device-unverified",
      "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    if (error instanceof SessionResolutionError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    return errorResponse(error);
  }
}
