import { createHash } from "node:crypto";
import { trainingAccess, errorResponse, ApiError } from "@/lib/access";
import { prisma } from "@/lib/db";
import { addDaysKey, dateKey, dayBounds, localDate } from "@/lib/dates";
import {
  buildProtocol,
  getProtocol,
  PROTOCOL_VERSION,
  TRAINING_PROTOCOLS,
  PROTOCOL_SOURCES,
  PROTOCOL_RULES,
} from "@/lib/protocols";
import { reviewProtocolSchedule } from "@/lib/protocol-scheduling";
import { reviewProtocolAthlete } from "@/lib/protocol-eligibility";
import { prescribeToday } from "@/lib/adaptive";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { athlete } = await trainingAccess(req);
    const today = dayBounds(athlete.timezone);
    const sessions = await prisma.workout.findMany({
      where: {
        userId: athlete.id,
        planned: true,
        completed: false,
        feedbackStatus: null,
        matchedPlanId: null,
        date: {
          gte: today.start,
          lt: localDate(addDaysKey(today.key, 56), athlete.timezone),
        },
        planDay: { dayOff: false, plan: { status: "active" } },
      },
      select: {
        id: true,
        date: true,
        title: true,
        sport: true,
        durationMin: true,
        intensity: true,
        originalPlan: true,
      },
      orderBy: { date: "asc" },
      take: 400,
    });
    return Response.json({
      version: PROTOCOL_VERSION,
      protocols: TRAINING_PROTOCOLS,
      sources: PROTOCOL_SOURCES,
      rules: PROTOCOL_RULES,
      athlete: {
        id: athlete.id,
        name: athlete.name,
        timezone: athlete.timezone,
        experience: athlete.profile?.experience || "beginner",
        goal: athlete.profile?.goal,
        injured: athlete.profile?.injured || false,
      },
      sessions: sessions.map((s) => ({
        ...s,
        originalPlan: undefined,
        date: dateKey(s.date, athlete.timezone),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const { athlete, actor } = await trainingAccess(req);
    const body = await req.json();
    if (
      !["preview", "apply"].includes(body.mode) ||
      typeof body.sessionId !== "string" ||
      typeof body.protocolId !== "string"
    )
      throw new ApiError("Select a protocol and upcoming session.");
    const protocol = getProtocol(body.protocolId);
    if (!protocol) throw new ApiError("Protocol not found.");
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${athlete.id}))`;
        const profile = await tx.athleteProfile.findUnique({
          where: { userId: athlete.id },
        });
        const w = await tx.workout.findFirst({
          where: { id: body.sessionId, userId: athlete.id },
          include: { planDay: { include: { plan: true } } },
        });
        if (!w) throw new ApiError("Session not found.", 404);
        const eligibility = reviewProtocolAthlete({ protocolId: protocol.id, ...profile });
        if (eligibility.status !== "eligible")
          throw new ApiError(eligibility.reasons.map(r => r.message).join(" "));

        if (
          !w.planned ||
          w.completed ||
          w.feedbackStatus ||
          w.matchedPlanId ||
          w.date < dayBounds(athlete.timezone).start ||
          !w.planDay ||
          w.planDay.dayOff ||
          w.planDay.plan.status !== "active"
        )
          throw new ApiError(
            "Choose an unfinished upcoming session in the active plan, outside a day off.",
          );
        if (!protocol.sports.includes(w.sport as any))
          throw new ApiError(
            `This protocol supports ${protocol.sports.join(", ")}. Select a matching session.`,
          );
        const spec = {
          id: protocol.id,
          sport: w.sport as any,
          level: profile?.experience || "beginner",
          minutes: w.durationMin,
          version: PROTOCOL_VERSION,
        };
        let raw;
        try {
          raw = buildProtocol(spec);
        } catch (e) {
          throw new ApiError((e as Error).message);
        }
        const base = {
          title: raw.title,
          sport: raw.sport,
          type: raw.type,
          intensity: raw.intensity,
          durationMin: raw.durationMin,
          description: `${protocol.purpose} ${protocol.dose} ${protocol.progression} ${protocol.stop}`,
          startTime: w.startTime,
          protocol: { ...spec, minutes: raw.durationMin },
        };
        const { key, start, end } = dayBounds(athlete.timezone, w.date);
        const [nearby, race, checkin] = await Promise.all([
          tx.workout.findMany({
            where: {
              userId: athlete.id,
              id: { not: w.id },
              date: {
                gte: localDate(addDaysKey(key, -7), athlete.timezone),
                lt: localDate(addDaysKey(key, 8), athlete.timezone),
              },
              matchedPlanId: null,
              durationMin: { gt: 0 },
              AND: [
                {
                  OR: [
                    { feedbackStatus: null },
                    { feedbackStatus: { not: "skipped" } },
                  ],
                },
              ],
              OR: [
                { completed: true },
                {
                  planned: true,
                  planDay: { dayOff: false, plan: { status: "active" } },
                },
              ],
            },
          }),
          tx.race.findFirst({
            where: { userId: athlete.id, date: { gte: start } },
            orderBy: { date: "asc" },
          }),
          tx.dailyCheckin.findFirst({
            where: { userId: athlete.id, date: { gte: start, lt: end } },
            orderBy: { date: "desc" },
          }),
        ]);
        let adaptation = {
          verdict: "full",
          durationFactor: 1,
          intensityCap: "z7",
        };
        if (checkin) {
          try {
            adaptation = {
              ...adaptation,
              ...JSON.parse(checkin.adaptation || "{}"),
            };
          } catch {}
        }
        const prescription = prescribeToday({
          session: base,
          adaptation,
          profile,
        });
        if (!checkin) {
          prescription.verdict = "planned";
          prescription.scaled.reason =
            "Planned dose fitted to the available time. Complete the check-in on this training day to assess recovery.";
        }
        const review = reviewProtocolSchedule({
          selected: w,
          candidate: { ...w, ...prescription },
          nearby,
          timezone: athlete.timezone,
          level: spec.level,
          protocolId: spec.id,
          nextRace: race?.date,
        });
        if (!prescription.protocol)
          review.blocks.push(
            "The current check-in pauses this protocol. Choose another day or reassess recovery.",
          );
        const previewToken = createHash("sha256")
          .update(JSON.stringify({ w, profile, prescription, review, checkin, nearby, race, eligibility }))
          .digest("hex");
        if (body.mode === "preview")
          return {
            preview: prescription,
            eligibility,
            ...review,
            previewToken,
            session: {
              id: w.id,
              title: w.title,
              date: key,
              minutes: w.durationMin,
            },
            athlete: { id: athlete.id, name: athlete.name },
          };
        if (body.previewToken !== previewToken)
          throw new ApiError(
            "The session or recovery information changed. Preview it again before applying.",
            409,
          );
        if (review.blocks.length) throw new ApiError(review.blocks.join(" "));
        const updated = await tx.workout.update({
          where: { id: w.id },
          data: {
            title: prescription.title,
            sport: prescription.sport,
            type: prescription.type,
            intensity: prescription.intensity,
            durationMin: prescription.durationMin,
            notes: prescription.detail.main,
            originalPlan: JSON.stringify(base),
            prescription: JSON.stringify(prescription),
            approved: false,
            regenCount: 0,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.id,
            subjectId: athlete.id,
            action: "workout.protocol",
            entityId: w.id,
            before: JSON.stringify(w),
            after: JSON.stringify(updated),
            note: `${protocol.id}; evidence version ${PROTOCOL_VERSION}`,
          },
        });
        return {
          ok: true,
          sessionId: w.id,
          athleteId: athlete.id,
          message: `${protocol.title} saved for ${athlete.name} on ${key}.`,
        };
      },
      { timeout: 15000 },
    );
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
