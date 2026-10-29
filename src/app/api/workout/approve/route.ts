import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { buildSessionDownload } from "@/lib/fit-export";
import { effectivePrescription } from "@/lib/effective-prescription";
import { requireSessionRevision, SessionResolutionError } from "@/lib/canonical-session";
import { meterUsage } from "@/lib/telemetry";
import type { Prisma } from "@prisma/client";
export const dynamic = "force-dynamic";

// GET downloads only. POST explicitly approves; a separate consent-verified worker handles email.
export async function GET(req: Request) { return run(req, false); }
export async function POST(req: Request) { return run(req, true); }
async function run(req: Request, markApproved: boolean) {
  let currentRevision:string|null=null;
  try {
    const { athlete: user, actor } = await trainingAccess(req);
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) throw new ApiError("Select the session to download.");
    const resolved = await effectivePrescription(user.id, sessionId);
    if (!resolved) throw new ApiError("Session not found", 404);
    const { workout, canonical } = resolved;
    currentRevision=canonical.revision;
    const expectedRevision = url.searchParams.get("expectedRevision");
    if (markApproved && !expectedRevision) throw new ApiError("Refresh and approve the current workout revision.", 409);
    requireSessionRevision(canonical, expectedRevision);
    const { bytes: fit, filename, contentType } = buildSessionDownload(canonical);
    if(!fit.length)throw new SessionResolutionError("The workout file was empty. No export was completed.",500);
    if (markApproved) await prisma.$transaction(async db => {
      const current = await effectivePrescription(user.id, sessionId, db);
      if (!current) throw new ApiError("The workout was replaced or removed. Refresh before approving.", 409);
      requireSessionRevision(current.canonical, expectedRevision);
      // The resolution above verifies current plan/safety in this transaction.
      // Compare the complete saved execution payload at the conditional write:
      // retirement, feedback or a concurrent edit must also defeat an already
      // approved retry, even when the prescription JSON stayed unchanged.
      const w = current.workout;
      const unchanged: Prisma.WorkoutWhereInput = {
        id: workout.id, userId: user.id, planned: true, completed: false,
        source: w.source ?? null, planDayId: w.planDayId ?? null,
        ...(w.planDay ? { planDay: { plan: { id: w.planDay.plan.id, userId: user.id, status: "active" } } } : { planDay: null }),
      };
      for (const field of ["date", "title", "sport", "type", "durationMin", "intensity", "startTime", "notes", "indoor", "prescription", "originalPlan", "feedbackStatus", "feedbackAt", "feedbackNote", "actualDurationMin", "actualSport", "actualDetails", "rpe", "avgHr", "maxHr", "avgPower", "np", "distanceKm", "calories", "preWeightKg", "postWeightKg", "externalId", "matchedPlanId"] as const) {
        if (w[field] !== undefined) Object.assign(unchanged, { [field]: w[field] });
      }
      const changed = await db.workout.updateMany({ where: { ...unchanged, approved: false }, data: { approved: true } });
      if (!changed.count && !await db.workout.findFirst({ where: { ...unchanged, approved: true } })) throw new ApiError("The workout changed. Refresh before approving.", 409);
      await db.auditLog.create({ data: { actorId: actor.id, subjectId: user.id, action: "workout.approved", entityId: workout.id, after: JSON.stringify({ revision: canonical.revision }) } });
      return changed;
    }, { isolationLevel: "Serializable" });
    await meterUsage(user.id, "fit_exports", 1);
    // Manual email delivery is handled by the consent-verified durable worker.
    // Legacy reminderPref.emailEnabled is never sufficient authorization.
    return new NextResponse(Buffer.from(fit), { headers: {
      "Content-Type": contentType, "X-Delivered-Email": "0",
      "X-Workout-Revision": canonical.revision, "X-Workout-Compatibility": "device-unverified",
      "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2034") return errorResponse(new ApiError("The workout or its safety information changed while approving. Refresh before trying again.", 409));
    if (error instanceof SessionResolutionError) return NextResponse.json({ error: error.message, code:error.status===409?"session_review_required":"workout_structure_required",sessionId:new URL(req.url).searchParams.get("sessionId"),revision:currentRevision,remediation:{href:"/today",action:"Review the current session, missing sport context and structured steps before downloading. No pool length, stroke or readiness is assumed."} }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    return errorResponse(error);
  }
}
