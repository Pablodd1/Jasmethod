import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { currentHrvReadiness } from "@/lib/coach-readiness";
import { dayBounds, addDaysKey, dateKey } from "@/lib/dates";
import { prescribeToday } from "@/lib/adaptive";
import { baseWorkout } from "@/lib/prescription";
import { getCoachBriefing } from "@/lib/coach";

// GET /api/coach — gathers the athlete's day and asks JASAI for a briefing
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date(), { start, end } = dayBounds(user.timezone, now);

  const profile = await prisma.athleteProfile.findUnique({ where: { userId: user.id } });
  const [metrics, plans, blood, dna, todayWorkouts, checkins7, workouts4w, benchmarks] = await Promise.all([
    prisma.dailyMetrics.findMany({ where: { userId: user.id, date: { gte: new Date(+now - 28 * 86400000), lt: end } }, orderBy: { date: "desc" }, take: 28 }),
    prisma.trainingPlan.findMany({ where: { userId: user.id, status: "active" }, orderBy: { createdAt: "desc" }, take: 1 }),
    prisma.bloodResult.findMany({ where: { panel: { user: { id: user.id } } } }),
    prisma.geneticVariant.findMany({ where: { dnaResult: { user: { id: user.id } } } }),
    prisma.workout.findMany({ where: { userId: user.id, planned: true, date: { gte: start, lt: end } }, include: { planDay: { select: { dayOff: true } } }, orderBy: [{ completed: "asc" }, { startTime: "asc" }], take: 3 }),
    // Long-term memory: last 7 check-ins, 4 weeks of training, benchmark history
    prisma.dailyCheckin.findMany({ where: { userId: user.id, date: { lt: end } }, orderBy: { date: "desc" }, take: 7 }),
    prisma.workout.findMany({ where: { userId: user.id, date: { gte: new Date(+now - 28 * 86400000), lte: now } }, orderBy: { date: "asc" } }),
    prisma.benchmarkTest.findMany({ where: { userId: user.id, completed: true }, orderBy: { date: "asc" } }),
  ]);

  const readiness = currentHrvReadiness(metrics, user.timezone, now);
  const withHrv = metrics.filter((m) => m.hrv && dateKey(m.date, user.timezone) === dateKey(now, user.timezone));

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
    if (!w.completed || w.matchedPlanId) continue;
    const localKey = dateKey(w.date, user.timezone);
    const key = addDaysKey(localKey, -((new Date(`${localKey}T12:00Z`).getUTCDay() + 6) % 7));
    const b = weekBuckets.get(key) || { minutes: 0, sessions: 0 };
    b.minutes += w.actualDurationMin ?? w.durationMin; b.sessions += 1;
    weekBuckets.set(key, b);
  }
  const loadTrend = Array.from(weekBuckets.entries()).sort().map(([wk, b]) => `wk${wk.slice(5)}: ${b.sessions} sessions/${Math.round(b.minutes / 60)}h`);
  const planned4w = workouts4w.filter((w) => w.planned).length;
  const done4w = workouts4w.filter((w) => w.planned && (w.completed || w.matchedPlanId) && !["partial", "skipped"].includes(w.feedbackStatus || "")).length;
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
    todaySession: todayWorkouts[0] ? { ...todayWorkouts[0], prescription: todayWorkouts[0].planDay?.dayOff || user.profile?.injured ? JSON.stringify(prescribeToday({ session: baseWorkout(todayWorkouts[0]), adaptation: { verdict: "rest", durationFactor: 0, intensityCap: "z1" } })) : todayWorkouts[0].prescription } : null,
    planName: plans[0]?.name || null,
    bloodFlags,
    dnaHighlights: dnaHighlights.slice(0, 4),
    language: user.language,
    historyDigest,
  });

  return NextResponse.json({ briefing, cached: briefing.mode === "fallback" ? false : true });
}
