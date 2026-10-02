import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser, hashPassword } from "@/lib/auth";
import { ApiError, errorResponse } from "@/lib/access";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

// GET /api/admin/coaches — the coach roster with live load + alert counts
// (admin pillar: create/overview/deactivate coaches, any sport).
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin")
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  const coaches = await prisma.user.findMany({
    where: { role: { in: ["coach", "admin"] } },
    select: {
      id: true, name: true, email: true, avatar: true, role: true,
      createdAt: true,
      coaching: {
        where: { status: "active" },
        select: { athleteId: true },
      },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    coaches: coaches.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      avatar: c.avatar,
      role: c.role,
      since: c.createdAt,
      athleteCount: c.coaching.length,
      athleteIds: c.coaching.map((a) => a.athleteId),
    })),
  });
}

// POST /api/admin/coaches — create a coach account.
// { name, email, tempPassword } — the coach changes the password after first
// sign-in (password change surface is Settings; forced rotation is future).
// Audited. Admin-only.
export async function POST(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) throw new ApiError("Sign in", 401);
    if (me.role !== "admin")
      throw new ApiError("Administrator access required", 403);
    const { name, email, tempPassword } = await req.json();
    const normalized = String(email || "").toLowerCase().trim();
    if (!name || !normalized || !tempPassword)
      throw new ApiError("name, email and tempPassword are required");
    if (String(tempPassword).length < 8)
      throw new ApiError("Temporary password must be at least 8 characters");
    // Reserved addresses can never be coach-provisioned (admin bootstrap only).
    const { isAdminEmail } = await import("@/lib/admin");
    if (isAdminEmail(normalized))
      throw new ApiError("This email is reserved", 403);
    const exists = await prisma.user.findUnique({ where: { email: normalized } });
    if (exists) throw new ApiError("An account with this email already exists", 409);
    const coach = await prisma.user.create({
      data: {
        email: normalized,
        name: String(name).trim(),
        passwordHash: hashPassword(String(tempPassword)),
        role: "coach",
        profile: { create: {} },
        motivation: { create: {} },
      },
      select: { id: true, name: true, email: true, role: true },
    });
    await prisma.auditLog.create({
      data: {
        actorId: me.id,
        subjectId: coach.id,
        action: "admin.createCoach",
        entityId: coach.id,
        after: JSON.stringify({ email: coach.email, name: coach.name }),
      },
    });
    return NextResponse.json({ ok: true, coach });
  } catch (e) {
    return errorResponse(e);
  }
}

// PATCH /api/admin/coaches — { coachId, action: "deactivate" | "reactivate" }
// Deactivation demotes to athlete AND revokes every assignment (access ends
// everywhere at once). Reactivation restores the coach role; assignments are
// re-added manually (deliberate re-grant). Audited.
export async function PATCH(req: Request) {
  try {
    const me = await getCurrentUser();
    if (!me) throw new ApiError("Sign in", 401);
    if (me.role !== "admin")
      throw new ApiError("Administrator access required", 403);
    const { coachId, action } = await req.json();
    if (!coachId || !["deactivate", "reactivate"].includes(action))
      throw new ApiError("coachId and a valid action are required");
    const coach = await prisma.user.findUnique({ where: { id: coachId } });
    if (!coach) throw new ApiError("Coach not found", 404);
    // NOTE: admin-target deactivation is allowed while another admin remains
    // (last-admin guard lives in the deactivate branch below).

    if (action === "deactivate") {
      // Safety: never demote the LAST active admin — an admin may deactivate
      // themselves only while another admin remains.
      if (coach.role === "admin") {
        const adminCount = await prisma.user.count({ where: { role: "admin" } });
        if (adminCount <= 1)
          throw new ApiError("Cannot demote the last administrator", 400);
      }
      await prisma.$transaction([
        prisma.coachAssignment.updateMany({
          where: { coachId, status: "active" },
          data: { status: "revoked" },
        }),
        prisma.user.update({ where: { id: coachId }, data: { role: "athlete" } }),
        prisma.auditLog.create({
          data: {
            actorId: me.id,
            subjectId: coachId,
            action: "admin.deactivateCoach",
            after: JSON.stringify({ role: "athlete", assignments: "revoked" }),
          },
        }),
      ]);
      return NextResponse.json({ ok: true, deactivated: true });
    }
    await prisma.$transaction([
      prisma.user.update({ where: { id: coachId }, data: { role: "coach" } }),
      prisma.auditLog.create({
        data: {
          actorId: me.id,
          subjectId: coachId,
          action: "admin.reactivateCoach",
          after: JSON.stringify({ role: "coach" }),
        },
      }),
    ]);
    return NextResponse.json({ ok: true, reactivated: true });
  } catch (e) {
    return errorResponse(e);
  }
}
