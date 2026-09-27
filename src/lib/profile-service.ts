import { createHash } from "node:crypto";
import { prisma } from "./db";
import { ApiError } from "./access";
import { profilePatch } from "./profile-update";

export function profileRevision(profile: unknown) {
  return createHash("sha256").update(JSON.stringify(profile ?? null)).digest("hex");
}

export async function saveProfile(actorId: string, athlete: {id: string; timezone: string}, body: Record<string, unknown>) {
  const { expectedRevision, reason, ...fields } = body;
  if (typeof expectedRevision !== "string") throw new ApiError("Reload the profile before saving", 409);
  const data = profilePatch(fields, athlete.timezone);
  if (!Object.keys(data).length) throw new ApiError("No profile changes supplied");
  try {
    return await prisma.$transaction(async tx => {
      const before = await tx.athleteProfile.findUnique({where: {userId: athlete.id}});
      if (expectedRevision !== undefined && expectedRevision !== profileRevision(before))
        throw new ApiError("This profile changed while you were editing. Reload and review the latest values.", 409);
      const merged = {...before, ...data};
      if (merged.maxHr && merged.lthr && merged.lthr > merged.maxHr) throw new ApiError("Threshold heart rate cannot exceed maximum heart rate");
      if (merged.restingHr && merged.maxHr && merged.restingHr >= merged.maxHr) throw new ApiError("Resting heart rate must be below maximum heart rate");
      const profile = await tx.athleteProfile.upsert({where: {userId: athlete.id}, create: {userId: athlete.id, ...data}, update: data});
      await tx.auditLog.create({data: {actorId, subjectId: athlete.id, action: "profile.update", entityId: profile.id,
        before: JSON.stringify(before), after: JSON.stringify(profile), note: typeof reason === "string" ? reason.slice(0,1000) : null}});
      return profile;
    }, {isolationLevel: "Serializable"});
  } catch(e: any) {
    if (e.code === "P2034") throw new ApiError("Another edit was saved at the same time. Reload before saving again.", 409);
    throw e;
  }
}
