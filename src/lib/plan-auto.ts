// JasMiamiMethod — Starter plan auto-generation
//
// Guarantees: once onboarding is saved (fully OR partially — whatever the
// athlete filled), a real training plan for the selected sport exists. No
// waiting for race dates, cycle details or baselines: sensible defaults cover
// the gaps, and the athlete regenerates a tuned plan from /training whenever
// their data improves.

import { prisma } from "./db";
import { generatePlan, generateSingleSport, generateBoxingCamp, generateHyroxPlan, generateTrackSprint, type PlanSession } from "./science";
import { dayBounds, dateKey, addDaysKey, localDate, parseDate } from "./dates";
import { recoveryFor } from "./adaptive";

const VALID_GOALS = [
  "sprint", "olympic", "half", "full", "hyrox", "boxing",
  "track-sprint", "cycle", "run-only", "swim-only", "lifting",
];

// Pure input selection — testable without a database.
export function starterPlanInputs(profile: {
  goal?: string | null;
  experience?: string | null;
  weeklyHours?: number | null;
  raceDate?: Date | null;
} | null): {
  distance: string;
  level: string;
  weeks: number;
  hasRace: boolean;
} {
  const distance = VALID_GOALS.includes(profile?.goal || "")
    ? (profile!.goal as string)
    : "olympic"; // the wizard's default sport — never "nothing"
  const level =
    profile?.experience === "pro" ||
    profile?.experience === "advanced" ||
    profile?.experience === "amateur" ||
    profile?.experience === "beginner"
      ? profile!.experience!
      : "beginner";
  const hasRace = Boolean(
    profile?.raceDate && profile.raceDate.getTime() > Date.now(),
  );
  return { distance, level, weeks: 12, hasRace };
}

/**
 * Create a starter plan for the athlete if (and only if) they have no active
 * plan. Returns the plan id (existing or new). Safe to call from any flow —
 * it never duplicates or archives an existing program.
 */
export async function autoGenerateStarterPlan(
  userId: string,
): Promise<{ planId: string; distance: string; created: boolean }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
  });
  if (!user) throw new Error("user not found");

  const existing = await prisma.trainingPlan.findFirst({
    where: { userId, status: "active" },
    orderBy: { createdAt: "desc" },
    select: { id: true, distance: true },
  });
  if (existing)
    return { planId: existing.id, distance: existing.distance, created: false };

  const profile = user.profile;
  const { distance, level, weeks, hasRace } = starterPlanInputs(profile);
  const start = dayBounds(user.timezone).start;
  const race = profile?.raceDate && profile.raceDate > start
    ? profile.raceDate
    : new Date(start.getTime() + weeks * 7 * 86400000);

  const generated =
    distance === "track-sprint"
      ? generateTrackSprint({ level, event: "400m", weeks, startDate: start })
      : distance === "boxing"
        ? generateBoxingCamp({
            level, weeks, startDate: start,
            weeklyHours: profile?.weeklyHours || undefined,
          })
        : distance === "hyrox"
          ? generateHyroxPlan({
              level, weeks, startDate: start,
              weeklyHours: profile?.weeklyHours || undefined,
            })
          : ["cycle", "run-only", "swim-only", "lifting"].includes(distance)
            ? generateSingleSport({
                sport:
                  distance === "cycle" ? "bike"
                  : distance === "swim-only" ? "swim"
                  : distance === "lifting" ? "strength"
                  : "run",
                level, weeks, startDate: start,
                weeklyHours: profile?.weeklyHours || undefined,
                hasRace,
              })
            : generatePlan({
                level, distance, weeks, startDate: start,
                weeklyHours: profile?.weeklyHours || undefined,
                raceDate: hasRace ? race : undefined,
              });

  const plan = await prisma.$transaction(
    async (tx) => {
      // Same day-slot grouping as /api/plan/generate: sessions sharing a slot
      // join ONE PlanDay so dates never duplicate.
      const created = await tx.trainingPlan.create({
        data: {
          userId: user.id,
          name: `Starter ${distance} ${weeks}-week plan (${level})`,
          level,
          distance,
          weeks,
          startDate: start,
          raceDate: race,
          days: {
            create: generated.flatMap((week, wi) => {
              const bySlot = new Map<number, PlanSession[]>();
              week.sessions.forEach((s, si) => {
                const slot = si % 7;
                if (!bySlot.has(slot)) bySlot.set(slot, []);
                bySlot.get(slot)!.push(s);
              });
              return Array.from(bySlot.entries()).map(([slot, slotSessions]) => {
                const date = localDate(
                  addDaysKey(dateKey(start, user.timezone), wi * 7 + slot),
                  user.timezone,
                );
                return {
                  date,
                  week: week.week,
                  dayOfWeek: new Date(
                    dateKey(date, user.timezone) + "T12:00Z",
                  ).getUTCDay(),
                  focus: slotSessions[0].sport,
                  notes: slotSessions[0].description,
                  sessions: {
                    create: slotSessions.map((s) => ({
                      userId: user.id,
                      date,
                      sport: s.sport,
                      title: s.title,
                      type: s.type,
                      durationMin: s.minutes,
                      intensity: s.zone,
                      notes: s.description,
                      planned: true,
                      completed: false,
                      source: "plan",
                      recovery: recoveryFor(date).cooldownNote,
                    })),
                  },
                };
              });
            }),
          },
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          subjectId: user.id,
          action: "plan.autoStarter",
          entityId: created.id,
          after: JSON.stringify({ distance, level, weeks, name: "starter" }),
          note: "Auto-generated after onboarding (defaults where data was missing)",
        },
      });
      return created;
    },
    { timeout: 30000 },
  );
  return { planId: plan.id, distance, created: true };
}

// parseDate is re-exported for callers that pass explicit dates.
export { parseDate };
