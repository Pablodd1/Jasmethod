import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canCoach } from "@/lib/access";
import { dayBounds, addDaysKey, dateKey } from "@/lib/dates";

export const dynamic = "force-dynamic";

// GET /api/admin/inbox — the coach exception inbox (brief §G / F14):
// everything that needs a human today, across the coaches' assigned athletes
// (admin sees all). Alert kinds:
//   pain        — athlete reported new pain at the latest check-in
//   sick        — athlete reported illness
//   missed      — no check-in today (and it's past noon local)
//   sync_error  — a connected device is failing to sync
//   skipped     — sessions skipped without feedback
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canCoach(me))
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });

  // Scope: admin → all athletes; coach → active non-revoked assignments.
  const assignedIds = me.role === "coach"
    ? (
        await prisma.coachAssignment.findMany({
          where: { coachId: me.id, status: "active", consent: { not: "revoked" } },
          select: { athleteId: true },
        })
      ).map((a) => a.athleteId)
    : null;
  if (assignedIds && !assignedIds.length)
    return NextResponse.json({ alerts: [] });

  const athleteWhere = assignedIds ? { id: { in: assignedIds } } : undefined;
  const { start, end, key } = dayBounds(me.timezone);
  const yesterdayKey = addDaysKey(key, -1);

  const athletes = await prisma.user.findMany({
    where: athleteWhere,
    select: {
      id: true, name: true, email: true, avatar: true, timezone: true,
      profile: { select: { injured: true } },
      checkins: {
        where: { date: { gte: start, lt: end } },
        orderBy: { date: "desc" },
        take: 1,
        select: { answers: true, adaptation: true },
      },
      connectors: {
        where: { status: "error" },
        select: { provider: true, lastError: true, lastSyncAt: true },
      },
    },
  }).catch(() => []);

  const alerts: {
    kind: string; severity: "high" | "medium" | "low";
    athleteId: string; athlete: string; avatar: string;
    detail: string;
  }[] = [];

  for (const a of athletes) {
    const checkin = a.checkins[0];
    let answers: any = {};
    try { answers = JSON.parse(checkin?.answers || "{}"); } catch {}

    if (answers.newPain) {
      alerts.push({
        kind: "pain",
        severity: answers.painAffectsMovement ? "high" : "medium",
        athleteId: a.id,
        athlete: a.name,
        avatar: a.avatar,
        detail: `New pain${answers.painLocation ? ` — ${answers.painLocation}` : ""}${answers.painAffectsMovement ? " (affects movement)" : ""}`,
      });
    }
    if (answers.sick) {
      alerts.push({
        kind: "sick", severity: "high",
        athleteId: a.id, athlete: a.name, avatar: a.avatar,
        detail: "Reported sick or injured at today's check-in",
      });
    }
    if (!checkin) {
      alerts.push({
        kind: "missed", severity: "low",
        athleteId: a.id, athlete: a.name, avatar: a.avatar,
        detail: "No check-in today — readiness unknown",
      });
    }
    for (const c of a.connectors) {
      alerts.push({
        kind: "sync_error", severity: "medium",
        athleteId: a.id, athlete: a.name, avatar: a.avatar,
        detail: `${c.provider} sync failing: ${c.lastError || "unknown error"}`,
      });
    }
  }

  // Skipped-without-feedback sessions yesterday
  const skipped = await prisma.workout.findMany({
    where: {
      planned: true,
      feedbackStatus: "skipped",
      date: {
        gte: new Date(`${yesterdayKey}T00:00:00Z`),
        lt: new Date(`${key}T00:00:00Z`),
      },
      ...(assignedIds ? { userId: { in: assignedIds } } : {}),
    },
    select: { userId: true, title: true, user: { select: { name: true, avatar: true } } },
    take: 20,
  });
  for (const w of skipped) {
    alerts.push({
      kind: "skipped", severity: "low",
      athleteId: w.userId, athlete: w.user.name, avatar: w.user.avatar,
      detail: `Skipped: ${w.title} (yesterday)`,
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  alerts.sort((x, y) => order[x.severity] - order[y.severity]);

  return NextResponse.json({ alerts, generatedAt: new Date().toISOString() });
}
