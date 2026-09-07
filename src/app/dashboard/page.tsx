"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  HeartPulse,
  Moon,
  Dumbbell,
  Droplets,
  Apple,
  FlaskConical,
  Dna,
  Plug,
  ArrowRight,
  CheckCircle2,
  Waves,
  Sparkles,
  CalendarDays,
  CalendarClock,
  Flag,
  ClipboardCheck,
  Target,
  Timer,
} from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { dailyMotivation } from "@/lib/science";
import { t, type Lang } from "@/lib/i18n";

const SPORT_ICON: Record<string, any> = {
  swim: Waves,
  bike: Dumbbell,
  run: Dumbbell,
  strength: Dumbbell,
  brick: Dumbbell,
  recovery: HeartPulse,
};

function fmtMin(min: number) {
  if (min >= 60)
    return `${Math.floor(min / 60)}h ${min % 60 ? `${min % 60}m` : ""}`;
  return `${min}m`;
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function countdownLabel(lang: Lang, days: number): string {
  if (days <= 0) return t(lang, "dash.countdown.today");
  if (days === 1) return t(lang, "dash.countdown.oneDay");
  return t(lang, "dash.countdown.days").replace("{n}", String(days));
}

function dateLabel(lang: Lang, dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString(
    lang === "es"
      ? "es-VE"
      : lang === "ru"
        ? "ru-RU"
        : lang === "ht"
          ? "fr-FR"
          : "en-US",
    { day: "numeric", month: "short" },
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const lang = (user?.language || "es") as Lang;
  const [plan, setPlan] = useState<any>(null);
  const [progression, setProgression] = useState<any>(null);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [hydration, setHydration] = useState<any[]>([]);
  const [todaySessions, setTodaySessions] = useState<any[]>([]);
  const [coach, setCoach] = useState<any>(null);
  const [calendar, setCalendar] = useState<any>({
    busyCount: 0,
    appointments: [],
  });
  const [races, setRaces] = useState<any[]>([]);
  const [benchmarks, setBenchmarks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const mot = dailyMotivation(
    Math.floor(Date.now() / 86400000),
    user?.motivation?.style || "coach",
    user?.language || "en",
  );

  useEffect(() => {
    if (!user) return;
    fetch("/api/coach")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setCoach(d.briefing);
      })
      .catch(() => {});
    Promise.all([
      fetch("/api/plan?view=week").then((r) => r.json()),
      fetch("/api/workouts?days=30").then((r) => r.json()),
      fetch("/api/metrics?days=14").then((r) => r.json()),
      fetch("/api/nutrition?days=2").then((r) => r.json()),
      fetch("/api/checkin")
        .then((r) => r.json())
        .catch(() => ({ calendar: null })),
      Promise.resolve({ briefing: null }),
      fetch("/api/races")
        .then((r) => r.json())
        .catch(() => ({ races: [] })),
      fetch("/api/benchmarks")
        .then((r) => r.json())
        .catch(() => ({ tests: [] })),
    ])
      .then(
        ([
          planData,
          workData,
          metricData,
          nutrData,
          checkinData,
          coachData,
          raceData,
          benchData,
        ]) => {
          setPlan(planData.plans?.[0] || null);
          setProgression(planData.progression || null);
          setWorkouts(workData.workouts || []);
          setMetrics(metricData.metrics || []);
          setHydration(nutrData.daily || []);
          setCalendar(
            checkinData?.calendar || { busyCount: 0, appointments: [] },
          );

          setRaces(raceData.races || []);
          setBenchmarks(benchData.tests || []);
          const today = new Date().toISOString().slice(0, 10);
          setTodaySessions(
            (workData.workouts || []).filter(
              (w: any) => w.date.slice(0, 10) === today,
            ),
          );
          setLoading(false);
        },
      )
      .catch(() => setLoading(false));
  }, [user]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayHydration =
    hydration.find((d: any) => d.date === todayKey)?.waterMl || 0;
  const latestMetric = metrics[metrics.length - 1];
  const weekWorkouts = workouts.filter((w) => {
    const d = new Date(w.date);
    const now = new Date();
    return d >= new Date(now.getTime() - 7 * 86400000);
  });
  const weekMinutes = weekWorkouts.reduce(
    (a, w) => a + (w.completed ? w.durationMin : 0),
    0,
  );
  const weekCompleted = weekWorkouts.filter((w) => w.completed).length;
  const weekPlanned = weekWorkouts.filter((w) => w.planned).length;
  const completionPct = weekPlanned
    ? Math.round((weekCompleted / Math.max(weekPlanned, 1)) * 100)
    : 0;

  if (loading) {
    return (
      <ProtectedPage>
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-ocean-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </ProtectedPage>
    );
  }

  const needsProfile = user && !user.profile?.birthYear;
  const needsPlan = !plan;
  // Countdown to the next events that matter (goal / race / baseline test).
  const todayMs = new Date();
  todayMs.setHours(0, 0, 0, 0);
  const nextRace = (races || [])
    .filter((r: any) => new Date(r.date) >= todayMs)
    .sort(
      (a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime(),
    )[0];
  const nextBenchmark = (benchmarks || [])
    .filter(
      (b: any) => !b.completed && !b.skipped && new Date(b.date) >= todayMs,
    )
    .sort(
      (a: any, b: any) =>
        new Date(a.date).getTime() - new Date(b.date).getTime(),
    )[0];
  const goalDate = nextRace?.date || plan?.raceDate || null;

  return (
    <ProtectedPage>
      <div className="space-y-6">
        {/* Greeting + motivation */}
        <div className="bg-gradient-to-r from-ocean-950 to-ocean-800 rounded-3xl p-6 md:p-8 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-ocean-300 text-sm font-medium">
                {t(lang, "dash.greeting").replace(
                  "{name}",
                  user?.name?.split(" ")[0] || t(lang, "dash.athlete"),
                )}
              </p>
              <h1 className="font-display text-2xl md:text-3xl font-bold mt-1">
                {t(lang, "dash.motivation")}
              </h1>
            </div>
            <Sparkles className="w-8 h-8 text-ocean-300 shrink-0" />
          </div>
          <blockquote className="mt-4 border-l-4 border-ocean-400 pl-4 text-ocean-100 italic">
            &ldquo;{mot.quote}&rdquo;
          </blockquote>
          <p className="mt-2 text-ocean-200 text-sm">{mot.message}</p>
        </div>

        {/* Countdown to next goal / race / baseline test */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-lg flex items-center gap-2">
              <Timer className="w-5 h-5 text-ocean-500" />{" "}
              {t(lang, "dash.countdown.title")}
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {/* Next goal */}
            <div className="rounded-xl border border-sand-200 bg-sand-100/60 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Target className="w-4 h-4" /> {t(lang, "dash.countdown.goal")}
              </div>
              {goalDate ? (
                <>
                  <div className="font-display text-2xl font-bold mt-2">
                    {countdownLabel(
                      lang,
                      daysUntil(String(goalDate).slice(0, 10)),
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {dateLabel(lang, String(goalDate).slice(0, 10))}
                    {nextRace?.name ? ` · ${nextRace.name}` : ""}
                  </div>
                </>
              ) : (
                <Link
                  href="/races"
                  className="font-display text-lg font-bold text-slate-400 mt-2 inline-block hover:text-ocean-600"
                >
                  {t(lang, "dash.countdown.noGoal")} →
                </Link>
              )}
            </div>
            {/* Next race */}
            <div className="rounded-xl border border-sand-200 bg-sand-100/60 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Flag className="w-4 h-4" /> {t(lang, "dash.countdown.race")}
              </div>
              {nextRace ? (
                <>
                  <div className="font-display text-2xl font-bold mt-2">
                    {countdownLabel(
                      lang,
                      daysUntil(String(nextRace.date).slice(0, 10)),
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {dateLabel(lang, String(nextRace.date).slice(0, 10))} ·{" "}
                    {nextRace.name}
                  </div>
                </>
              ) : (
                <Link
                  href="/races"
                  className="font-display text-lg font-bold text-slate-400 mt-2 inline-block hover:text-ocean-600"
                >
                  {t(lang, "dash.countdown.noRace")} →
                </Link>
              )}
            </div>
            {/* Next baseline test */}
            <div className="rounded-xl border border-sand-200 bg-sand-100/60 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <ClipboardCheck className="w-4 h-4" />{" "}
                {t(lang, "dash.countdown.baseline")}
              </div>
              {nextBenchmark ? (
                <>
                  <div className="font-display text-2xl font-bold mt-2">
                    {countdownLabel(
                      lang,
                      daysUntil(String(nextBenchmark.date).slice(0, 10)),
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {dateLabel(lang, String(nextBenchmark.date).slice(0, 10))} ·{" "}
                    {nextBenchmark.name}
                  </div>
                </>
              ) : (
                <Link
                  href="/labs"
                  className="font-display text-lg font-bold text-slate-400 mt-2 inline-block hover:text-ocean-600"
                >
                  {t(lang, "dash.countdown.noBaseline")} →
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* AI Coach (JASAI) briefing */}
        {coach && (
          <div className="bg-gradient-to-r from-coral-500 to-ocean-600 rounded-3xl p-6 md:p-7 text-white flex items-start gap-4">
            <Sparkles className="w-7 h-7 text-white/80 shrink-0 mt-1" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white/80 text-xs font-semibold uppercase tracking-widest">
                  {t(lang, "dash.coachJas")}
                </span>
                {coach.mode === "fallback" && (
                  <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">
                    {t(lang, "dash.ruleBased")}
                  </span>
                )}
              </div>
              <h2 className="font-display text-xl font-bold mt-1">
                {coach.headline}
              </h2>
              <p className="mt-1 text-white/95 text-sm leading-relaxed">
                {coach.briefing}
              </p>
              <p className="mt-2 text-white/90 text-sm">
                <span className="font-semibold">
                  {t(lang, "dash.adaptation")}
                </span>{" "}
                {coach.adaptation}
              </p>
              {coach.sources?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {coach.sources.map((s: string) => (
                    <span
                      key={s}
                      className="text-[10px] bg-white/15 rounded-full px-2 py-0.5"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Calendar-aware coaching: today's appointments */}
        {calendar.busyCount > 0 && (
          <div className="card border-amber-200 bg-amber-50">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <CalendarClock className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-amber-900">
                  Today: {calendar.busyCount} commitment
                  {calendar.busyCount > 1 ? "s" : ""} on your calendar
                </div>
                <div className="text-sm text-amber-800 mt-0.5 space-y-0.5">
                  {calendar.appointments
                    .slice(0, 5)
                    .map((a: any, i: number) => (
                      <div key={i}>
                        {a.startTime || "all-day"} · {a.title}
                      </div>
                    ))}
                  {calendar.busyCount > 5 && (
                    <div className="text-xs">
                      +{calendar.busyCount - 5} more
                    </div>
                  )}
                </div>
                <Link
                  href="/calendar"
                  className="text-xs text-amber-700 underline mt-1 inline-block"
                >
                  Plan training around this →
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Onboarding nudges */}
        {(needsProfile || needsPlan) && (
          <div className="grid md:grid-cols-2 gap-4">
            {needsProfile && (
              <Link
                href="/settings"
                className="card flex items-center gap-4 hover:shadow-md transition-shadow group"
              >
                <div className="w-11 h-11 rounded-xl bg-ocean-100 flex items-center justify-center text-ocean-600">
                  <HeartPulse className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">
                    {t(lang, "dash.setupProfile")}
                  </div>
                  <div className="text-sm text-slate-500">
                    {t(lang, "dash.setupProfileSub")}
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-ocean-500" />
              </Link>
            )}
            {needsPlan && (
              <Link
                href="/training"
                className="card flex items-center gap-4 hover:shadow-md transition-shadow group"
              >
                <div className="w-11 h-11 rounded-xl bg-coral-100 flex items-center justify-center text-coral-500">
                  <Dumbbell className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">{t(lang, "dash.genPlan")}</div>
                  <div className="text-sm text-slate-500">
                    {t(lang, "dash.genPlanSub")}
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-coral-500" />
              </Link>
            )}
          </div>
        )}

        {/* Today's sessions */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg">
              {t(lang, "dash.todayTraining")}
            </h2>
            <Link
              href="/calendar"
              className="text-sm text-ocean-600 hover:underline flex items-center gap-1"
            >
              <CalendarDays className="w-4 h-4" /> {t(lang, "dash.calendar")}
            </Link>
          </div>
          {todaySessions.length === 0 ? (
            <p className="text-slate-400 text-sm py-6 text-center">
              {t(lang, "dash.noSessions")}
            </p>
          ) : (
            <div className="space-y-3">
              {todaySessions.map((s: any) => {
                const Icon = SPORT_ICON[s.sport] || Dumbbell;
                const done = s.completed;
                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border ${done ? "bg-emerald-50 border-emerald-200" : "bg-sand-100 border-sand-200"}`}
                  >
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${done ? "bg-emerald-500 text-white" : "bg-ocean-600 text-white"}`}
                    >
                      {done ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{s.title}</div>
                      <div className="text-xs text-slate-500">
                        {fmtMin(s.durationMin)}
                        {s.distanceKm ? ` · ${s.distanceKm} km` : ""} ·{" "}
                        {s.intensity || "Z2"}
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        await fetch("/api/plan", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            sessionId: s.id,
                            completed: !done,
                          }),
                        });
                        window.location.reload();
                      }}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${done ? "bg-emerald-600 text-white" : "bg-white border border-ocean-200 text-ocean-700"}`}
                    >
                      {done
                        ? t(lang, "dash.completed")
                        : t(lang, "dash.markDone")}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">
              <HeartPulse className="w-4 h-4" /> {t(lang, "dash.hrvToday")}
            </div>
            <div className="font-display text-2xl font-bold">
              {latestMetric?.hrv ? `${latestMetric.hrv} ms` : "—"}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {latestMetric
                ? new Date(latestMetric.date).toLocaleDateString()
                : t(lang, "dash.logVia")}
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">
              <Moon className="w-4 h-4" /> {t(lang, "dash.sleep7d")}
            </div>
            <div className="font-display text-2xl font-bold">
              {latestMetric?.sleepHours ? `${latestMetric.sleepHours}h` : "—"}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {t(lang, "dash.targetSleep")}
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">
              <Dumbbell className="w-4 h-4" /> {t(lang, "dash.weekLoad")}
            </div>
            <div className="font-display text-2xl font-bold">
              {fmtMin(weekMinutes)}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {t(lang, "dash.sessionsDone")
                .replace("{a}", String(weekCompleted))
                .replace("{b}", String(Math.max(weekPlanned, 1)))}
            </div>
          </div>
          <div className="card">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1">
              <Droplets className="w-4 h-4" /> {t(lang, "dash.hydration")}
            </div>
            <div className="font-display text-2xl font-bold">
              {Math.round(todayHydration / 100) / 10} L
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {t(lang, "dash.targetHydration")}
            </div>
          </div>
        </div>

        {/* Plan progress + quick actions */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-bold text-lg">
                {t(lang, "dash.trainingPlan")}
              </h2>
              <Link
                href="/training"
                className="text-sm text-ocean-600 hover:underline flex items-center gap-1"
              >
                {t(lang, "dash.open")} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            {plan ? (
              <>
                <div className="font-medium">{plan.name}</div>
                <div className="text-sm text-slate-500">
                  {t(lang, "dash.planGoal")
                    .replace("{d}", plan.distance)
                    .replace("{w}", String(plan.weeks))
                    .replace("{l}", plan.level)}
                </div>
                <div className="mt-3 bg-sand-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-ocean-600 h-full rounded-full"
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
                <div className="text-xs text-slate-500 mt-1.5">
                  {t(lang, "dash.completionPct").replace(
                    "{p}",
                    String(completionPct),
                  )}
                </div>
                {progression && (
                  <div
                    className={`mt-3 rounded-xl px-3 py-2 text-xs border ${progression.status === "push" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : progression.status === "deload" ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-ocean-50 border-ocean-200 text-ocean-800"}`}
                  >
                    <span className="font-bold">
                      {progression.status === "push"
                        ? "📈 "
                        : progression.status === "deload"
                          ? "📉 "
                          : "✓ "}
                      {progression.pct}% adherence.
                    </span>{" "}
                    {progression.message}
                  </div>
                )}
              </>
            ) : (
              <div className="text-slate-400 text-sm py-4">
                {t(lang, "dash.noPlan")}
              </div>
            )}
          </div>
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-3">
              {t(lang, "dash.quickActions")}
            </h2>
            <div className="space-y-2">
              <Link
                href="/checkin"
                className="flex items-center gap-2 text-sm text-ocean-700 hover:bg-ocean-50 rounded-lg p-2"
              >
                <HeartPulse className="w-4 h-4" /> {t(lang, "dash.logHrv")}
              </Link>
              <Link
                href="/nutrition"
                className="flex items-center gap-2 text-sm text-ocean-700 hover:bg-ocean-50 rounded-lg p-2"
              >
                <Apple className="w-4 h-4" /> {t(lang, "dash.logFood")}
              </Link>
              <Link
                href="/blood"
                className="flex items-center gap-2 text-sm text-ocean-700 hover:bg-ocean-50 rounded-lg p-2"
              >
                <FlaskConical className="w-4 h-4" /> {t(lang, "dash.addBlood")}
              </Link>
              <Link
                href="/dna"
                className="flex items-center gap-2 text-sm text-ocean-700 hover:bg-ocean-50 rounded-lg p-2"
              >
                <Dna className="w-4 h-4" /> {t(lang, "dash.uploadDna")}
              </Link>
              <Link
                href="/connectors"
                className="flex items-center gap-2 text-sm text-ocean-700 hover:bg-ocean-50 rounded-lg p-2"
              >
                <Plug className="w-4 h-4" /> {t(lang, "dash.connectDevices")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </ProtectedPage>
  );
}
