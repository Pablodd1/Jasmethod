"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  HeartPulse, Moon, Dumbbell, Droplets, Apple, FlaskConical, Dna, Plug,
  ArrowRight, CheckCircle2, Waves, Sparkles, CalendarDays,
} from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { dailyMotivation } from "@/lib/science";

const SPORT_ICON: Record<string, any> = { swim: Waves, bike: Dumbbell, run: Dumbbell, strength: Dumbbell, brick: Dumbbell, recovery: HeartPulse };

function fmtMin(min: number) {
  if (min >= 60) return `${Math.floor(min / 60)}h ${min % 60 ? `${min % 60}m` : ""}`;
  return `${min}m`;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [plan, setPlan] = useState<any>(null);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [metrics, setMetrics] = useState<any[]>([]);
  const [hydration, setHydration] = useState<any[]>([]);
  const [todaySessions, setTodaySessions] = useState<any[]>([]);
  const [coach, setCoach] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const mot = dailyMotivation(Math.floor(Date.now() / 86400000), user?.motivation?.style || "coach");

  useEffect(() => {
    if (!user) return;
    Promise.all([
      fetch("/api/plan").then((r) => r.json()),
      fetch("/api/workouts?days=30").then((r) => r.json()),
      fetch("/api/metrics?days=14").then((r) => r.json()),
      fetch("/api/nutrition?days=2").then((r) => r.json()),
      fetch("/api/coach").then((r) => r.json()).catch(() => ({ briefing: null })),
    ]).then(([planData, workData, metricData, nutrData, coachData]) => {
      setPlan(planData.plans?.[0] || null);
      setWorkouts(workData.workouts || []);
      setMetrics(metricData.metrics || []);
      setHydration(nutrData.daily || []);
      setCoach(coachData.briefing || null);
      const today = new Date().toISOString().slice(0, 10);
      setTodaySessions((workData.workouts || []).filter((w: any) => w.date.slice(0, 10) === today));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [user]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayHydration = hydration.find((d: any) => d.date === todayKey)?.waterMl || 0;
  const latestMetric = metrics[metrics.length - 1];
  const weekWorkouts = workouts.filter((w) => {
    const d = new Date(w.date);
    const now = new Date();
    return d >= new Date(now.getTime() - 7 * 86400000);
  });
  const weekMinutes = weekWorkouts.reduce((a, w) => a + (w.completed ? w.durationMin : 0), 0);
  const weekCompleted = weekWorkouts.filter((w) => w.completed).length;
  const weekPlanned = weekWorkouts.filter((w) => w.planned).length;
  const completionPct = weekPlanned ? Math.round((weekCompleted / Math.max(weekPlanned, 1)) * 100) : 0;

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

  return (
    <ProtectedPage>
      <div className="space-y-6">
        {/* Greeting + motivation */}
        <div className="bg-gradient-to-r from-ocean-950 to-ocean-800 rounded-3xl p-6 md:p-8 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-ocean-300 text-sm font-medium">Good morning, {user?.name?.split(" ")[0] || "Athlete"} ☀️</p>
              <h1 className="font-display text-2xl md:text-3xl font-bold mt-1">Today is a brick in the wall. Lay it well.</h1>
            </div>
            <Sparkles className="w-8 h-8 text-ocean-300 shrink-0" />
          </div>
          <blockquote className="mt-4 border-l-4 border-ocean-400 pl-4 text-ocean-100 italic">
            &ldquo;{mot.quote}&rdquo;
          </blockquote>
          <p className="mt-2 text-ocean-200 text-sm">{mot.message}</p>
        </div>

        {/* AI Coach (ox-alpha) briefing */}
        {coach && (
          <div className="bg-gradient-to-r from-coral-500 to-ocean-600 rounded-3xl p-6 md:p-7 text-white flex items-start gap-4">
            <Sparkles className="w-7 h-7 text-white/80 shrink-0 mt-1" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white/80 text-xs font-semibold uppercase tracking-widest">Coach Jas · ox-alpha</span>
                {coach.mode === "fallback" && <span className="text-[10px] bg-white/20 rounded-full px-2 py-0.5">rule-based</span>}
              </div>
              <h2 className="font-display text-xl font-bold mt-1">{coach.headline}</h2>
              <p className="mt-1 text-white/95 text-sm leading-relaxed">{coach.briefing}</p>
              <p className="mt-2 text-white/90 text-sm"><span className="font-semibold">Adaptation:</span> {coach.adaptation}</p>
              {coach.sources?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {coach.sources.map((s: string) => <span key={s} className="text-[10px] bg-white/15 rounded-full px-2 py-0.5">{s}</span>)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Onboarding nudges */}
        {(needsProfile || needsPlan) && (
          <div className="grid md:grid-cols-2 gap-4">
            {needsProfile && (
              <Link href="/settings" className="card flex items-center gap-4 hover:shadow-md transition-shadow group">
                <div className="w-11 h-11 rounded-xl bg-ocean-100 flex items-center justify-center text-ocean-600"><HeartPulse className="w-5 h-5" /></div>
                <div className="flex-1">
                  <div className="font-semibold">Set up your athlete profile</div>
                  <div className="text-sm text-slate-500">Age, weight, VO2max or LTHR → we build YOUR zones.</div>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-ocean-500" />
              </Link>
            )}
            {needsPlan && (
              <Link href="/training" className="card flex items-center gap-4 hover:shadow-md transition-shadow group">
                <div className="w-11 h-11 rounded-xl bg-coral-100 flex items-center justify-center text-coral-500"><Dumbbell className="w-5 h-5" /></div>
                <div className="flex-1">
                  <div className="font-semibold">Generate your training plan</div>
                  <div className="text-sm text-slate-500">Base → Build → Peak → Taper, periodized for your race.</div>
                </div>
                <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-coral-500" />
              </Link>
            )}
          </div>
        )}

        {/* Today's sessions */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-bold text-lg">Today&apos;s Training</h2>
            <Link href="/calendar" className="text-sm text-ocean-600 hover:underline flex items-center gap-1"><CalendarDays className="w-4 h-4" /> Calendar</Link>
          </div>
          {todaySessions.length === 0 ? (
            <p className="text-slate-400 text-sm py-6 text-center">
              No sessions planned today — log a workout or add one on the calendar.
            </p>
          ) : (
            <div className="space-y-3">
              {todaySessions.map((s: any) => {
                const Icon = SPORT_ICON[s.sport] || Dumbbell;
                const done = s.completed;
                return (
                  <div key={s.id} className={`flex items-center gap-3 p-3 rounded-xl border ${done ? "bg-emerald-50 border-emerald-200" : "bg-sand-100 border-sand-200"}`}>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${done ? "bg-emerald-500 text-white" : "bg-ocean-600 text-white"}`}>
                      {done ? <CheckCircle2 className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{s.title}</div>
                      <div className="text-xs text-slate-500">{fmtMin(s.durationMin)}{s.distanceKm ? ` · ${s.distanceKm} km` : ""} · {s.intensity || "Z2"}</div>
                    </div>
                    <button
                      onClick={async () => {
                        await fetch("/api/plan", {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ sessionId: s.id, completed: !done }),
                        });
                        window.location.reload();
                      }}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${done ? "bg-emerald-600 text-white" : "bg-white border border-ocean-200 text-ocean-700"}`}
                    >
                      {done ? "Completed ✓" : "Mark done"}
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
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1"><HeartPulse className="w-4 h-4" /> HRV (today)</div>
            <div className="font-display text-2xl font-bold">{latestMetric?.hrv ? `${latestMetric.hrv} ms` : "—"}</div>
            <div className="text-xs text-slate-400 mt-1">{latestMetric ? new Date(latestMetric.date).toLocaleDateString() : "Log via Whoop / Oura / manual"}</div>
          </div>
          <div className="card">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1"><Moon className="w-4 h-4" /> Sleep (7d avg)</div>
            <div className="font-display text-2xl font-bold">{latestMetric?.sleepHours ? `${latestMetric.sleepHours}h` : "—"}</div>
            <div className="text-xs text-slate-400 mt-1">Target 7-9h</div>
          </div>
          <div className="card">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1"><Dumbbell className="w-4 h-4" /> Week load</div>
            <div className="font-display text-2xl font-bold">{fmtMin(weekMinutes)}</div>
            <div className="text-xs text-slate-400 mt-1">{weekCompleted}/{Math.max(weekPlanned, 1)} sessions done</div>
          </div>
          <div className="card">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wide mb-1"><Droplets className="w-4 h-4" /> Hydration</div>
            <div className="font-display text-2xl font-bold">{Math.round(todayHydration / 100) / 10} L</div>
            <div className="text-xs text-slate-400 mt-1">Target ~3L</div>
          </div>
        </div>

        {/* Plan progress + quick actions */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2 card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display font-bold text-lg">Training Plan</h2>
              <Link href="/training" className="text-sm text-ocean-600 hover:underline flex items-center gap-1">Open <ArrowRight className="w-3.5 h-3.5" /></Link>
            </div>
            {plan ? (
              <>
                <div className="font-medium">{plan.name}</div>
                <div className="text-sm text-slate-500">Goal: {plan.distance} · {plan.weeks} weeks · {plan.level}</div>
                <div className="mt-3 bg-sand-100 rounded-full h-2.5 overflow-hidden">
                  <div className="bg-ocean-600 h-full rounded-full" style={{ width: `${completionPct}%` }} />
                </div>
                <div className="text-xs text-slate-500 mt-1.5">{completionPct}% of planned sessions completed this week</div>
              </>
            ) : (
              <div className="text-slate-400 text-sm py-4">
                No plan yet. Generate your periodized Base → Build → Peak → Taper plan in the Training section.
              </div>
            )}
          </div>
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-3">Quick Actions</h2>
            <div className="space-y-2">
              <Link href="/metrics" className="flex items-center gap-2 text-sm text-ocean-700 hover:bg-ocean-50 rounded-lg p-2"><HeartPulse className="w-4 h-4" /> Log HRV / recovery</Link>
              <Link href="/nutrition" className="flex items-center gap-2 text-sm text-ocean-700 hover:bg-ocean-50 rounded-lg p-2"><Apple className="w-4 h-4" /> Log food & water</Link>
              <Link href="/blood" className="flex items-center gap-2 text-sm text-ocean-700 hover:bg-ocean-50 rounded-lg p-2"><FlaskConical className="w-4 h-4" /> Add blood panel</Link>
              <Link href="/dna" className="flex items-center gap-2 text-sm text-ocean-700 hover:bg-ocean-50 rounded-lg p-2"><Dna className="w-4 h-4" /> Upload DNA</Link>
              <Link href="/connectors" className="flex items-center gap-2 text-sm text-ocean-700 hover:bg-ocean-50 rounded-lg p-2"><Plug className="w-4 h-4" /> Connect devices</Link>
            </div>
          </div>
        </div>
      </div>
    </ProtectedPage>
  );
}
