import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { hrvReadiness } from "@/lib/science";
import { getCoachBriefing } from "@/lib/coach";

// GET /api/coach — gathers the athlete's day and asks JASAI for a briefing
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await prisma.athleteProfile.findUnique({ where: { userId: user.id } });
  const [metrics, plans, blood, dna, todayWorkouts, checkins7, workouts4w, benchmarks] = await Promise.all([
    prisma.dailyMetrics.findMany({ where: { userId: user.id }, orderBy: { date: "asc" }, take: 14 }),
    prisma.trainingPlan.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 1 }),
    prisma.bloodResult.findMany({ where: { panel: { user: { id: user.id } } } }),
    prisma.geneticVariant.findMany({ where: { dnaResult: { user: { id: user.id } } } }),
    prisma.workout.findMany({ where: { userId: user.id, date: { gte: new Date(new Date().toISOString().slice(0, 10)) } }, take: 3 }),
    // Long-term memory: last 7 check-ins, 4 weeks of training, benchmark history
    prisma.dailyCheckin.findMany({ where: { userId: user.id }, orderBy: { date: "desc" }, take: 7 }),
    prisma.workout.findMany({ where: { userId: user.id, date: { gte: new Date(Date.now() - 28 * 86400000) } }, orderBy: { date: "asc" } }),
    prisma.benchmarkTest.findMany({ where: { userId: user.id, completed: true }, orderBy: { date: "asc" } }),
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

  // ---- History digest (the coach's long-term memory) ----
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const checkinTrend = checkins7
    .slice()
    .reverse()
    .map((c) => {
      try {
        const a = JSON.parse(c.answers || "{}");
        return `${days[new Date(c.date).getDay()]} sleep${a.sleep ?? "?"} sore${a.soreness ?? "?"} energy${a.energy ?? "?"} stress${a.stress ?? "?"}${a.sick ? " SICK" : ""}`;
      } catch { return null; }
    })
    .filter(Boolean);
  let lastVerdict = "";
  if (checkins7[0]) {
    try { lastVerdict = JSON.parse(checkins7[0].adaptation || "{}").verdict || ""; } catch {}
  }
  // 4-week completed load per calendar week (Mon-anchored).
  const weekBuckets = new Map<string, { minutes: number; sessions: number }>();
  for (const w of workouts4w) {
    if (!w.completed) continue;
    const d = new Date(w.date);
    const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    const b = weekBuckets.get(key) || { minutes: 0, sessions: 0 };
    b.minutes += w.durationMin; b.sessions += 1;
    weekBuckets.set(key, b);
  }
  const loadTrend = Array.from(weekBuckets.entries()).sort().map(([wk, b]) => `wk${wk.slice(5)}: ${b.sessions} sessions/${Math.round(b.minutes / 60)}h`);
  const planned4w = workouts4w.filter((w) => w.planned).length;
  const done4w = workouts4w.filter((w) => w.completed).length;
  const adherence = planned4w > 0 ? Math.round((done4w / planned4w) * 100) : null;
  // Benchmark progression per test type (first -> latest, direction-aware).
  const byType = new Map<string, number[]>();
  for (const b of benchmarks) { if (b.result != null) { const arr = byType.get(b.type) || []; arr.push(b.result); byType.set(b.type, arr); } }
  const lowerIsBetter = ["run5k", "swim", "run1k"];
  const benchLine = Array.from(byType.entries()).map(([t, arr]) => {
    if (arr.length < 2) return `${t}: ${arr[0]}`;
    const first = arr[0], last = arr[arr.length - 1];
    const improving = lowerIsBetter.includes(t) ? last < first : last > first;
    return `${t}: ${first}->${last}${first !== last ? (improving ? " (improving)" : " (declining)") : ""}`;
  }).join("; ");

  const historyDigest = [
    checkinTrend.length ? `Last check-ins (older to new): ${checkinTrend.join(" | ")}` : null,
    lastVerdict ? `Previous adaptation verdict: ${lastVerdict}` : null,
    loadTrend.length ? `Completed training by week: ${loadTrend.join(", ")}` : null,
    adherence != null ? `Plan adherence last 4 weeks: ${adherence}% (${done4w}/${planned4w} sessions)` : null,
    benchLine ? `Benchmarks first to latest: ${benchLine}` : null,
    profile?.injured ? "PROFILE FLAG: currently injured" : null,
  ].filter(Boolean).join("\n");

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
    historyDigest,
  });

  return NextResponse.json({ briefing, cached: briefing.mode === "fallback" ? false : true });
}
