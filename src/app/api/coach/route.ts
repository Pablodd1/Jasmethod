import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hrvReadiness } from "@/lib/science";
import { getCoachBriefing } from "@/lib/coach";

// GET /api/coach — gathers the athlete's day and asks ox-alpha for a briefing
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.athleteProfile.findUnique({ where: { userId: user.id } });
  const [metrics, plans, blood, dna, todayWorkouts] = await Promise.all([
    prisma.dailyMetrics.findMany({ where: { userId: user.id }, orderBy: { date: "asc" }, take: 14 }),
    prisma.trainingPlan.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 1 }),
    prisma.bloodResult.findMany({ where: { panel: { user: { id: user.id } } } }),
    prisma.geneticVariant.findMany({ where: { dnaResult: { user: { id: user.id } } } }),
    prisma.workout.findMany({ where: { userId: user.id, date: { gte: new Date(new Date().toISOString().slice(0, 10)) } }, take: 3 }),
  ]);

  // Readiness from last 7 HRV
  let readiness: { score: number; advice: string } | null = null;
  const withHrv = metrics.filter((m) => m.hrv).slice(-7);
  if (withHrv.length >= 3) {
    const latest = withHrv[withHrv.length - 1];
    const baseline = withHrv.slice(0, -1).map((m) => m.hrv!);
    const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    const sd = Math.sqrt(baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / baseline.length);
    const r = hrvReadiness(latest.hrv!, baseline, sd);
    readiness = { score: r.score, advice: r.advice };
  }

  // Blood flags: any value outside reference
  const bloodFlags: string[] = [];
  for (const b of blood) {
    if (b.refLow != null && b.value < b.refLow) bloodFlags.push(`${b.marker} low (${b.value}${b.unit || ""})`);
    if (b.refHigh != null && b.value > b.refHigh) bloodFlags.push(`${b.marker} high (${b.value}${b.unit || ""})`);
  }

  // DNA: only beneficial/caution highlights
  const dnaHighlights: string[] = [];
  for (const v of dna) {
    if (v.trait && v.impact) dnaHighlights.push(`${v.gene || v.trait}: ${v.impact}`);
  }

  const briefing = getCoachBriefing(user.id, {
    name: user.name,
    profile,
    zones: null,
    readiness,
    latestMetric: withHrv[withHrv.length - 1] || null,
    todaySession: todayWorkouts[0] || null,
    planName: plans[0]?.name || null,
    bloodFlags,
    dnaHighlights: dnaHighlights.slice(0, 4),
    language: user.language,
  });

  return NextResponse.json({ briefing, cached: briefing.mode === "fallback" ? false : true });
}
