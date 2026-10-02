// KCoach Activity Report — the post-activity narrative (Strava "Athlete
// Intelligence" equivalent, owner request 2026-09-26). Generated at SYNC time
// from the athlete's own stored history: pace/HR/TSS vs their 30-day baseline,
// streak, adherence to the prescribed session, and morning recovery context.
//
// Deterministic and honest by design — every line comes from a number we can
// point at in the DB. No AI generation (free, instant, no hallucinated stats).
// Zone-distribution percentages ("68% in threshold") are deliberately NOT
// claimed: we store avg/max HR, not HR streams — fabricating them would be a lie.

import { prisma } from "./db";
import { dateKey, dayBounds } from "./dates";import { unitsOf, type UnitSystem } from "./units";

// ---------- pure stat engine (unit-tested) ----------

export interface ReportActivity {
  sport: string;
  date: Date | string;
  durationMin: number;
  distanceKm?: number | null;
  avgHr?: number | null;
  maxHr?: number | null;
  tss?: number | null;
  calories?: number | null;
  title?: string | null;
}

export interface HistorySample {
  date: Date | string;
  durationMin: number;
  distanceKm?: number | null;
  avgHr?: number | null;
  tss?: number | null;
}

export interface ReportContext {
  units: UnitSystem;
  /** Morning-of metrics for recovery context. */
  recovery?: { recoveryScore?: number | null; hrv?: number | null } | null;
  hrvBaseline?: number | null;
  /** The prescribed session this activity fulfilled (from matchedPlanId). */
  planned?: { title: string; durationMin: number; intensity?: string | null } | null;
}

export interface ActivityReport {
  headline: string;
  body: string;
}

const KM_PER_MI = 1.609344;

export function fmtPace(minPerKm: number, units: UnitSystem): string {
  const secs = Math.round(
    minPerKm * (units === "imperial" ? KM_PER_MI : 1) * 60,
  );
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}/${units === "imperial" ? "mi" : "km"}`;
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h}h ${m}m` : `${m} min`;
}

function pctDelta(now: number, base: number): number {
  return Math.round(((now - base) / base) * 100);
}

