"use client";

import { useEffect, useState } from "react";
import { Dumbbell, Waves, Bike, Zap, Sparkles, Layers, HeartPulse } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { HR_ZONES, intensityDistribution } from "@/lib/science";

const SPORT_ICON: Record<string, any> = { swim: Waves, bike: Bike, run: Zap, strength: Dumbbell, brick: Zap, recovery: HeartPulse };

function fmtMin(min: number) {
  if (min >= 60) return `${Math.floor(min / 60)}h ${min % 60 ? `${min % 60}m` : ""}`;
  return `${min}m`;
}

export default function TrainingPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({ distance: "olympic", weeks: "12", startDate: new Date().toISOString().slice(0, 10) });
  const [error, setError] = useState("");
  const [zones, setZones] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  async function load() {
    const [p, z] = await Promise.all([
      fetch("/api/plan").then((r) => r.json()),
      fetch("/api/profile").then((r) => r.json()),
    ]);
    setPlans(p.plans || []);
    setZones(z.zones);
    setProfile(z.profile);
    setLoading(false);
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function toggleComplete(session: any) {
    await fetch("/api/plan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, completed: !session.completed }),
    });
    load();
  }

  const plan = plans[0];
  const sessions = plan?.days?.flatMap((d: any) => d.sessions) || [];
  const completedCount = sessions.filter((s: any) => s.completed).length;
  const totalCount = sessions.length;
  const dist = plan ? intensityDistribution(plan.level) : null;

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Training Plan</h1>
            <p className="text-slate-500 text-sm">Periodized Base → Build → Peak → Taper. Built on Seiler&apos;s 80/20 model and Billat&apos;s vVO2max research.</p>
          </div>
          <span className="chip chip-z2"><Layers className="w-3.5 h-3.5" /> {completedCount}/{totalCount} sessions</span>
        </div>

        {/* Generator */}
        <div className="card">
          <h2 className="font-display font-bold text-lg mb-1">Generate a New Plan</h2>
          <p className="text-sm text-slate-500 mb-4">
            {profile?.lthr ? `Your LTHR: ${profile.lthr} bpm — sessions anchored to your physiology.` : "Complete your profile to auto-estimate VO2max and LTHR; otherwise we'll use standard estimates."}
          </p>
          <form onSubmit={generate} className="grid md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="label">Race distance</label>
              <select className="input" value={form.distance} onChange={(e) => setForm({ ...form, distance: e.target.value })}>
                <option value="sprint">Sprint (750m / 20km / 5km)</option>
                <option value="olympic">Olympic (1.5k / 40k / 10k)</option>
                <option value="half">Half Ironman (1.9k / 90k / 21.1k)</option>
                <option value="full">Full Ironman (3.8k / 180k / 42.2k)</option>
              </select>
            </div>
            <div>
              <label className="label">Weeks</label>
              <select className="input" value={form.weeks} onChange={(e) => setForm({ ...form, weeks: e.target.value })}>
                {[8, 12, 16, 20, 24].map((w) => <option key={w} value={w}>{w} weeks</option>)}
              </select>
            </div>
            <div>
              <label className="label">Start date</label>
              <input type="date" className="input" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <button type="submit" disabled={generating} className="btn-primary justify-center">
              {generating ? "Building plan…" : <><Sparkles className="w-4 h-4" /> Generate Plan</>}
            </button>
          </form>
          {error && <div className="text-sm text-coral-600 mt-3 bg-coral-50 rounded-lg px-3 py-2">{error}</div>}
        </div>

        {/* Zone table */}
        {zones?.hr && (
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-3">Your Training Zones</h2>
            <div className="grid md:grid-cols-7 gap-2">
              {HR_ZONES.map((z) => {
                const r = zones.hr[z.key];
                return (
                  <div key={z.key} className="rounded-xl border border-sand-200 p-3 text-center">
                    <div className={`chip ${`chip-${z.key}`} mx-auto`}>{z.name}</div>
                    <div className="font-display text-lg font-bold mt-2">{r.low}-{r.high}</div>
                    <div className="text-[10px] text-slate-400 uppercase">bpm</div>
                    <div className="text-[11px] text-slate-500 mt-1 leading-tight">{z.description}</div>
                  </div>
                );
              })}
            </div>
            {zones.power && (
              <div className="mt-3 text-sm text-slate-500">
                Power zones anchored on FTP {zones.anchorPower} W · {zones.power.z1.low}-{zones.power.z7.high} W range
              </div>
            )}
          </div>
        )}

        {/* Intensity distribution */}
        {dist && (
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-1">Intensity Distribution</h2>
            <p className="text-xs text-slate-400 mb-3">Seiler&apos;s 80/20 polarized model — most volume easy, a little very hard, almost nothing in between.</p>
            <div className="flex gap-1 h-6 rounded-full overflow-hidden">
              <div className="bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${dist.zone1}%` }}>Z1-2 {dist.zone1}%</div>
              <div className="bg-amber-400 flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${dist.zone2}%` }}>Z3 {dist.zone2}%</div>
              <div className="bg-red-500 flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${dist.zone3}%` }}>Z4+ {dist.zone3}%</div>
            </div>
          </div>
        )}

        {/* Plan view */}
        {plan ? (
          <div className="space-y-4">
            {plan.days.map((day: any) => (
              <div key={day.id} className="card">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-slate-500">
                    Week {day.week} · {new Date(day.date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                  </div>
                  <span className="chip chip-z2">Theme: {day.week <= Math.ceil(plan.weeks * 0.5) ? "Aerobic Foundation" : day.week <= Math.ceil(plan.weeks * 0.8) ? "Threshold & Speed" : day.week <= Math.ceil(plan.weeks * 0.92) ? "Race Simulation" : "Freshness & Taper"}</span>
                </div>
                {day.sessions.map((s: any) => {
                  const Icon = SPORT_ICON[s.sport] || Dumbbell;
                  const done = s.completed;
                  return (
                    <div key={s.id} className={`flex items-center gap-3 p-2.5 rounded-xl mb-1.5 ${done ? "bg-emerald-50 border border-emerald-200" : "hover:bg-sand-100"}`}>
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${done ? "bg-emerald-500 text-white" : "bg-ocean-100 text-ocean-700"}`}>
                        <Icon className="w-4.5 h-4.5 w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm truncate">{s.title}</div>
                        <div className="text-xs text-slate-500 truncate">{fmtMin(s.durationMin)}{s.distanceKm ? ` · ${s.distanceKm} km` : ""} · {s.intensity} · {s.type}</div>
                      </div>
                      <span className={`chip ${`chip-${s.intensity || "z2"}`} hidden sm:inline-flex`}>{s.intensity || "Z2"}</span>
                      <button onClick={() => toggleComplete(s)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${done ? "bg-emerald-600 text-white" : "bg-white border border-ocean-200 text-ocean-700"}`}>
                        {done ? "✓" : "Done"}
                      </button>
                    </div>
                  );
                })}
                {day.notes && <p className="text-xs text-slate-400 mt-2 italic">{day.notes}</p>}
              </div>
            ))}
          </div>
        ) : (
          <div className="card text-center py-16 text-slate-400">
            <Dumbbell className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-500">No training plan yet</p>
            <p className="text-sm">Choose your distance and generate your personalized plan above.</p>
          </div>
        )}
      </div>
    </ProtectedPage>
  );
}
