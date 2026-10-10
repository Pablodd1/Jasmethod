import { createHash } from "node:crypto";
import { prisma } from "./db";
import { ApiError } from "./access";
import { dayBounds } from "./dates";
import { parseGarminFile } from "./garmin-file-import";
import {
  GARMIN_IMPORT_VERSION, garminImportCounts, garminPreviewToken, importedFields,
  planGarminImport, type ExistingGarminActivity,
} from "./garmin-import-plan";

export type GarminImportInput = Parameters<typeof parseGarminFile>[0];
const AUDIT_ACTION = "garmin.fileImport.confirmed";
const MAX_ACTIVITIES = 1000;
const MAX_CANDIDATES = 10000;
function fileFingerprint(input: GarminImportInput) {
  const content = typeof input.content === "string" ? Buffer.from(input.content, "utf8") : input.content;
  return createHash("sha256").update(content).update(JSON.stringify({
    version: GARMIN_IMPORT_VERSION, filename: input.filename,
    timezone: input.timezone, unitSystem: input.unitSystem, distanceUnit: input.distanceUnit,
    swimDistanceUnit: input.swimDistanceUnit, numberFormat: input.numberFormat,
  })).digest("hex");
}
async function previewWithDb(db: any, userId: string, input: GarminImportInput) {
  const parsed = parseGarminFile(input);
  if (parsed.workouts.length > MAX_ACTIVITIES) throw new ApiError(`Review at most ${MAX_ACTIVITIES} activities at once. Export a smaller date range.`, 413);
  const dates = parsed.workouts.map(row => row.date.getTime());
  const athlete = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  if (!athlete) throw new ApiError("Your account is no longer available. Sign in again.", 401);
  const existing: ExistingGarminActivity[] = !dates.length ? [] : await db.workout.findMany({
    where: { userId, OR: [
      { source: "garmin", externalId: { in: parsed.workouts.flatMap(row => [row.externalId, ...(row.legacyExternalIds || [])]) } },
      { date: { gte: new Date(dayBounds(athlete.timezone, new Date(Math.min(...dates))).start.getTime() - 60_000), lte: new Date(dayBounds(athlete.timezone, new Date(Math.max(...dates))).end.getTime() + 60_000) } },
    ] }, orderBy: { id: "asc" }, take: MAX_CANDIDATES + 1,
    select: { id: true, userId: true, source: true, externalId: true, date: true, sport: true,
      title: true, durationMin: true, distanceKm: true, avgHr: true, maxHr: true, avgPower: true,
      np: true, tss: true, calories: true, planned: true, completed: true, actualDurationMin: true,
      actualSport: true, feedbackStatus: true, feedbackAt: true, rpe: true, notes: true,
      matchedPlanId: true },
  });
  if (existing.length > MAX_CANDIDATES) throw new ApiError("This date range has too much saved history to review safely at once. Export a smaller date range.", 413);
  const plans = planGarminImport(parsed.workouts, existing, athlete.timezone);
  const fileDuplicates = parsed.diagnostics.filter(row => row.code === "DUPLICATE_IN_FILE").length;
  const counts = garminImportCounts(plans, Math.max(0, parsed.skippedRecords - fileDuplicates), parsed.rejectedRecords);
  counts.duplicate += fileDuplicates;
  const fingerprint = fileFingerprint(input);
  const previewToken = garminPreviewToken({ version: GARMIN_IMPORT_VERSION, userId, timezone: athlete.timezone, fingerprint, existing, plans, diagnostics: parsed.diagnostics });
  return { parsed, plans, fingerprint, response: {
    previewToken, format: parsed.format, counts, coverage: parsed.coverage,
    warnings: [
      "This is only the activity data in the selected file, not a complete Garmin account export, wellness record or training baseline.",
      "Possible duplicates from another format or provider are kept unchanged. Conflicts are skipped for review, not silently merged.",
      "Confirmation saves completed activity history only. Your training cycle, planned sessions, notes, feedback and messaging preferences are preserved. No messages are sent by this file import.",
    ], diagnostics: parsed.diagnostics,
    sample: plans.slice(0, 100).map(({ workout, status, reason }) => ({ date: workout.date.toISOString(), sport: workout.sport, title: workout.title, durationMin: workout.durationMin, distanceKm: workout.distanceKm, status, reason })),
    sampleLimit: 100, totalRecords: parsed.totalRecords,
    canCommit: !parsed.fatal && counts.new + counts.updated > 0,
  } };
}
export async function previewGarminImport(userId: string, input: GarminImportInput, db: any = prisma) {
  return (await previewWithDb(db, userId, input)).response;
}

