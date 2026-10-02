import { parsePlanningSetup } from "./planning-setup";
import { readPlanningSetup } from "./planning-setup-store";
import { createHash } from "node:crypto";
import { prisma } from "./db";
import { ApiError } from "./access";
import { profilePatch } from "./profile-update";

export function profileRevision(profile: unknown) {
  return createHash("sha256").update(JSON.stringify(profile ?? null)).digest("hex");
}

export async function saveProfile(actorId: string, athlete: {id: string; timezone: string}, body: Record<string, unknown>) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("Invalid profile body");
  const { expectedRevision, reason, setup: rawSetup, expectedSetupRevision, ...fields } = body;
  let setup;
  try { setup = rawSetup === undefined ? undefined : parsePlanningSetup(rawSetup, new Date(), athlete.timezone); } catch (e) { throw new ApiError((e as Error).message); }
  if (typeof expectedRevision !== "string") throw new ApiError("Reload the profile before saving", 409);
  if (setup?.profileConfirmed && (typeof fields.experience !== "string" || fields.experience === "" || fields.weeklyHours == null || fields.weeklyHours === "")) throw new ApiError("Select your actual experience and available weekly hours before confirming them");
  if (setup && actorId !== athlete.id) setup.source = "coach_set";
  const data = profilePatch(fields, athlete.timezone);
  if (!Object.keys(data).length && !setup) throw new ApiError("No profile changes supplied");
  try {
    return await prisma.$transaction(async tx => {
      const before = await tx.athleteProfile.findUnique({where: {userId: athlete.id}});
      if (expectedRevision !== undefined && expectedRevision !== profileRevision(before))
        throw new ApiError("This profile changed while you were editing. Reload and review the latest values.", 409);
      if (setup) {
        const priorSetup = await readPlanningSetup(athlete.id, tx);
        if (expectedSetupRevision !== priorSetup.revision) throw new ApiError("Your setup changed. Reload and review it before saving.", 409);
      }
      const merged = {...before, ...data};
      if (merged.maxHr && merged.lthr && merged.lthr > merged.maxHr) throw new ApiError("Threshold heart rate cannot exceed maximum heart rate");
      if (merged.restingHr && merged.maxHr && merged.restingHr >= merged.maxHr) throw new ApiError("Resting heart rate must be below maximum heart rate");
      const profile = await tx.athleteProfile.upsert({where: {userId: athlete.id}, create: {userId: athlete.id, ...data}, update: data});
      await tx.auditLog.create({data: {actorId, subjectId: athlete.id, action: "profile.update", entityId: profile.id,
        before: JSON.stringify(before), after: JSON.stringify(profile), note: typeof reason === "string" ? reason.slice(0,1000) : null}});
      if (setup) await tx.auditLog.create({ data: {
        actorId, subjectId: athlete.id, action: "profile.setup", entityId: profile.id,
        after: JSON.stringify(setup), note: "Explicit setup with actor/source recorded; not device measurements or medical clearance",
      } });
      return profile;
    }, {isolationLevel: "Serializable"});
  } catch(e: any) {
    if (e.code === "P2034") throw new ApiError("Another edit was saved at the same time. Reload before saving again.", 409);
    throw e;
  }
}
