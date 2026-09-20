import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ApiError, errorResponse } from "@/lib/access";

export const dynamic = "force-dynamic";

// GET /api/admin/assignments?athleteId=… — assignments for one athlete
//   (or every assignment when omitted), for the admin roster UI.
export async function GET(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) throw new ApiError("Sign in", 401);
    if (me.role !== "admin") throw new ApiError("Administrator access required", 403);
    const athleteId = new URL(req.url).searchParams.get("athleteId");
    const rows = await prisma.coachAssignment.findMany({
      where: athleteId ? { athleteId } : undefined,
      include: {
        coach: { select: { id: true, name: true, email: true, avatar: true } },
        athlete: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    // Candidate coaches for the assign dropdown (admins can coach anything;
    // coaches need explicit assignment).
    const coaches = await prisma.user.findMany({
      where: { role: { in: ["coach", "admin"] } },
      select: { id: true, name: true, email: true, role: true, avatar: true },
      orderBy: { name: "asc" },
      take: 100,
    });
    return Response.json({ rows, coaches });
  } catch (e) {
    return errorResponse(e);
  }
}

// POST /api/admin/assignments — { coachId, athleteId, action: "assign"|"revoke"|"restore" }
// Admin-only; every change audited. Revoking cuts the coach's access on the
// next request (all coach-gated reads check the assignment live).
export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) throw new ApiError("Sign in", 401);
    if (me.role !== "admin") throw new ApiError("Administrator access required", 403);
    const { coachId, athleteId, action } = await req.json();
    if (!coachId || !athleteId || !["assign", "revoke", "restore"].includes(action))
      throw new ApiError("coachId, athleteId and a valid action are required");
    const [coach, athlete] = await Promise.all([
      prisma.user.findUnique({ where: { id: coachId }, select: { id: true, role: true, name: true } }),
      prisma.user.findUnique({ where: { id: athleteId }, select: { id: true, name: true } }),
    ]);
    if (!coach || !athlete) throw new ApiError("Coach or athlete not found", 404);
    if (!["coach", "admin"].includes(coach.role))
      throw new ApiError("Target user is not a coach", 400);

    if (action === "assign") {
      const row = await prisma.coachAssignment.upsert({
        where: { coachId_athleteId: { coachId, athleteId } },
        create: { coachId, athleteId, status: "active", consent: "pending" },
        update: { status: "active" },
      });
      await prisma.auditLog.create({
        data: {
          actorId: me.id,
          subjectId: athleteId,
          action: "admin.assignCoach",
          entityId: row.id,
          after: JSON.stringify({ coachId, coachName: coach.name }),
        },
      });
      return Response.json({ ok: true, assignment: row });
    }
    const row = await prisma.coachAssignment.update({
      where: { coachId_athleteId: { coachId, athleteId } },
      data: { status: action === "revoke" ? "revoked" : "active" },
    });
    await prisma.auditLog.create({
      data: {
        actorId: me.id,
        subjectId: athleteId,
        action: action === "revoke" ? "admin.revokeCoach" : "admin.restoreCoach",
        entityId: row.id,
        before: JSON.stringify({ status: action === "revoke" ? "active" : "revoked" }),
        after: JSON.stringify({ status: action === "revoke" ? "revoked" : "active" }),
      },
    });
    return Response.json({ ok: true, assignment: row });
  } catch (e: any) {
    if (e?.code === "P2025") return errorResponse(new ApiError("No assignment to update", 404));
    return errorResponse(e);
  }
}