// Consecutive-day streak ending at (and including) the activity's LOCAL date,
// computed over ANY sport — a swim keeps a runner's streak alive.
export function computeStreak(
  activityDate: Date | string,
  allDates: (Date | string)[],
  timezone: string,
): number {
  const days = new Set(allDates.map((d) => dateKey(new Date(d), timezone)));
  const startKey = dateKey(new Date(activityDate), timezone);
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const d = new Date(`${startKey}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    if (days.has(dateKey(d, timezone))) streak++;
    else break;
  }
  return streak;
}

interface Notables {
  fastestPace?: { days: number; pace: number; avg30: number };
  longest?: { days: number; byDistance: boolean };
  hardest?: { days: number };
  streak?: number;
}

// Compare the activity to the same-sport 30-day history (excluding itself).
export function findNotables(
  activity: ReportActivity,
  sameSport30d: HistorySample[],
): Notables {
  const n: Notables = {};
  const speed = (s: HistorySample) =>
    s.distanceKm && s.distanceKm > 0.5 && s.durationMin > 5
      ? s.durationMin / s.distanceKm
      : null;
  const pace = speed(activity as HistorySample);
  if (pace) {
    const paces = sameSport30d
      .map(speed)
      .filter((p): p is number => p != null);
    if (paces.length >= 3) {
      const faster = sameSport30d.filter(
        (s, i) => paces[i] != null && paces[i] < pace - 0.02,
      );
      if (!faster.length && paces.length >= 5) {
        n.fastestPace = { days: 30, pace, avg30: paces.reduce((a, b) => a + b, 0) / paces.length };
      }
    }
  }
  if (activity.distanceKm && activity.distanceKm > 1) {
    const longer = sameSport30d.filter(
      (s) => (s.distanceKm || 0) > activity.distanceKm! * 1.02,
    );
    if (!longer.length) n.longest = { days: 30, byDistance: true };
  }
  if (activity.tss && activity.tss > 20) {
    const harder = sameSport30d.filter((s) => (s.tss || 0) > activity.tss! * 1.02);
    if (!harder.length) n.hardest = { days: 30 };
  }
  return n;
}

export function computeActivityReport(
  activity: ReportActivity,
  sameSport30d: HistorySample[],
  ctx: ReportContext,
  streakDays?: number,
): ActivityReport {
  const units = ctx.units;
  const sportLabel = activity.sport === "ride" ? "ride" : activity.sport;
  const headlineParts: string[] = [];

  // --- headline: the single most notable fact ---
  if (streakDays && streakDays >= 3)
    headlineParts.push(`Day ${streakDays} of your activity streak`);
  const pace =
    activity.distanceKm && activity.distanceKm > 0.5 && activity.durationMin > 5
      ? activity.durationMin / activity.distanceKm
      : null;
  const paceHist = sameSport30d
    .map((s) =>
      s.distanceKm && s.distanceKm > 0.5 && s.durationMin > 5
        ? s.durationMin / s.distanceKm
        : null,
    )
    .filter((p): p is number => p != null);
  if (pace && paceHist.length >= 5 && paceHist.every((p) => p > pace + 0.02))
    headlineParts.unshift(
      `Fastest ${sportLabel} pace in 30 days — ${fmtPace(pace, units)}`,
    );
  else if (
    activity.distanceKm &&
    activity.distanceKm > 1 &&
    sameSport30d.length >= 5 &&
    sameSport30d.every((s) => (s.distanceKm || 0) < activity.distanceKm! * 1.02)
  )
    headlineParts.unshift(
      `Longest ${sportLabel} in 30 days — ${(units === "imperial" ? activity.distanceKm / KM_PER_MI : activity.distanceKm).toFixed(1)} ${units === "imperial" ? "mi" : "km"}`,
    );
  const headline = headlineParts.length
    ? `${headlineParts.join(" — ")}${headlineParts.length === 1 && streakDays ? ` — keep it rolling.` : "."}`
    : sameSport30d.length < 3
      ? `${activity.title || `Your ${sportLabel}`} is logged — building your baseline.`
      : `${activity.title || `Solid ${sportLabel}`} — logged and analyzed.`;

  // --- body: the numbers behind it ---
  const lines: string[] = [];
  const distLine =
    activity.distanceKm && activity.distanceKm > 0.3
      ? `${(units === "imperial" ? activity.distanceKm / KM_PER_MI : activity.distanceKm).toFixed(1)} ${units === "imperial" ? "mi" : "km"}`
      : null;
  lines.push(
    `${distLine ? `${distLine} in ` : ""}${fmtDuration(activity.durationMin)}${activity.avgHr ? ` · avg HR ${activity.avgHr} bpm${activity.maxHr ? ` (peak ${activity.maxHr})` : ""}` : ""}${activity.calories ? ` · ${activity.calories} kcal` : ""}.`.trim(),
  );
  if (pace && paceHist.length >= 3) {
    const avg30 = paceHist.reduce((a, b) => a + b, 0) / paceHist.length;
    const delta = pctDelta(pace, avg30);
    lines.push(
      delta <= -2
        ? `That's ${Math.abs(delta)}% faster than your 30-day average ${sportLabel} pace of ${fmtPace(avg30, units)}.`
        : delta >= 2
          ? `About ${delta}% slower than your 30-day average pace of ${fmtPace(avg30, units)} — fine if this was an easy/recovery day.`
          : `Right on your 30-day average pace of ${fmtPace(avg30, units)}.`,
    );
  }
  if (ctx.planned) {
    const diff = activity.durationMin - ctx.planned.durationMin;
    const drift =
      Math.abs(diff) <= Math.max(5, ctx.planned.durationMin * 0.15)
        ? "right on the prescribed duration"
        : diff > 0
          ? `${diff} min longer than prescribed`
          : `${Math.abs(diff)} min shorter than prescribed`;
    lines.push(
      `Matched your planned session "${ctx.planned.title}" — ${drift}${ctx.planned.intensity ? ` (${ctx.planned.intensity.toUpperCase()} target)` : ""}.`,
    );
  }
  const hrHist = sameSport30d
    .map((s) => s.avgHr)
    .filter((v): v is number => v != null && v > 60);
  if (activity.avgHr && hrHist.length >= 3) {
    const avg = hrHist.reduce((a, b) => a + b, 0) / hrHist.length;
    const delta = pctDelta(activity.avgHr, avg);
    if (Math.abs(delta) >= 3)
      lines.push(
        `Avg HR ${delta > 0 ? "above" : "below"} your 30-day ${sportLabel} average (${Math.round(avg)} bpm)${delta > 0 ? " — check that effort matched intent" : ""}.`,
      );
  }
  const rec = ctx.recovery;
  if (rec?.recoveryScore != null)
    lines.push(
      `You started on a morning recovery of ${Math.round(rec.recoveryScore)}%${ctx.hrvBaseline && rec.hrv != null ? ` (HRV ${Math.round(rec.hrv)} vs ${Math.round(ctx.hrvBaseline)} baseline)` : ""}${rec.recoveryScore < 50 ? " — good call keeping this controlled" : ""}.`,
    );
  const body = lines.join(" ");
  return { headline, body };
}

