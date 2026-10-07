import { invalidateDoubleDay } from "@/lib/double-day";
import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { prescribeToday } from "@/lib/adaptive";
import { baseWorkout } from "@/lib/prescription";
import { effectivePrescription } from "@/lib/effective-prescription";
import { canonicalSession, requireSessionRevision, SessionResolutionError } from "@/lib/canonical-session";
export async function POST(req: Request) {
  try {
    const { actor, athlete } = await trainingAccess(req);
    const b = await req.json().catch(() => { throw new ApiError("Invalid JSON"); });
    if (!b || typeof b !== "object" || Array.isArray(b) || typeof b.id !== "string") throw new ApiError("Select the session to vary.");
    if (b.mode && b.mode !== "variant") throw new ApiError("Edit the sport in your plan to choose another modality.");
    const resolved = await effectivePrescription(athlete.id, b.id);
    if (!resolved) throw new ApiError("Workout not found", 404);
    requireSessionRevision(resolved.canonical, b.expectedRevision);
    if (resolved.canonical.verdict !== "ready") throw new ApiError(resolved.canonical.reason, 409);
    if (resolved.canonical.sportStructure) throw new ApiError("Explicit sport structure must be edited directly; a generic variant would discard its lengths, sets or components.", 409);
    if (resolved.canonical.steps.some(s => s.endpoint.type !== "time" || (s.target.source === "explicit" && s.target.type !== "open")))
      throw new ApiError("This session has specific endpoints or numeric targets. Review edits in the plan instead of generating a generic variant.", 409);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${athlete.id}))`;
      const w = await tx.workout.findFirst({ where: { id: b.id, userId: athlete.id, planned: true }, include: { planDay: true } });
      if (!w) throw new ApiError("Workout not found", 404);
      if (w.prescription !== resolved.workout.prescription || w.durationMin !== resolved.workout.durationMin || w.intensity !== resolved.workout.intensity || w.feedbackAt)
        throw new ApiError("This session changed or has recorded feedback. Refresh before editing.", 409);
      if (baseWorkout(w).protocol) throw new ApiError("Use Training protocols to select a different structured protocol.");
      if (w.completed || w.durationMin < 20 || w.planDay?.dayOff || !["run", "bike", "swim"].includes(w.sport))
        throw new ApiError("Variants are available for unfinished run, bike and swim sessions of at least 20 minutes.");
      if (w.regenCount >= 3) throw new ApiError("All three variants have been used.", 429);
      const seed = w.regenCount + 1;
      const old = resolved.prescription;
      const cap = `z${Math.max(...resolved.canonical.steps.map(s => Number(s.zone.slice(1))))}`;
      const p = prescribeToday({
        session: { ...w, durationMin: resolved.canonical.durationMin, intensity: cap, variantSeed: seed },
        adaptation: { verdict: old.verdict, durationFactor: 1, intensityCap: cap },
        // This is already the reviewed effective allocation. Do not apply the
        // coach multiplier again or spend another session's remaining budget.
        profile: { ...resolved.targetProfile, intensityPct: 100 },
        timeBudgetMin: resolved.canonical.durationMin,
      });
      if (resolved.canonical.steps.every(s => s.target.source === "explicit" && s.target.type === "open")) p.steps = p.steps.map(s => ({ ...s, target: { type: "open" } }));
      p.scaled = old.scaled;
      p.verdict = old.verdict;
      const checked = canonicalSession({ athleteId: athlete.id, workout: w, prescription: p, profile: resolved.targetProfile, dateLocal: resolved.canonical.dateLocal, timezone: athlete.timezone });
      if (checked.verdict !== "ready" || checked.durationMin > resolved.canonical.durationMin) throw new ApiError(checked.reason || "Variant could not preserve the reviewed allocation.", 409);
      const base = { ...baseWorkout(w), variantSeed: seed };
      const updated = await tx.workout.update({ where: { id: w.id }, data: { originalPlan: invalidateDoubleDay(JSON.stringify(base)), prescription: JSON.stringify(p), notes: p.detail.main, regenCount: seed, approved: false } });
      await tx.auditLog.create({ data: { actorId: actor.id, subjectId: athlete.id, action: "workout.variant", entityId: w.id, before: w.prescription, after: JSON.stringify(p), note: `Preserved current effective duration/cap; source revision ${resolved.canonical.revision}` } });
      return updated;
    });
    return Response.json({ ok: true, workout: result, regensLeft: 3 - result.regenCount, message: "Workout structure updated; reviewed duration and intensity are preserved." });
  } catch (error) {
    if (error instanceof SessionResolutionError) return Response.json({ error: error.message }, { status: error.status });
    return errorResponse(error);
  }
}
