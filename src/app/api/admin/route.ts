export const dynamic = "force-dynamic";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canCoach, ApiError, errorResponse } from "@/lib/access";
import { ACTIVITY_EVIDENCE_SELECT, groupActivityEvidence } from "@/lib/activity-evidence";
import { readActivityDecisions } from "@/lib/activity-reconciliation";
import { derivedActivityPolicy } from "@/lib/derived-activity-policy";

export async function GET(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) throw new ApiError("Sign in", 401);
    if (!canCoach(me)) throw new ApiError("Administrator access required", 403);
    const url = new URL(req.url),
      q = (url.searchParams.get("q") || "").slice(0, 100);
    const page = Math.max(
      1,
      Math.floor(Number(url.searchParams.get("page")) || 1),
    );
    // SCOPING: a coach's roster is their ACTIVE assignments; admins see all.
    const assignedIds = me.role === "coach"
      ? (
          await prisma.coachAssignment.findMany({
            where: { coachId: me.id, status: "active", consent: "granted" },
            select: { athleteId: true },
          })
        ).map((a) => a.athleteId)
      : null;
    const where = q
      ? {
          ...(assignedIds ? { id: { in: assignedIds } } : {}),
          OR: [
            { name: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : assignedIds
        ? { id: { in: assignedIds } }
        : {};
    const [count, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip: (page - 1) * 30,
        take: 30,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          avatar: true,
          timezone:true,
          profile: true,
          connectors: {
            select: {
              provider: true,
              status: true,
              lastError: true,
              lastSyncAt: true,
            },
          },
          checkins: {
            orderBy: { date: "desc" },
            take: 1,
            select: { date: true, adaptation: true },
          },
          workouts: {
            where: {
              OR: [{ completed: true }, { feedbackStatus: { in: ["completed", "partial", "substituted"] } }],
              AND: [{ OR: [{ feedbackStatus: null }, { feedbackStatus: { not: "skipped" } }] }],
              date: {
                gte: new Date(Date.now() - 30 * 86400000),
                lte: new Date(),
              },
            },
            select: ACTIVITY_EVIDENCE_SELECT,
          },
        },
      }),
    ]);
    const rows = await Promise.all(users.map(async (u) => {
      const policy = derivedActivityPolicy(u.workouts);
      const grouped = policy.status === "allowed"
        ? groupActivityEvidence(u.workouts, u.workouts.length ? await readActivityDecisions(u.id) : [])
        : null;
      const workouts = grouped && !grouped.unresolvedGroups ? grouped.groups : null;
      const last = workouts?.reduce((date, group) => group.primary.date > date ? group.primary.date : date, new Date(0));
      const completeMinutes = workouts?.every(group => group.budgetMinutes !== null);
      const completeEffort = workouts?.every(({primary}) => typeof primary.rpe === "number" && primary.rpe >= 0 && primary.rpe <= 10);
      let verdict = null;
      try {
        verdict =
          JSON.parse(u.checkins[0]?.adaptation || "null")?.verdict || null;
      } catch {}
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        avatar: u.avatar,
        goal: u.profile?.goal,
        experience: u.profile?.experience,
        ftp: u.profile?.ftp,
        workouts30: workouts?.length ?? null,
        minutes30: completeMinutes && workouts ? workouts.reduce((sum, group) => sum + group.budgetMinutes!, 0) : null,
        reportedLoad30: completeMinutes && completeEffort && workouts
          ? workouts.reduce((sum, group) => sum + group.budgetMinutes! * group.primary.rpe!, 0)
          : null,
        lastWorkoutDays: last?.getTime()
          ? Math.floor((Date.now() - last.getTime()) / 86400000)
          : null,
        lastCheckin: u.checkins[0]?.date,
        verdict,
        connectors: u.connectors,
      };
    }));
    return Response.json({ rows, page, pages: Math.ceil(count / 30), count });
  } catch (e) {
    return errorResponse(e);
  }
}