// ---------- persistence + delivery ----------

export async function generateAndDeliverActivityReport(
  userId: string,
  timezone: string,
  activityId: string,
): Promise<{ headline: string; body: string } | null> {
  try {
    const activity = await prisma.workout.findFirst({
      where: { id: activityId, userId, planned: false, completed: true },
    });
    if (!activity || activity.insights) return null;
    const [user, since30, anyDates, metric, plannedMatch, pref] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { timezone: true, profile: { select: { units: true, hrvBaseline: true } } },
        }),
        prisma.workout.findMany({
          where: {
            userId,
            planned: false,
            completed: true,
            sport: activity.sport,
            date: { gte: new Date(activity.date.getTime() - 30 * 86400000), lt: activity.date },
          },
          select: { id: true, date: true, durationMin: true, distanceKm: true, avgHr: true, tss: true },
        }),
        prisma.workout.findMany({
          where: {
            userId,
            planned: false,
            completed: true,
            date: { gte: new Date(activity.date.getTime() - 60 * 86400000) },
          },
          select: { date: true },
        }),
        prisma.dailyMetrics.findUnique({
          where: {
            userId_date: {
              userId,
              date: dayBounds(timezone, activity.date).start,
            },
          },
          select: { recoveryScore: true, hrv: true },
        }),
        prisma.workout.findFirst({
          where: { userId, matchedPlanId: activity.id },
          select: { title: true, durationMin: true, intensity: true },
        }),
        prisma.reminderPref.findUnique({ where: { userId } }),
      ]);
    const history = since30.filter((w) => w.id !== activity.id);
    const report = computeActivityReport(
      activity,
      history,
      {
        units: unitsOf(user?.profile?.units),
        recovery: metric,
        hrvBaseline: user?.profile?.hrvBaseline,
        planned: plannedMatch,
      },
      computeStreak(activity.date, [
        ...anyDates.map((d) => d.date),
        activity.date,
      ], timezone),
    );
    await prisma.workout.update({
      where: { id: activity.id },
      data: { insights: JSON.stringify(report) },
    });
    // Telegram delivery — athlete's own bot, only if they opted in.
    if (pref?.telegramEnabled && pref.telegramChatId) {
      const { sendTelegram } = await import("./notify");
      const text = `📊 KCoach Activity Report\n\n${report.headline}\n\n${report.body}`;
      const sent = await sendTelegram(pref.telegramChatId, text);
      if (!sent.ok) console.warn(`[activity-report] telegram failed: ${sent.error}`);
    }
    const { logEvent } = await import("./telemetry");
    await logEvent({
      kind: "info",
      source: "sync",
      route: "generateAndDeliverActivityReport",
      message: `user=${userId} activity=${activityId}`,
    });
    return report;
  } catch (e) {
    console.warn("[activity-report] generation failed:", String(e).slice(0, 160));
    return null;
  }
}
