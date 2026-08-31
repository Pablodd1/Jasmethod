"use client";

import { useEffect, useState } from "react";
import { HeartPulse, Activity, Brain, Info } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";

export default function MetricsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ hrv: "", restingHr: "", recoveryScore: "", stressScore: "" });
  const [saved, setSaved] = useState(false);

  async function load() {
    const res = await fetch("/api/metrics?days=30");
    const d = await res.json();
    setData(d);
    setLoading(false);
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hrv: form.hrv ? parseFloat(form.hrv) : undefined,
        restingHr: form.restingHr ? parseInt(form.restingHr, 10) : undefined,
        recoveryScore: form.recoveryScore ? parseInt(form.recoveryScore, 10) : undefined,
        stressScore: form.stressScore ? parseInt(form.stressScore, 10) : undefined,
        source: "manual",
      }),
    });
    if (res.ok) {
      setSaved(true);
      setForm({ hrv: "", restingHr: "", recoveryScore: "", stressScore: "" });
      load();
      setTimeout(() => setSaved(false), 2500);
    }
  }

  const metrics = data?.metrics || [];
  const latest = metrics[metrics.length - 1];
  const readiness = data?.readiness;

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">HRV & Recovery</h1>
          <p className="text-slate-500 text-sm">Morning HRV (RMSSD) compared to your 7-day baseline — the Buchheit 2014 HRV-guided training model.</p>
        </div>

        {/* Readiness card */}
        {readiness ? (
          <div className={`rounded-3xl p-6 text-white ${readiness.score >= 65 ? "bg-gradient-to-r from-emerald-600 to-emerald-500" : readiness.score >= 40 ? "bg-gradient-to-r from-amber-500 to-amber-400" : "bg-gradient-to-r from-coral-600 to-coral-500"}`}>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold opacity-90"><Activity className="w-4 h-4" /> Today&apos;s Readiness</div>
                <div className="font-display text-4xl font-extrabold mt-1">{readiness.score}/100</div>
                <div className="text-sm mt-1">{readiness.deltaPct >= 0 ? "▲" : "▼"} {Math.abs(readiness.deltaPct)}% vs 7-day HRV baseline</div>
              </div>
              <div className="max-w-md">
                <p className="text-sm leading-relaxed">{readiness.advice}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="card flex items-center gap-3 text-slate-500">
            <Info className="w-5 h-5 text-ocean-500" />
            Log at least 3 days of HRV to unlock readiness guidance — or connect Whoop / Oura / Apple Health.
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* Log form */}
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-3">Log Today&apos;s Morning Data</h2>
            <form onSubmit={submit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">HRV (RMSSD, ms)</label>
                  <input className="input" type="number" step="0.1" value={form.hrv} onChange={(e) => setForm({ ...form, hrv: e.target.value })} placeholder="e.g. 62.4" />
                  <div className="text-[11px] text-slate-400">The standard morning recovery number, in milliseconds, from Whoop / Oura / Garmin / Apple Watch.</div>
                </div>
                <div>
                  <label className="label">Resting HR</label>
                  <input className="input" type="number" value={form.restingHr} onChange={(e) => setForm({ ...form, restingHr: e.target.value })} placeholder="e.g. 48" />
                  <div className="text-[11px] text-slate-400">Heart beats per minute, before getting out of bed.</div>
                </div>
                <div>
                  <label className="label">Recovery score</label>
                  <input className="input" type="number" value={form.recoveryScore} onChange={(e) => setForm({ ...form, recoveryScore: e.target.value })} placeholder="0-100" />
                  <div className="text-[11px] text-slate-400">If your device gives one (0–100).</div>
                </div>
              </div>
              <button type="submit" className="btn-primary w-full justify-center">Save Metrics</button>
              {saved && <div className="text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 text-center">✓ Saved</div>}
            </form>
            <p className="text-[11px] text-slate-400 mt-3">
              Tip: measure HRV within 5 min of waking, same position daily. The 7-day rolling baseline is what matters — not a single reading.
            </p>
            <p className="text-[11px] text-slate-400 mt-1">
              🌙 Sleep is logged once, in the <a href="/sleep" className="underline">Sleep tab</a> — it feeds the same daily record.
            </p>
          </div>

          {/* History */}
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-3">Last 14 Days</h2>
            {metrics.length === 0 ? (
              <p className="text-slate-400 text-sm py-6 text-center">No data yet.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {metrics.slice(-14).reverse().map((m: any) => (
                  <div key={m.id} className="flex items-center gap-3 text-sm p-2 rounded-lg hover:bg-sand-100">
                    <div className="w-24 text-slate-500">{new Date(m.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
                    <div className="flex-1 flex gap-4">
                      <span className="flex items-center gap-1"><HeartPulse className="w-3.5 h-3.5 text-ocean-500" /> {m.hrv ? `${m.hrv} ms` : "—"}</span>
                      <span className="flex items-center gap-1"><Activity className="w-3.5 h-3.5 text-emerald-500" /> RHR {m.restingHr || "—"}</span>
                      {m.recoveryScore != null && <span className="text-slate-500">Rec {m.recoveryScore}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Science note */}
        <div className="card bg-ocean-50 border-ocean-200">
          <div className="flex gap-3">
            <Brain className="w-5 h-5 text-ocean-600 shrink-0 mt-0.5" />
            <div className="text-sm text-ocean-900">
              <strong>The science:</strong> HRV is your body&apos;s &ldquo;rest-and-repair&rdquo; gauge (the parasympathetic system). When your morning HRV drops more than one normal day-to-day swing below your 7-day baseline, training quality and immune function suffer — keep it easy that day (Plews et al. 2013, Front Physiol; Buchheit 2014). Elite cyclists show HRV-guided training outperforms fixed plans.
            </div>
          </div>
        </div>
      </div>
    </ProtectedPage>
  );
}
