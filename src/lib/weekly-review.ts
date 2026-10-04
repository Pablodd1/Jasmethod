// JasMiamiMethod — Weekly Review message (the retention feature)
// Sunday delivery: last week's adherence, best effort, next week's focus —
// all computed from data the app already has. Bilingual (athlete language).

import { prisma } from "./db";
import { dateKey, dayBounds, addDaysKey, localDate } from "./dates";
import { estimateTss } from "./fitness";

export interface WeeklyReview {
  subject: string;
  text: string;
  hasData: boolean;
}

export async function buildWeeklyReview(
  userId: string,
  timezone: string,
  lang: "en" | "es",
): Promise<WeeklyReview> {
  const es = lang === "es";
  const end = dayBounds(timezone).start;
  const start = new Date(end.getTime() - 7 * 86400000);

  const [planned, completed, profile] = await Promise.all([
    prisma.workout.findMany({
      where: { userId, planned: true, date: { gte: start, lt: end } },
      select: { id: true, durationMin: true, completed: true, feedbackStatus: true, title: true, date: true },
    }),
    prisma.workout.findMany({
      where: { userId, completed: true, date: { gte: start, lt: end } },
      select: {
        title: true, date: true, sport: true, durationMin: true,
        actualDurationMin: true, avgHr: true, np: true, avgPower: true,
        rpe: true, intensity: true, distanceKm: true, tss: true, matchedPlanId: true,
      },
      orderBy: { date: "desc" },
    }),
    prisma.athleteProfile.findUnique({
      where: { userId },
      select: { ftp: true, lthr: true },
    }),
  ]);

  const plannedCount = planned.filter((p) => p.durationMin > 0).length;
  const donePlanned = planned.filter(
    (p) => p.completed && !["partial", "skipped"].includes(p.feedbackStatus || ""),
  ).length;
  const realEfforts = completed.filter((c) => !c.matchedPlanId || c.avgHr || c.avgPower || c.distanceKm);
  const totalMin = completed.reduce(
    (s, c) => s + (c.actualDurationMin ?? c.durationMin ?? 0), 0,
  );
  const bestTss = Math.max(
    0,
    ...completed.map((c) =>
      estimateTss({
        durationMin: c.actualDurationMin ?? c.durationMin,
        avgPower: (c as any).np ?? c.avgPower ?? undefined,
        avgHr: c.avgHr ?? undefined,
        ftp: profile?.ftp ?? undefined,
        lthr: profile?.lthr ?? undefined,
        intensity: c.intensity ?? undefined,
        tss: c.tss ?? undefined,
      } as any),
    ),
  );
  const bestEffort =
    realEfforts[0] && bestTss > 0
      ? realEfforts[0].title
      : null;

  const subject = es
    ? `📋 ${es ? "Tu semana" : "Your week"} — repaso`
    : `📋 Your week — review`;
  if (!completed.length && !plannedCount) {
    return {
      subject,
      hasData: false,
      text: es
        ? "Todavía no hay entrenamientos registrados esta semana. Haz tu check-in diario y el plan se adapta."
        : "No workouts logged this week yet. Do your daily check-in and the plan adapts.",
    };
  }

  const adherencePct = plannedCount
    ? Math.round((donePlanned / plannedCount) * 100)
    : null;

  const verdictLine =
    adherencePct == null
      ? null
      : adherencePct >= 85
        ? es ? "Excelente consistencia — el motor está creciendo." : "Excellent consistency — the engine is growing."
        : adherencePct >= 60
          ? es ? "Buena base — protege las sesiones clave y sube." : "Solid base — protect the key sessions and climb."
          : es ? "Semana corta — sin culpa; prioriza sueño y reanuda con la próxima sesión clave." : "Short week — no guilt; prioritize sleep and resume with the next key session.";

  const nextWeekFocus = adherencePct != null && adherencePct < 60
    ? es ? "Enfoque: una sesión clave al día, como está planificada." : "Focus: one key session a day, as planned."
    : es ? "Enfoque: calidad en las sesiones duras — la base está puesta." : "Focus: quality on the hard sessions — the base is laid.";

  const lines = [
    es ? `📊 Repaso semanal` : `📊 Weekly review`,
    "",
    es ? `Sesiones completadas: ${donePlanned}/${plannedCount || "—"}${adherencePct != null ? ` (${adherencePct}%)` : ""}` : `Sessions completed: ${donePlanned}/${plannedCount || "—"}${adherencePct != null ? ` (${adherencePct}%)` : ""}`,
    `${es ? "Tiempo total" : "Total time"}: ${Math.round(totalMin / 60)}h ${totalMin % 60 ? `${Math.round(totalMin % 60)}m` : ""}`,
    bestEffort ? `${es ? "Mejor esfuerzo" : "Best effort"}: ${bestEffort}${bestTss ? ` (${es ? "carga histórica est." : "legacy load est."} ${Math.round(bestTss)})` : ""}` : null,
    verdictLine ? "" : null,
    verdictLine ? `💪 ${verdictLine}` : null,
    nextWeekFocus ? `🎯 ${nextWeekFocus}` : null,
    "",
    es ? "Todo esto salió de tus propios datos. Que la próxima semana hable por sí sola." : "All of this came from your own data. Let next week speak for itself.",
  ].filter((l) => l !== null);

  return { subject, text: lines.join("\n"), hasData: true };
}

// Should the weekly review fire now? Sunday in the athlete's timezone, at or
// after the 17th local hour (evening reflection), once per week.
export function isWeeklyReviewTime(timezone: string, reminderHour: number): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
    timeZone: timezone,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date()).map((p) => [p.type, p.value]),
  );
  const hour = Number(parts.hour);
  return parts.weekday === "Sun" && hour >= Math.max(17, reminderHour);
}

// Weekly dedupe key: the ISO week the review belongs to.
export function weeklyReviewDay(timezone: string): string {
  const { key } = dayBounds(timezone);
  return `week:${key.slice(0, 10)}`;
}

export { dateKey, addDaysKey, localDate };
