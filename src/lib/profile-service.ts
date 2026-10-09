import type { Prisma } from "@prisma/client";
import { parsePlanningSetup, type PlanningSetup } from "./planning-setup";
import { parseTravelContext } from "./travel-context";
import { readPlanningSetup } from "./planning-setup-store";
import { createHash } from "node:crypto";
import { prisma } from "./db";
import { ApiError } from "./access";
import { profilePatch } from "./profile-update";
import { importedWeightSuggestions } from "./profile-import-review";

export function profileRevision(profile: unknown) {
  return createHash("sha256").update(JSON.stringify(profile ?? null)).digest("hex");
}

export async function saveProfile(actorId: string, athlete: {id: string; timezone: string}, body: Record<string, unknown>, transaction?: Prisma.TransactionClient) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new ApiError("Invalid profile body");
  const { expectedRevision, reason, setup: rawSetup, expectedSetupRevision, setupSection, reviewedWeightObservationId, ...fields } = body;
  if (setupSection !== undefined && setupSection !== "travel") throw new ApiError("Invalid setup section");
  const travelOnly = setupSection === "travel";
  if (travelOnly && (reviewedWeightObservationId !== undefined || Object.keys(fields).length || !rawSetup || typeof rawSetup !== "object" || Array.isArray(rawSetup) || !Object.hasOwn(rawSetup, "travel"))) throw new ApiError("Travel updates require only travel context and revisions");
  let setup: PlanningSetup | undefined;
  let travel: ReturnType<typeof parseTravelContext> = null;
  try {
    if (travelOnly) travel = parseTravelContext((rawSetup as Record<string, unknown>).travel);
    else setup = rawSetup === undefined ? undefined : parsePlanningSetup(rawSetup, new Date(), athlete.timezone);
  } catch (e) { throw new ApiError((e as Error).message); }
  if (typeof expectedRevision !== "string") throw new ApiError("Reload the profile before saving", 409);
  if (setup?.profileConfirmed && (typeof fields.experience !== "string" || fields.experience === "" || fields.weeklyHours == null || fields.weeklyHours === "")) throw new ApiError("Select your actual experience and available weekly hours before confirming them");
  if (setup?.doubleDay?.athleteAgreed && actorId !== athlete.id) throw new ApiError("Only the athlete can record their optional double-day agreement.",403);
  if (setup && actorId !== athlete.id) setup.source = "coach_set";
  const data = profilePatch(fields, athlete.timezone);
  const recordsProfileAnswers = !setup && !travelOnly && (Object.hasOwn(data, "experience") || Object.hasOwn(data, "weeklyHours"));
  if (reviewedWeightObservationId !== undefined && (typeof reviewedWeightObservationId !== "string" || !reviewedWeightObservationId.trim() || reviewedWeightObservationId.length > 200 || typeof data.weightKg !== "number")) throw new ApiError("Select a valid imported weight and include its value");
  if (!Object.keys(data).length && !setup && !travelOnly) throw new ApiError("No profile changes supplied");
  try {
    const apply = async (tx: Prisma.TransactionClient) => {
      const before = await tx.athleteProfile.findUnique({where: {userId: athlete.id}});
      if (before && reviewedWeightObservationId === undefined && Object.hasOwn(data, "weightKg") && data.weightKg === before?.weightKg) data.weightSource = before.weightSource;
      if (expectedRevision !== undefined && expectedRevision !== profileRevision(before))
        throw new ApiError("This profile changed while you were editing. Reload and review the latest values.", 409);
      if (setup || travelOnly) {
        const priorSetup = await readPlanningSetup(athlete.id, tx);
        if (expectedSetupRevision !== priorSetup.revision) throw new ApiError("Your setup changed. Reload and review it before saving.", 409);
        if (travelOnly) {
          if (!priorSetup.setup && priorSetup.revision) throw new ApiError("Review invalid saved setup before updating travel.", 409);
          // Merge from the locked transaction's persisted state, never client planning answers.
          // Existing source/confirmation age and past targets remain unchanged.
          setup = priorSetup.setup ? { ...priorSetup.setup, travel } : parsePlanningSetup({ travel }, new Date(), athlete.timezone, { allowPastTarget: true });
          if (!priorSetup.setup && actorId !== athlete.id) setup.source = "coach_set";
        }
      }
      if (recordsProfileAnswers) {
        const prior = await readPlanningSetup(athlete.id, tx);
        if (!prior.setup && prior.revision) throw new ApiError("Review invalid saved setup before updating experience or weekly time.", 409);
        const profileAnswers = {
          experience: Object.hasOwn(data, "experience") || prior.setup?.profileAnswers?.experience === true,
          weeklyHours: Object.hasOwn(data, "weeklyHours") || prior.setup?.profileAnswers?.weeklyHours === true,
        };
        // A narrow settings edit records which answers were supplied. It does not renew safety
        // confirmation, reassign provenance, or accept a stale client copy of planning context.
        setup = prior.setup ? { ...prior.setup, profileAnswers } : parsePlanningSetup({profileAnswers}, new Date(), athlete.timezone);
        if (!prior.setup && actorId !== athlete.id) setup.source = "coach_set";
      }
      if (reviewedWeightObservationId !== undefined) {
        const observation = await tx.metricObservation.findFirst({where:{id:reviewedWeightObservationId as string,userId:athlete.id,metricType:"weight_kg"},select:{id:true,value:true,unit:true,source:true,observedAt:true,qualityFlag:true,measurementMethod:true}});
        if (!observation) throw new ApiError("Imported weight is no longer available. Review your profile again.",409);
        const connector = await tx.connector.findFirst({where:{userId:athlete.id,provider:observation.source,status:{in:["connected","error"]}},select:{provider:true}});
        const suggestion = importedWeightSuggestions([observation],connector?[connector.provider]:[])[0];
        if (!suggestion || suggestion.value !== data.weightKg) throw new ApiError("Imported weight changed or is not eligible. Review it again.",409);
        if (observation.source === "strava" && actorId !== athlete.id) throw new ApiError("Only the athlete may adopt their Strava profile value",403);
        data.weightSource = observation.source;
      }
      const merged = {...before, ...data};
      if (merged.maxHr && merged.lthr && merged.lthr > merged.maxHr) throw new ApiError("Threshold heart rate cannot exceed maximum heart rate");
      if (merged.restingHr && merged.maxHr && merged.restingHr >= merged.maxHr) throw new ApiError("Resting heart rate must be below maximum heart rate");
      const profile = await tx.athleteProfile.upsert({where: {userId: athlete.id}, create: {userId: athlete.id, ...data}, update: data});
      await tx.auditLog.create({data: {actorId, subjectId: athlete.id, action: "profile.update", entityId: profile.id,
        before: JSON.stringify(before), after: JSON.stringify(profile), note: typeof reason === "string" ? reason.slice(0,1000) : null}});
      if (setup) await tx.auditLog.create({ data: {
        actorId, subjectId: athlete.id, action: "profile.setup", entityId: profile.id,
        after: JSON.stringify(setup), note: travelOnly ? "Travel context only; existing planning confirmation and source preserved" : recordsProfileAnswers ? "Explicit experience/time answer markers only; existing planning confirmation and source preserved" : "Explicit setup with actor/source recorded; not device measurements or medical clearance",
      } });
      return profile;
    };
    return await (transaction ? apply(transaction) : prisma.$transaction(apply, {isolationLevel: "Serializable"}));
  } catch(e: any) {
    if (e.code === "P2034") throw new ApiError("Another edit was saved at the same time. Reload before saving again.", 409);
    throw e;
  }
}
