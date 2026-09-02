import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { buildReminder, buildDailyPlanMessage, sendReminder } from "@/lib/notify";
import { hrvReadiness } from "@/lib/science";
import { analyzeHydration } from "@/lib/adaptive";

// Never prerender — hits the DB and external delivery services.
export const dynamic = "force-dynamic";

// POST /api/reminders/send — "Send now" from the Reminders page. Delivers the
// same message the cron would send right now (email + Telegram if enabled),
// so the athlete can verify the channels work. Returns per-channel results.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ?when=tomorrow (or body {when:"tomorrow"}) previews tomorrow's detailed
  // plan — exactly what the evening cron sends. Default: today.
  let when = "today";
  try {
    const body = await req.json();
    if (body?.when === "tomorrow") when = "tomorrow";
    if (req.url.includes("when=tomorrow")) when = "tomorrow";
  } catch { /* no body */ }

  const lang = user.language || "en";
  const prefs = await prisma.reminderPref.findUnique({ where: { userId: user.id } });
  if (!prefs || (!prefs.emailEnabled && !prefs.telegramEnabled)) {
    return NextResponse.json({ error: "No delivery channel enabled — turn on email or Telegram first." }, { status: 400 });
  }

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  if (when === "tomorrow") dayStart.setDate(dayStart.getDate() + 1);
  const end = new Date(dayStart); end.setDate(end.getDate() + 1);

  // Today's sessions (all of them — "send now" shows the full day, not just
  // the first session like the short morning cron reminder).
  const sessions = await prisma.workout.findMany({
    where: { userId: user.id, date: { gte: dayStart, lt: end }, planned: true },
    orderBy: { date: "asc" },
  });

  // Readiness from the last 7 days of HRV (same model as /api/metrics).
  const metrics = await prisma.dailyMetrics.findMany({ where: { userId: user.id, date: { gte: new Date(Date.now() - 30 * 86400000) } }, orderBy: { date: "asc" } });
  const withHrv = metrics.filter((m) => m.hrv).slice(-7);
  let readinessAdvice: string | null = null;
  if (withHrv.length >= 3) {
    const latest = withHrv[withHrv.length - 1];
    const baseline = withHrv.slice(0, -1).map((m) => m.hrv!);
    const mean = baseline.reduce((a, b) => a + b, 0) / baseline.length;
    const sd = Math.sqrt(baseline.reduce((a, b) => a + (b - mean) ** 2, 0) / baseline.length);
    readinessAdvice = hrvReadiness(latest.hrv!, baseline, sd).advice;
  }

  const lastSession = await prisma.workout.findFirst({
    where: { userId: user.id, date: { lt: dayStart }, completed: true, preWeightKg: { not: null }, postWeightKg: { not: null } },
    orderBy: { date: "desc" },
  });
  const hydration = lastSession?.preWeightKg && lastSession.postWeightKg ? analyzeHydration(lastSession.preWeightKg, lastSession.postWeightKg).advice : null;

  let message;
  if (sessions.length > 0) {
    message = buildDailyPlanMessage({
      name: user.name,
      dateLabel: when === "tomorrow" ? (lang === "es" ? "mañana" : "tomorrow") : (lang === "es" ? "hoy" : "today"),
      sessions: sessions.map((s) => ({ title: s.title, durationMin: s.durationMin, intensity: s.intensity || undefined, startTime: s.startTime || undefined })),
      readiness: readinessAdvice ? { score: 0, advice: readinessAdvice } : null,
      hydration,
    });
  } else {
    message = buildReminder(
      user.name,
      sessions[0] ? { title: sessions[0].title, durationMin: sessions[0].durationMin, intensity: sessions[0].intensity || undefined, recovery: sessions[0].recovery || undefined } : null,
    );
    if (readinessAdvice) message.text += `\nReadiness: ${readinessAdvice}`;
    if (hydration) message.text += `\n${hydration}`;
  }

  const result = await sendReminder(
    { email: user.email, name: user.name, telegramChatId: prefs.telegramEnabled ? prefs.telegramChatId || undefined : undefined },
    message,
  );

  return NextResponse.json({ ok: true, result: { email: result.email, telegram: result.telegram } });
}