/** No raw upload is stored. Confirmation is actor/file/options/state-bound;
 * a durable receipt makes an interrupted response safe to retry. */
export async function confirmGarminImport(userId: string, input: GarminImportInput, previewToken: string, db: any = prisma) {
  if (!/^[a-f0-9]{64}$/.test(previewToken)) throw new ApiError("Review the file before confirming its import.", 400);
  const fingerprint = fileFingerprint(input);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(async (tx: any) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
        const previous = await tx.auditLog.findFirst({ where: { actorId: userId, subjectId: userId, action: AUDIT_ACTION, entityId: previewToken }, select: { after: true } });
        if (previous) {
          const receipt = JSON.parse(previous.after || "null");
          if (receipt?.fingerprint !== fingerprint || receipt?.version !== GARMIN_IMPORT_VERSION) throw new ApiError("The selected file or import options changed. Review a new preview.", 409);
          return { ok: true, replayed: true, counts: receipt.counts, coverage: receipt.coverage };
        }
        const current = await previewWithDb(tx, userId, input);
        if (current.response.previewToken !== previewToken) throw new ApiError("The file, options or saved history changed. Review a fresh preview before importing.", 409);
        if (!current.response.canCommit) throw new ApiError("There are no valid new or updated activities to save. Review the preview diagnostics.", 422);
        const newRows = current.plans.filter(row => row.status === "new").map(({ workout }) => ({
          userId, source: "garmin", externalId: workout.externalId, type: "endurance",
          planned: false, completed: true, actualDurationMin: workout.durationMin, ...importedFields(workout),
        }));
        if (newRows.length) await tx.workout.createMany({ data: newRows });
        for (const row of current.plans.filter(row => row.status === "updated")) {
          // Deliberately no notes, RPE, explicit feedback, source, identity, plan
          // link or prescription updates. No calls to notification/matching services.
          await tx.workout.update({ where: { id: row.existingId }, data: { ...importedFields(row.workout), actualDurationMin: row.workout.durationMin, insights: null } });
        }
        const receipt = { version: GARMIN_IMPORT_VERSION, fingerprint, counts: current.response.counts, coverage: current.response.coverage,
          normalization: { timezone: input.timezone, unitSystem: input.unitSystem, distanceUnit: input.distanceUnit, swimDistanceUnit: input.swimDistanceUnit, numberFormat: input.numberFormat },
          durationEvidence: current.plans.filter(row => row.status === "new" || row.status === "updated").map(row => ({ externalId: row.workout.externalId, sourceRow: row.workout.sourceRow, sourceDurationSeconds: row.workout.sourceDurationSeconds, storedDurationMin: row.workout.durationMin })),
        };
        await tx.auditLog.create({ data: { actorId: userId, subjectId: userId, action: AUDIT_ACTION, entityId: previewToken, after: JSON.stringify(receipt), note: "Athlete-confirmed file import; no raw file retained, no plan replacement or message delivery" } });
        return { ok: true, replayed: false, counts: receipt.counts, coverage: receipt.coverage };
      }, { isolationLevel: "Serializable", maxWait: 10000, timeout: 30000 });
    } catch (error: any) {
      if (error?.code === "P2034" && attempt < 2) continue;
      throw error;
    }
  }
  throw new ApiError("Saved history changed during import. Review a new preview.", 409);
}
