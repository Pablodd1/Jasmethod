import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/admin/sync-health — per-athlete connector health + data coverage
// (the ops answer to "is everyone syncing?"). Coverage shows the earliest
// data we hold per source so an incomplete backfill is visible, not hidden.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (me.role !== "admin")
    return NextResponse.json({ error: "Administrator access required" }, { status: 403 });

  const [users, acts, mets] = await Promise.all([
    prisma.user.findMany({
      where: { connectors: { some: {} } },
      select: {
        id: true, name: true, email: true,
        connectors: {
          select: {
            provider: true, status: true, lastSyncAt: true,
            lastSyncCount: true, lastError: true, syncStartedAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workout.groupBy({
      by: ["userId"],
      where: { planned: false, completed: true },
      _min: { date: true },
    }),
    prisma.dailyMetrics.groupBy({ by: ["userId"], _min: { date: true } }),
  ]);

  const actsBy = new Map(acts.map((a) => [a.userId, a._min.date]));
  const metsBy = new Map(mets.map((m) => [m.userId, m._min.date]));
  const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

  const athletes = users.map((u) => {
    const failing = u.connectors.filter((c) => c.status === "error");
    const stale = u.connectors.filter(
      (c) =>
        c.status === "connected" &&
        c.lastSyncAt &&
        Date.now() - new Date(c.lastSyncAt).getTime() > 26 * 3600000,
    );
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      connectors: u.connectors.map((c) => ({
        ...c,
        lastSyncAt: iso(c.lastSyncAt),
        syncStartedAt: iso(c.syncStartedAt),
      })),
      coverage: {
        earliestActivity: iso(actsBy.get(u.id) ?? null),
        earliestMetric: iso(metsBy.get(u.id) ?? null),
      },
      health: failing.length ? "red" : stale.length ? "amber" : "green",
    };
  });

  return NextResponse.json({
    athletes,
    summary: {
      athletes: athletes.length,
      red: athletes.filter((a) => a.health === "red").length,
      amber: athletes.filter((a) => a.health === "amber").length,
      green: athletes.filter((a) => a.health === "green").length,
    },
  });
}
