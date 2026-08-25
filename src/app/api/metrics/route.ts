import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hrvReadiness } from "@/lib/science";

// GET /api/metrics?days=30 — daily metrics (HRV, RHR, sleep, readiness) + readiness advice
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const days = Math.min(90, parseInt(url.searchParams.get("days") || "30", 10));
  const since = new Date(Date.now() - days * 86400000);

  const [metrics, sleep] = await Promise.all([
    prisma.dailyMetrics.findMany({ where: { userId: user.id, date: { gte: since } }, orderBy: { date: "asc" } }),
    prisma.sleepRecord.findMany({ where: { userId: user.id, date: { gte: since } }, orderBy: { date: "asc" } }),
  ]);

  // Readiness advice based on last 7 days HRV
  const last7 = metrics.filter((m) => m.hrv).slice(-7);
  const latest = last7[last7.length - 1];
  let readiness: { score: number; advice: string; deltaPct: number } | null = null;
  if (latest?.hrv && last7.length >= 3) {
    const baseline = last7.slice(0, -1).map((m) => m.hrv!);
    const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    const sd = Math.sqrt(baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / baseline.length);
    readiness = hrvReadiness(latest.hrv, baseline, sd);
  }

  return NextResponse.json({ metrics, sleep, readiness, count: metrics.length });
}

// POST /api/metrics — log today's metrics (manual or device-synced)
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const date = body.date ? new Date(body.date) : new Date();
    const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
    const data: Record<string, any> = {};
    for (const k of ["hrv", "restingHr", "sleepScore", "recoveryScore", "stressScore", "energy", "rhr", "weightKg", "bodyFat", "sleepHours", "source"]) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    const existing = await prisma.dailyMetrics.findUnique({ where: { date: dayStart } });
    const metric = existing
      ? await prisma.dailyMetrics.update({ where: { id: existing.id }, data })
      : await prisma.dailyMetrics.create({ data: { userId: user.id, date: dayStart, ...data } });
    return NextResponse.json({ ok: true, metric });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
