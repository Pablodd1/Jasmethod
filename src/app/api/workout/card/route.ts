import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { effectivePrescription } from "@/lib/effective-prescription";
import { buildUniversalWorkoutCard } from "@/lib/universal-workout-card-server";
import {
  renderUniversalWorkoutPng,
  renderUniversalWorkoutSvg,
} from "@/lib/universal-workout-render";
import { prisma } from "@/lib/db";
import { workoutHasHistory } from "@/lib/workout-update";
import { parseWorkoutCardEdit } from "@/lib/workout-card-edit";
import { readStructureEditBody } from "@/lib/sport-structure-edit";
import { dateKey } from "@/lib/dates";
import { SessionResolutionError } from "@/lib/canonical-session";
import { StructureEditError } from "@/lib/sport-structure-edit";
import { hasDoubleDayMetadata } from "@/lib/double-day";

function failure(error: unknown) {
  if (
    error instanceof SessionResolutionError ||
    error instanceof StructureEditError
  )
    return Response.json(
      { error: error.message },
      {
        status: error.status,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2034"
  )
    return Response.json(
      { error: "Workout changed during the edit. Reload before saving." },
      { status: 409 },
    );
  return errorResponse(error);
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const { athlete } = await trainingAccess(req);
    const query = new URL(req.url).searchParams,
      id = query.get("id");
    if (!id || id.length > 200) throw new ApiError("Select a workout.");
    const resolved = await effectivePrescription(athlete.id, id);
    if (!resolved) throw new ApiError("Workout not found", 404);
    const revision = query.get("revision");
    if (revision && revision !== resolved.canonical.revision)
      throw new ApiError(
        "Workout changed. Reload the current card before exporting.",
        409,
      );
    const card = buildUniversalWorkoutCard(
      resolved.canonical,
      resolved.nutrition,
      athlete.language === "es" ? "es" : "en",
      resolved.workout.startTime,
      resolved.targetProfile?.units,
    );
    const headers = {
      "Cache-Control": "private, no-store",
      "X-Workout-Revision": card.session.revision,
      "X-Content-Type-Options": "nosniff",
    };
    const format = query.get("format");
    if (format === "png")
      return new Response(new Uint8Array(renderUniversalWorkoutPng(card)), {
        headers: {
          ...headers,
          "Content-Type": "image/png",
          "Content-Disposition": "attachment; filename=workout-card.png",
        },
      });
    if (format === "svg")
      return new Response(renderUniversalWorkoutSvg(card), {
        headers: {
          ...headers,
          "Content-Type": "image/svg+xml",
          "Content-Disposition": "attachment; filename=workout-card.svg",
          "Content-Security-Policy":
            "default-src 'none'; style-src 'unsafe-inline'",
        },
      });
    if (format && format !== "json")
      throw new ApiError("Unsupported card format.");
    return Response.json(card, { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const { actor, athlete } = await trainingAccess(req);
    const raw = await readStructureEditBody(req);
    let body: any;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ApiError("Invalid workout JSON.");
    }
    if (typeof body?.id !== "string" || body.id.length > 200)
      throw new ApiError("Select a workout.");
    const saved = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${athlete.id}))`;
        const current = await effectivePrescription(athlete.id, body.id, tx);
        if (!current) throw new ApiError("Workout not found", 404);
        let previousPrescription: any = null;
        const w = current.workout;
        if (body.action === "restore") {
          if (
            Object.keys(body).some(
              (k) => !["id", "expectedRevision", "action"].includes(k),
            )
          )
            throw new ApiError("Invalid restore request.");
          const previous = await tx.auditLog.findFirst({
            where: {
              subjectId: athlete.id,
              entityId: w.id,
              action: "workout.cardSteps",
            },
            orderBy: { createdAt: "desc" },
          });
          if (!previous?.before || previous.after !== w.prescription)
            throw new ApiError(
              "No matching step edit is available to restore.",
              409,
            );
          try {
            previousPrescription = JSON.parse(previous.before);
          } catch {
            throw new ApiError("Previous steps are unavailable.", 409);
          }
        }
        const edit = parseWorkoutCardEdit(
          previousPrescription
            ? {
                id: body.id,
                expectedRevision: body.expectedRevision,
                steps: previousPrescription.sportStructure?.kind === "endurance" ? previousPrescription.sportStructure.steps : previousPrescription.steps,
              }
            : body,
          current.canonical.sport,
        );
        if (edit.expectedRevision !== current.canonical.revision)
          throw new ApiError("Workout changed. Reload before editing.", 409);
        if (
          !w.planned ||
          workoutHasHistory(w) ||
          w.planDay?.dayOff ||
          dateKey(w.date, athlete.timezone) <
            dateKey(new Date(), athlete.timezone)
        )
          throw new ApiError(
            "This recorded, past or rest-day session is read-only.",
            409,
          );
        if (current.canonical.verdict !== "ready")
          throw new ApiError(
            "Review the check-in and plan before editing executable steps.",
            409,
          );
        const p = JSON.parse(w.prescription || "null");
        if (
          !p ||
          (p.sportStructure && p.sportStructure.kind !== "endurance") ||
          p.doubleDay ||
          p.protocol ||
          hasDoubleDayMetadata(w)
        )
          throw new ApiError(
            "Use the reviewed protocol or sport editor for this workout.",
            409,
          );
        if (previousPrescription && (!Number.isFinite(previousPrescription.sportStructureBudgetMin ?? previousPrescription.durationMin) || (previousPrescription.sportStructureBudgetMin ?? previousPrescription.durationMin) <= 0)) throw new ApiError("Previous time budget is unavailable.", 409);
        if (
          edit.seconds >
          (previousPrescription
            ? (previousPrescription.sportStructureBudgetMin ?? previousPrescription.durationMin)
            : current.canonical.durationMin) *
            60
        )
          throw new ApiError(
            "Edited steps exceed the reviewed time budget. Change availability and preview the plan first.",
            422,
          );
        const next = {
          ...(previousPrescription || p),
          steps: [],
          sportStructure: { schemaVersion: 1, kind: "endurance", steps: edit.steps },
          sportStructureBudgetMin: edit.seconds / 60,
          durationMin: edit.seconds / 60,
        };
        const count = await tx.workout.updateMany({
          where: {
            id: w.id,
            userId: athlete.id,
            prescription: w.prescription,
            approved: w.approved,
          },
          data: {
            prescription: JSON.stringify(next),
            durationMin: Math.ceil(edit.seconds / 60),
            approved: false,
          },
        });
        if (count.count !== 1)
          throw new ApiError("Workout changed while saving.", 409);
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            subjectId: athlete.id,
            entityId: w.id,
            action: previousPrescription
              ? "workout.cardRestore"
              : "workout.cardSteps",
            before: w.prescription,
            after: JSON.stringify(next),
            note: `Source revision ${edit.expectedRevision}; approval cleared`,
          },
        });
        const resolved = await effectivePrescription(athlete.id, w.id, tx);
        if (!resolved)
          throw new ApiError("Could not verify saved workout.", 409);
        return buildUniversalWorkoutCard(
          resolved.canonical,
          resolved.nutrition,
          athlete.language === "es" ? "es" : "en",
          w.startTime,
          resolved.targetProfile?.units,
        );
      },
      { isolationLevel: "Serializable" },
    );
    return Response.json(saved, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
