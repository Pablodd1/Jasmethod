"use client";

import { useEffect, useState } from "react";
import { Dumbbell, Waves, Bike, Zap, Sparkles, Layers, HeartPulse, ChevronDown, ChevronUp, CloudSun, Pencil, Save, X } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { dayOffProtocol, analyzeHydration } from "@/lib/adaptive";

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
  const [form, setForm] = useState({ distance: "olympic", weeks: "12", startDate: new Date().toISOString().slice(0, 10), easyPct: "70" });
  const [error, setError] = useState("");
  const [zones, setZones] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Record<string, { title: string; durationMin: string; intensity: string; preWeightKg: string; postWeightKg: string }>>({});

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

  async function api(body: any) {
    const res = await fetch("/api/plan", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    return data;
  }

  async function toggleComplete(session: any) {
    try { await api({ sessionId: session.id, completed: !session.completed }); } catch (e: any) { setError(e.message); }
    load();
  }

  async function toggleDayOff(day: any) {
    try { await api({ planDayId: day.id, dayOff: !day.dayOff }); } catch (e: any) { setError(e.message); }
    load();
  }

  async function saveEdit(sessionId: string) {
    const f = editing[sessionId];
    if (!f) return;
    try {
      await api({
        sessionId,
        title: f.title,
        durationMin: parseInt(f.durationMin, 10) || 30,
        intensity: f.intensity,
        ...(f.preWeightKg ? { preWeightKg: f.preWeightKg } : {}),
        ...(f.postWeightKg ? { postWeightKg: f.postWeightKg } : {}),
      });
      setEditing((prev) => { const n = { ...prev }; delete n[sessionId]; return n; });
    } catch (e: any) {
      setError(e.message);
    }
    load();
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  function startEdit(s: any) {
    setEditing((prev) => ({ ...prev, [s.id]: { title: s.title, durationMin: String(s.durationMin), intensity: s.intensity || "z2", preWeightKg: s.preWeightKg ? String(s.preWeightKg) : "", postWeightKg: s.postWeightKg ? String(s.postWeightKg) : "" } }));
  }

  const plan = plans[0];
  const sessions = plan?.days?.flatMap((d: any) => d.sessions) || [];
  const completedCount = sessions.filter((s: any) => s.completed).length;
  const totalCount = sessions.length;
  const easyMin = sessions.filter((s: any) => s.intensity === "z1" || s.intensity === "z2").reduce((a: number, s: any) => a + s.durationMin, 0);
  const totalMin = sessions.reduce((a: number, s: any) => a + s.durationMin, 0);
  const actualEasy = totalMin ? Math.round((easyMin / totalMin) * 100) : null;
  const targetEasy = plan?.easyPct ?? 70;

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">Training Plan</h1>
            <p className="text-slate-500 text-sm">Periodized Base → Build → Peak → Taper. Default 70/30 easy-to-quality split — adjust the slider and fine-tune sessions by hand.</p>
          </div>
          <span className="chip chip-z2"><Layers className="w-3.5 h-3.5" /> {completedCount}/{totalCount} sessions</span>
        </div>

        {/* Generator */}
        <div className="card">
          <h2 className="font-display font-bold text-lg mb-1">Generate a New Plan</h2>
          <p className="text-sm text-slate-500 mb-4">
            {profile?.lthr ? `Your LTHR: ${profile.lthr} bpm — sessions anchored to your physiology.` : "Complete your profile to auto-estimate VO2max and LTHR; otherwise we'll use standard estimates."}
          </p>
          <form onSubmit={generate} className="grid md:grid-cols-5 gap-4 items-end">
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
            <div>
              <label className="label">Easy / quality split: {form.easyPct}% / {100 - Number(form.easyPct)}%</label>
              <input type="range" min={50} max={85} step={5} className="w-full accent-cyan-600" value={form.easyPct} onChange={(e) => setForm({ ...form, easyPct: e.target.value })} />
              <div className="text-[10px] text-slate-400 mt-0.5">% of weekly minutes in Z1-Z2 (easy). 70 = 70/30.</div>
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
              {[["z1", "Active Recovery"], ["z2", "Aerobic"], ["z3", "Tempo"], ["z4", "Sub-LT"], ["z5", "LT"], ["z6", "VO2max"], ["z7", "Anaerobic"]].map(([key, name]) => {
                const r = zones.hr[key];
                return (
                  <div key={key} className="rounded-xl border border-sand-200 p-3 text-center">
                    <div className={`chip ${`chip-${key}`} mx-auto`}>{name}</div>
                    <div className="font-display text-lg font-bold mt-2">{r.low}-{r.high}</div>
                    <div className="text-[10px] text-slate-400 uppercase">bpm</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Intensity distribution — target vs actual */}
        {plan && actualEasy !== null && (
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-1">Intensity Distribution</h2>
            <p className="text-xs text-slate-400 mb-3">Your target: {targetEasy}% easy / {100 - targetEasy}% quality · Actual in this plan: {actualEasy}% easy / {100 - actualEasy}% quality (peak/taper weeks keep race-specific work).</p>
            <div className="flex gap-1 h-6 rounded-full overflow-hidden">
              <div className="bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${actualEasy}%` }}>Easy {actualEasy}%</div>
              <div className="bg-red-500 flex items-center justify-center text-[10px] font-bold text-white" style={{ width: `${100 - actualEasy}%` }}>Quality {100 - actualEasy}%</div>
            </div>
            <div className="flex gap-1 h-1.5 mt-1 rounded-full overflow-hidden opacity-60">
              <div className="bg-slate-300" style={{ width: `${targetEasy}%` }} />
              <div className="bg-slate-400" style={{ width: `${100 - targetEasy}%` }} />
            </div>
            <div className="text-[10px] text-slate-400 mt-1">▁ target marker</div>
          </div>
        )}

        {/* Plan view */}
        {plan ? (
          <div className="space-y-4">
            {plan.days.map((day: any) => {
              const off = day.dayOff;
              const prot = dayOffProtocol(new Date(day.date));
              const isExpanded = expanded.has(day.id);
              return (
                <div key={day.id} className={`card ${off ? "border-dashed border-slate-300 bg-slate-50" : ""}`}>
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="text-sm font-semibold text-slate-500">
                      Week {day.week} · {new Date(day.date).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleDayOff(day)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${off ? "bg-ocean-600 text-white" : "bg-white border border-ocean-200 text-ocean-700"}`}
                      >
                        <CloudSun className="w-3.5 h-3.5 inline mr-1" />{off ? "Resume training" : "Day off"}
                      </button>
                    </div>
                  </div>

                  {off ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="font-semibold text-sm text-slate-700">☁️ {prot.title}</div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{prot.description}</p>
                      <p className="text-[11px] text-slate-400 mt-2 italic">A day off is NOT zero — 20 min Z1 keeps blood flow + the habit alive, breathing drives recovery. Planned sessions for this day are skipped.</p>
                    </div>
                  ) : (
                    <div>
                      {day.sessions.map((s: any) => {
                        const Icon = SPORT_ICON[s.sport] || Dumbbell;
                        const done = s.completed;
                        const edit = editing[s.id];
                        return (
                          <div key={s.id} className={`rounded-xl mb-1.5 ${done ? "bg-emerald-50 border border-emerald-200" : "hover:bg-sand-100"}`}>
                            <div className="flex items-center gap-3 p-2.5">
                              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${done ? "bg-emerald-500 text-white" : "bg-ocean-100 text-ocean-700"}`}>
                                <Icon className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm truncate">{s.title}</div>
                                <div className="text-xs text-slate-500 truncate">{fmtMin(s.durationMin)}{s.distanceKm ? ` · ${s.distanceKm} km` : ""} · {s.intensity} · {s.type}</div>
                              </div>
                              <span className={`chip ${`chip-${s.intensity || "z2"}`} hidden sm:inline-flex`}>{s.intensity || "Z2"}</span>
                              <button onClick={() => startEdit(s)} className="text-xs p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" title="Edit session">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => toggleExpand(s.id)} className="text-xs p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" title="Details">
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                              <button onClick={() => toggleComplete(s)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${done ? "bg-emerald-600 text-white" : "bg-white border border-ocean-200 text-ocean-700"}`}>
                                {done ? "✓" : "Done"}
                              </button>
                            </div>

                            {isExpanded && (
                              <div className="px-3 pb-3 -mt-1 space-y-2">
                                {day.notes && <p className="text-xs text-slate-600 leading-relaxed border-l-2 border-ocean-200 pl-2">{day.notes}</p>}
                                {s.recovery && <p className="text-[11px] text-slate-400 leading-relaxed">🧘 {s.recovery}</p>}
                                {s.preWeightKg && s.postWeightKg && (() => {
                                  const h = analyzeHydration(s.preWeightKg, s.postWeightKg);
                                  return <p className={`text-[11px] leading-relaxed rounded-lg px-2 py-1.5 ${h.flag === "severe" ? "bg-coral-50 text-coral-700" : h.flag === "high" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>💧 {h.advice}</p>;
                                })()}
                              </div>
                            )}

                            {edit && (
                              <div className="px-3 pb-3 -mt-1 flex flex-wrap items-end gap-2">
                                <div className="flex-1 min-w-40">
                                  <label className="label">Title</label>
                                  <input className="input" value={edit.title} onChange={(e) => setEditing((p) => ({ ...p, [s.id]: { ...p[s.id], title: e.target.value } }))} />
                                </div>
                                <div className="w-24">
                                  <label className="label">Min</label>
                                  <input type="number" className="input" value={edit.durationMin} onChange={(e) => setEditing((p) => ({ ...p, [s.id]: { ...p[s.id], durationMin: e.target.value } }))} />
                                </div>
                                <div className="w-28">
                                  <label className="label">Intensity</label>
                                  <select className="input" value={edit.intensity} onChange={(e) => setEditing((p) => ({ ...p, [s.id]: { ...p[s.id], intensity: e.target.value } }))}>
                                    {["z1", "z2", "z3", "z4", "z5", "z6", "z7"].map((z) => <option key={z} value={z}>{z.toUpperCase()}</option>)}
                                  </select>
                                </div>
                                <div className="w-24">
                                  <label className="label">Pre kg</label>
                                  <input type="number" step="0.1" className="input" value={edit.preWeightKg} onChange={(e) => setEditing((p) => ({ ...p, [s.id]: { ...p[s.id], preWeightKg: e.target.value } }))} placeholder="e.g. 74.2" />
                                </div>
                                <div className="w-24">
                                  <label className="label">Post kg</label>
                                  <input type="number" step="0.1" className="input" value={edit.postWeightKg} onChange={(e) => setEditing((p) => ({ ...p, [s.id]: { ...p[s.id], postWeightKg: e.target.value } }))} placeholder="e.g. 73.4" />
                                </div>
                                <button onClick={() => saveEdit(s.id)} className="btn-primary text-xs px-3 py-2"><Save className="w-3.5 h-3.5 inline mr-1" />Save</button>
                                <button onClick={() => setEditing((p) => { const n = { ...p }; delete n[s.id]; return n; })} className="text-xs p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card text-center py-16 text-slate-400">
            <Dumbbell className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-500">No training plan yet</p>
            <p className="text-sm">Choose your distance, set your 70/30 split, and generate your personalized plan above.</p>
          </div>
        )}
      </div>
    </ProtectedPage>
  );
}
