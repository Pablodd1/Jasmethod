import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { buildSessionDownload } from "@/lib/fit-export";
import { effectivePrescription } from "@/lib/effective-prescription";
import { requireSessionRevision, SessionResolutionError } from "@/lib/canonical-session";
import { meterUsage } from "@/lib/telemetry";
export const dynamic = "force-dynamic";

// GET is a download only. POST explicitly approves and may email the same file.
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
    const approval = markApproved ? await prisma.$transaction(async db => {
      const changed = await db.workout.updateMany({ where: { id: workout.id, userId: user.id, approved: false, prescription: workout.prescription }, data: { approved: true } });
      if (!changed.count && !await db.workout.findFirst({ where: { id: workout.id, userId: user.id, approved: true, prescription: workout.prescription } })) throw new ApiError("The workout changed. Refresh before approving.", 409);
      await db.auditLog.create({ data: { actorId: actor.id, subjectId: user.id, action: "workout.approved", entityId: workout.id, after: JSON.stringify({ revision: canonical.revision }) } });
      return changed;
    }) : null;
    const newlyApproved = approval?.count === 1;
    await meterUsage(user.id, "fit_exports", 1);
    let emailed = false;
    try {
      const prefs = newlyApproved ? await prisma.reminderPref.findUnique({ where: { userId: user.id } }) : null;
      if (newlyApproved && prefs?.emailEnabled) {
        const { sendEmail } = await import("@/lib/email");
        const es = user.language === "es";
        const steps = canonical.steps.map(s => {
          const e = s.endpoint;
          const duration = e.type === "time" ? `${e.seconds} s` : e.type === "distance" ? `${e.meters} m` : e.type === "reps" ? `${e.reps} reps` : "Lap/manual endpoint";
          return `${s.phase}: ${s.name} · ${duration} · ${s.target.label}${s.note ? ` · ${s.note}` : ""}`;
        }).join("\n");
        const delivery = await sendEmail({
          to: user.email, subject: `${es ? "Entrenamiento aprobado" : "Approved workout"}: ${canonical.title}`,
          text: `${canonical.title}\nRevision: ${canonical.revision}\n\n${steps}\n\n${es ? "Archivo de entrenamiento adjunto. No se ha enviado al reloj. Comprueba la compatibilidad y cada paso antes de entrenar." : "Workout file attached. It has not been sent to your watch. Check compatibility and every step before training."}`,
          html: `<p>${es ? "Archivo aprobado adjunto. No se ha enviado al reloj; comprueba la compatibilidad." : "Approved workout file attached. It has not been sent to your watch; check compatibility."}</p>`,
          userId: user.id, attachments: [{ filename, content: Buffer.from(fit) }],
        });
        emailed = delivery.ok;
      }
    } catch (error) { console.error("approve email delivery failed:", error); }
    return new NextResponse(Buffer.from(fit), { headers: {
      "Content-Type": contentType, "X-Delivered-Email": emailed ? "1" : "0",
      "X-Workout-Revision": canonical.revision, "X-Workout-Compatibility": "device-unverified",
      "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    if (error instanceof SessionResolutionError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    return errorResponse(error);
  }
}
