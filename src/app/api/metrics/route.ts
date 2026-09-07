export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { dayBounds, parseDate } from "@/lib/dates";
import { errorResponse, ApiError, trainingAccess } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { hrvReadiness } from "@/lib/science";

// GET /api/metrics?days=30 — daily metrics (HRV, RHR, sleep, readiness) + readiness advice
export async function GET(req: Request) {
  let user, actor;
  try {
    const access = await trainingAccess(req);
    user = access.athlete;
    actor = access.actor;
  } catch (e) {
    return errorResponse(e);
  }
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const days = Math.max(
    1,
    Math.min(90, parseInt(url.searchParams.get("days") || "30", 10) || 30),
  );
  const since = new Date(Date.now() - days * 86400000);

  const [metrics, sleep] = await Promise.all([
    prisma.dailyMetrics.findMany({
      where: { userId: user.id, date: { gte: since } },
      orderBy: { date: "asc" },
    }),
    prisma.sleepRecord.findMany({
      where: { userId: user.id, date: { gte: since } },
      orderBy: { date: "asc" },
    }),
  ]);

  // Readiness advice based on last 7 days HRV
  const kind = metrics.filter((m) => m.hrv).at(-1)?.hrvType || "rmssd";
  const last7 = metrics
    .filter((m) => m.hrv && (m.hrvType || "rmssd") === kind)
    .slice(-7);
  const latest = last7[last7.length - 1];
  let readiness: { score: number; advice: string; deltaPct: number } | null =
    null;
  if (latest?.hrv && last7.length >= 3) {
    const baseline = last7.slice(0, -1).map((m) => m.hrv!);
    const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    const sd = Math.sqrt(
      baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / baseline.length,
    );
    readiness = hrvReadiness(latest.hrv, baseline, sd);
  }

  return NextResponse.json({
    metrics,
    sleep,
    readiness,
    count: metrics.length,
  });
}

// POST /api/metrics — log today's metrics (manual or device-synced)
export async function POST(req: Request) {
  let user, actor;
  try {
    const access = await trainingAccess(req);
    user = access.athlete;
    actor = access.actor;
  } catch (e) {
    return errorResponse(e);
  }
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const dayStart = body.date
      ? dayBounds(user.timezone, parseDate(body.date, user.timezone)).start
      : dayBounds(user.timezone).start;
    const data: Record<string, any> = {};
    for (const k of [
      "hrv",
      "restingHr",
      "sleepScore",
      "recoveryScore",
      "stressScore",
      "energy",
      "weightKg",
      "bodyFat",
      "sleepHours",
      "source",
    ]) {
      if (body[k] !== undefined && body[k] !== "" && body[k] !== null) {
        if (k === "source") {
          data.source = "manual";
          continue;
        }
        const n = Number(body[k]),
          max = (
            {
              hrv: 300,
              restingHr: 150,
              sleepScore: 100,
              recoveryScore: 100,
              stressScore: 100,
              energy: 5,
              weightKg: 350,
              bodyFat: 75,
              sleepHours: 24,
            } as any
          )[k];
        if (!Number.isFinite(n) || n < 0 || n > max)
          throw new ApiError(`Invalid ${k}`);
        data[k] = n;
      }
    }
    if (data.hrv !== undefined) data.hrvType = "rmssd";
    const existing = await prisma.dailyMetrics.findUnique({
      where: { userId_date: { userId: user.id, date: dayStart } },
    });
    const metric = existing
      ? await prisma.dailyMetrics.update({ where: { id: existing.id }, data })
      : await prisma.dailyMetrics.create({
          data: { userId: user.id, date: dayStart, ...data },
        });
    await prisma.auditLog.create({
      data: {
        actorId: actor.id,
        subjectId: user.id,
        action: "metrics.update",
        entityId: metric.id,
        before: JSON.stringify(existing),
        after: JSON.stringify(metric),
      },
    });
    return NextResponse.json({ ok: true, metric });
  } catch (e: any) {
    return errorResponse(e);
  }
}
