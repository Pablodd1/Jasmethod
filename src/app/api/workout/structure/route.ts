import { prisma } from "@/lib/db";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { effectivePrescription } from "@/lib/effective-prescription";
import { SessionResolutionError } from "@/lib/canonical-session";
import { MAX_STRUCTURE_REQUEST_BYTES, parseStructureEditRequest, readStructureEditBody, StructureEditError } from "@/lib/sport-structure-edit";
import { applySportStructureEdit, structureMetadata } from "@/lib/sport-structure-store";

const headers = { "Cache-Control": "private, no-store" };
function failure(error: unknown) {
  if (error instanceof StructureEditError || error instanceof SessionResolutionError || error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status, headers });
  if (error && typeof error === "object" && "code" in error && error.code === "P2034") return Response.json({ error: "This session or its safety information changed while saving. Reload the saved structure before trying again." }, { status: 409, headers });
  return errorResponse(error);
}

export async function GET(req: Request) {
  try {
    const { athlete } = await trainingAccess(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id || id.length > 200) throw new ApiError("Select the session to inspect.");
    const resolved = await effectivePrescription(athlete.id, id);
    if (!resolved) throw new ApiError("Workout not found", 404);
    return Response.json(structureMetadata(resolved), { headers });
  } catch (error) { return failure(error); }
}

export async function PATCH(req: Request) {
  try {
    const { actor, athlete } = await trainingAccess(req);
    const length = Number(req.headers.get("content-length"));
    if (Number.isFinite(length) && length > MAX_STRUCTURE_REQUEST_BYTES) throw new StructureEditError("Structured workout JSON is too large (maximum 64 KiB).", 413);
    const body = parseStructureEditRequest(await readStructureEditBody(req));
    const saved = await prisma.$transaction(
      tx => applySportStructureEdit(tx, { actorId: actor.id, athleteId: athlete.id }, body),
      { isolationLevel: "Serializable" },
    );
    return Response.json({ ok: true, ...saved, message: body.sportStructure === null ? "Structure cleared. Recalculate through check-in before training or export." : "Structure saved. Current check-in and safety limits still apply." }, { headers });
  } catch (error) { return failure(error); }
}
