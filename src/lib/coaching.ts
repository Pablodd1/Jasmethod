import { estimateTss, computePmc } from "./fitness";
import { dateKey } from "./dates";

// Explain observations and their data coverage. Missing data is not a diagnosis.
export function coachingSummary(
  workouts: any[],
  metrics: any[],
  profile: any,
  timezone: string,
  now = new Date(),
) {
  const past = workouts.filter((w) => new Date(w.date) <= now);
  const completed = past.filter((w) => w.completed && !w.matchedPlanId);
  const planned = past.filter((w) => w.planned);
  const measured = completed.filter(
    (w) => w.avgHr != null || w.avgPower != null || w.np != null,
  );
  const input = (w: any) => ({
    durationMin: w.actualDurationMin ?? w.durationMin,
    avgPower: w.np ?? w.avgPower,
    avgHr: w.avgHr,
    rpe: w.rpe,
    intensity: w.intensity,
    tss: w.tss,
    ftp: profile?.ftp,
    lthr: profile?.lthr,
  });
  const pmc = computePmc(
    completed.map((w) => ({ date: new Date(w.date), tssInput: input(w) })),
    now,
    timezone,
  );
  const daily = new Map<
    string,
    { date: string; minutes: number; load: number }
  >();
  for (const w of completed) {
    const key = dateKey(new Date(w.date), timezone);
    const d = daily.get(key) || { date: key, minutes: 0, load: 0 };
    d.minutes += w.actualDurationMin ?? w.durationMin;
    d.load += estimateTss(input(w));
    daily.set(key, d);
  }
  const latest = metrics[metrics.length - 1];
  const insights: {
    level: "attention" | "info";
    title: string;
    detail: string;
  }[] = [];
  if (!completed.length)
    insights.push({
      level: "info",
      title: "No completed training in this window",
      detail:
        "Check whether the athlete trained without logging or has an import problem before changing the plan.",
    });
  if (profile?.injured)
    insights.push({
      level: "attention",
      title: "Injury flag is active",
      detail:
        "Daily adaptation pauses training. Review with the athlete before clearing this flag.",
    });
  if (
    latest &&
    (now.getTime() - new Date(latest.date).getTime()) / 86400000 > 3
  )
    insights.push({
      level: "info",
      title: "Recovery data is stale",
      detail:
        "The latest measurements are more than three days old. Request a current check-in before using them to change training.",
    });
  const feedback = past.filter(
    (w) => w.feedbackStatus === "partial" || w.feedbackStatus === "skipped",
  );
  if (feedback.length)
    insights.push({
      level: "attention",
      title: `${feedback.length} partial or skipped sessions`,
      detail:
        "Review the athlete's feedback notes, available time and workout difficulty before increasing volume.",
    });
  if (pmc && pmc.current.tsb < -20)
    insights.push({
      level: "attention",
      title: "Recent estimated load exceeds longer-term load",
      detail: `Estimated form ${pmc.current.tsb.toFixed(1)}. This is a load-model signal, not an injury prediction; compare with sleep, effort and the athlete's report.`,
    });
  if (measured.length < completed.length)
    insights.push({
      level: "info",
      title: "Some load values are estimated from effort",
      detail: `${measured.length}/${completed.length} completed sessions include heart rate or power. Other load values use effort or planned zone; compare trends cautiously.`,
    });
  if (!profile?.lthr && !profile?.ftp && !profile?.runPaceBase)
    insights.push({
      level: "info",
      title: "No saved threshold baseline",
      detail:
        "Set an appropriate measured baseline to personalize workout targets.",
    });
  const fulfilled = planned.filter(
    (w) => (w.completed || w.matchedPlanId) && !["partial", "skipped"].includes(w.feedbackStatus),
  ).length;
  return {
    completed: completed.length,
    planned: planned.length,
    fulfillmentPct: planned.length
      ? Math.round((100 * fulfilled) / planned.length)
      : null,
    minutes: completed.reduce(
      (s, w) => s + (w.actualDurationMin ?? w.durationMin),
      0,
    ),
    measuredSessions: measured.length,
    estimatedLoad: Math.round(
      completed.reduce((s, w) => s + estimateTss(input(w)), 0),
    ),
    pmc,
    daily: Array.from(daily.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    insights,
    coverage: {
      firstDay: past[0]?.date || null,
      metricsDays: new Set(
        metrics.map((m) => dateKey(new Date(m.date), timezone)),
      ).size,
      latestMetric: latest?.date || null,
    },
  };
}
