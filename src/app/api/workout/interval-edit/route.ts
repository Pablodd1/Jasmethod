import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { effectivePrescription } from "@/lib/effective-prescription";
import { prisma } from "@/lib/db";
import { workoutHasHistory } from "@/lib/workout-update";
import { localDate, dateKey } from "@/lib/dates";
import { applyIntervalPatch, parseIntervalRequest, readIntensityCapZone, toEditableSteps, type IntervalPatch } from "@/lib/workout-interval-edit";
import { PATCH as saveCardSteps } from "../card/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Smart Coach interval edit: PREVIEW then APPLY. This route never writes workout data itself. "apply" re-derives
 * the new steps on the server from the current canonical session (never from client-supplied steps) and hands them
 * to the existing revision-bound card PATCH, which keeps the single writer: athlete scope, serializable
 * transaction, approval cleared, AuditLog before/after. A change that raises load needs `confirmed: true`.
 * Nothing is sent to a watch, calendar, email or Telegram; the edited session must be approved again first.
 */
const PATCH_KEYS = ["repeats", "repeatsDelta", "workSeconds", "restSeconds", "workZone"] as const;
function cleanPatch(value: unknown): IntervalPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ApiError("Send an interval change.");
  const raw = value as Record<string, unknown>, out: IntervalPatch = {};
  for (const key of Object.keys(raw)) if (!(PATCH_KEYS as readonly string[]).includes(key)) throw new ApiError("Unknown interval change field.");
  for (const key of PATCH_KEYS) if (raw[key] !== undefined) {
    const n = raw[key];
    if (typeof n !== "number" || !Number.isInteger(n)) throw new ApiError(`Invalid ${key}.`);
    out[key] = n;
  }
  if (!Object.keys(out).length) throw new ApiError("Send an interval change.");
  return out;
}

export async function POST(req: Request) {
  try {
    const { actor, athlete } = await trainingAccess(req);
    let body: any;
    try { body = await req.json(); } catch { throw new ApiError("Invalid JSON."); }
    if (typeof body?.id !== "string" || !body.id || body.id.length > 200) throw new ApiError("Select a workout.");
    if (typeof body.expectedRevision !== "string" || !/^[a-f0-9]{64}$/.test(body.expectedRevision)) throw new ApiError("Reload the workout before editing.", 409);
    const mode = body.mode === "apply" ? "apply" : "preview";
    const lang = athlete.language === "es" ? "es" : "en";

    const resolved = await effectivePrescription(athlete.id, body.id);
    if (!resolved) throw new ApiError("Workout not found", 404);
    const { canonical, workout } = resolved;
    if (body.expectedRevision !== canonical.revision) throw new ApiError("The workout changed. Reload before editing.", 409);
    if (canonical.verdict !== "ready") throw new ApiError("Review the check-in and plan before editing this workout.", 409);
    if (!["run", "bike"].includes(canonical.sport)) throw new ApiError("Chat interval edits support running and cycling workouts.", 422);
    if (!workout.planned || workoutHasHistory(workout)) throw new ApiError("Recorded sessions cannot be edited.", 409);

    let patch: IntervalPatch;
    if (body.patch !== undefined) patch = cleanPatch(body.patch);
    else {
      const parsed = parseIntervalRequest(typeof body.text === "string" ? body.text : "");
      if (!parsed.ok) return Response.json({ ok: false, code: parsed.code, message: parsed[lang] }, { status: 422, headers: { "Cache-Control": "private, no-store" } });
      patch = parsed.patch;
    }

    const sessionDate = localDate(dateKey(workout.date, athlete.timezone), athlete.timezone);
    const checkin = await prisma.dailyCheckin.findUnique({ where: { userId_date: { userId: athlete.id, date: sessionDate } } });
    const result = applyIntervalPatch(toEditableSteps(canonical.steps as any), patch, { budgetSeconds: canonical.durationMin * 60, intensityCapZone: readIntensityCapZone(checkin?.adaptation) });
    if (!result.ok) return Response.json({ ok: false, code: result.code, message: result[lang], maxRepeatsThatFit: result.maxRepeatsThatFit ?? null }, { status: 422, headers: { "Cache-Control": "private, no-store" } });

    const preview = { before: result.before, after: result.after, changes: result.changes[lang], requiresConfirmation: result.requiresConfirmation, confirmationReasons: result.confirmationReasons[lang] };
    if (mode === "preview") return Response.json({ ok: true, mode, expectedRevision: canonical.revision, patch, preview, approvalWillBeCleared: true }, { headers: { "Cache-Control": "private, no-store" } });

    if (result.requiresConfirmation && body.confirmed !== true)
      return Response.json({ ok: false, code: "confirmation_required", message: result.confirmationReasons[lang].join(" "), preview }, { status: 409, headers: { "Cache-Control": "private, no-store" } });

    // Single writer: the existing card PATCH (same cookies, same ?athleteId scope).
    const headers = new Headers(req.headers);
    headers.delete("content-length");
    headers.set("content-type", "application/json");
    const saved = await saveCardSteps(new Request(req.url.replace(/\/interval-edit(?=\?|$)/, "/card"), { method: "PATCH", headers, body: JSON.stringify({ id: body.id, expectedRevision: canonical.revision, steps: result.steps }) }));
    if (!saved.ok) return saved;
    const card = await saved.json();
    // Provenance of the request (what was asked, in the athlete's words). Informational; cardSteps is the authoritative row.
    await prisma.auditLog.create({ data: { actorId: actor.id, subjectId: athlete.id, entityId: body.id, action: "workout.intervalEditRequest", after: JSON.stringify(patch), note: typeof body.text === "string" ? body.text.slice(0, 400) : null } }).catch(() => {});
    return Response.json({ ok: true, mode, preview, card, approvalCleared: true, nextStep: "approve" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
