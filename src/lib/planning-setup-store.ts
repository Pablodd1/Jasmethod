import { prisma } from "./db";
import { type PlanningSetup, PLANNING_SETUP_VERSION, parsePlanningSetup } from "./planning-setup";
// Reuse immutable audit records so this pilot requires no schema migration.
export async function readPlanningSetup(userId: string, db: Pick<typeof prisma, "auditLog"> = prisma): Promise<{ setup: PlanningSetup | null; revision: string | null }> {
  const entry = await db.auditLog.findFirst({ where: { subjectId: userId, action: "profile.setup" }, orderBy: [{createdAt: "desc"}, {id: "desc"}], select: { id: true, after: true } });
  if (!entry?.after) return { setup: null, revision: null };
  try {
    const setup = JSON.parse(entry.after);
    if (setup.version !== PLANNING_SETUP_VERSION || !["athlete_reported","coach_set"].includes(setup.source)) return { setup: null, revision: entry.id };
    const confirmed = new Date(setup.confirmedAt);
    if (!Number.isFinite(confirmed.getTime()) || confirmed > new Date()) return {setup:null, revision:entry.id};
    // Validate shape and ranges on reads as well as writes; preserve observation metadata.
    const validated = parsePlanningSetup(setup, new Date(Date.now() + 86400000), "UTC", {allowPastTarget:true});
    return { setup: {...validated, source: setup.source, confirmedAt: setup.confirmedAt}, revision: entry.id };
  } catch { return { setup: null, revision: entry.id }; }
}
