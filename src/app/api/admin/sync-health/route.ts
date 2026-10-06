import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { connectorHealth } from "@/lib/connector-health";
import { intervalsConnectorEnabled } from "@/lib/capabilities";

export const dynamic = "force-dynamic";

// GET /api/admin/sync-health — per-athlete connector health + data coverage
// Import freshness, not device delivery. Coverage is aggregated across sources;
// an old manual upload does not prove that a provider backfill completed.
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

  const now = Date.now();
  const intervalsEnabled = intervalsConnectorEnabled();
  const athletes = users.map((u) => {
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
      ...connectorHealth(u.connectors, now, intervalsEnabled),
    };
  });

  return NextResponse.json({
    healthScope: "import_freshness_not_device_delivery",
    coverageScope: "all_sources_not_provider_backfill_completion",
    populationScope: "users_with_connector_records_not_entire_roster",
    athletes,
    summary: {
      athletes: athletes.length,
      red: athletes.filter((a) => a.health === "red").length,
      amber: athletes.filter((a) => a.health === "amber").length,
      green: athletes.filter((a) => a.health === "green").length,
    },
  });
}
