import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { prescribeToday } from "@/lib/adaptive";
import { baseWorkout } from "@/lib/prescription";
export async function POST(req: Request) {
  try {
    const { actor, athlete } = await trainingAccess(req);
    const b = await req.json();
    if (b.mode && b.mode !== "variant")
      throw new ApiError(
        "Edit the sport in your plan to choose another modality.",
      );
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${athlete.id}))`;
      const w = await tx.workout.findFirst({
        where: { id: String(b.id), userId: athlete.id, planned: true },
        include: { planDay: true },
      });
      if (!w) throw new ApiError("Workout not found", 404);
      if (baseWorkout(w).protocol) throw new ApiError("Use Training protocols to select a different structured protocol.");
      if (
        athlete.profile?.injured ||
        w.completed ||
        w.durationMin < 20 ||
        w.planDay?.dayOff ||
        !["run", "bike", "swim"].includes(w.sport)
      )
        throw new ApiError(
          "Variants are available for unfinished run, bike and swim sessions of at least 20 minutes.",
        );
      if (w.regenCount >= 3)
        throw new ApiError("All three variants have been used.", 429);
      const seed = w.regenCount + 1;
      const base = { ...baseWorkout(w), variantSeed: seed };
      const p = prescribeToday({
        session: { ...w, variantSeed: seed },
        adaptation: {
          verdict: "full",
          durationFactor: 1,
          intensityCap: w.intensity || "z2",
        },
        profile: athlete.profile,
      });
      if (w.prescription) {
        const old = JSON.parse(w.prescription);
        p.scaled = old.scaled;
        p.verdict = old.verdict;
      }
      const updated = await tx.workout.update({
        where: { id: w.id },
        data: {
          originalPlan: JSON.stringify(base),
          prescription: JSON.stringify(p),
          notes: p.detail.main,
          regenCount: seed,
          approved: false,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          subjectId: athlete.id,
          action: "workout.variant",
          entityId: w.id,
          before: w.prescription,
          after: JSON.stringify(p),
        },
      });
      return updated;
    });
    return Response.json({
      ok: true,
      workout: result,
      regensLeft: 3 - result.regenCount,
      message:
        "Workout structure updated; duration and intensity are preserved.",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
