"use client";

import { useEffect, useState } from "react";
import { Moon, MoonStar, Sunrise, AlertCircle } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { t, type Lang } from "@/lib/i18n";

export default function SleepPage() {
  const { user } = useAuth();
  const lang = (user?.language || "es") as Lang;
  const [sleep, setSleep] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), hours: "", quality: "", deepHours: "" });
  const [saved, setSaved] = useState(false);

  async function load() {
    const res = await fetch("/api/sleep?days=30");
    const d = await res.json();
    setSleep(d.sleep || []);
    setLoading(false);
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/sleep", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: form.date,
        hours: form.hours ? parseFloat(form.hours) : undefined,
        quality: form.quality ? parseInt(form.quality, 10) : undefined,
        deepHours: form.deepHours ? parseFloat(form.deepHours) : undefined,
      }),
    });
    if (res.ok) {
      setSaved(true);
      setForm({ ...form, hours: "", quality: "", deepHours: "" });
      load();
      setTimeout(() => setSaved(false), 2500);
    }
  }

  const avg = sleep.length ? (sleep.reduce((a, s) => a + s.hours, 0) / sleep.length).toFixed(1) : "—";

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">{t(lang, "sleep.title")}</h1>
          <p className="text-slate-500 text-sm">Sleep is the #1 recovery intervention — growth hormone release, tissue repair and motor learning all consolidate during deep sleep (Fullagar 2015, Sports Med).</p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="card text-center">
            <Moon className="w-5 h-5 text-indigo-500 mx-auto mb-1" />
            <div className="font-display text-2xl font-bold">{avg}h</div>
            <div className="text-xs text-slate-400">{t(lang, "sleep.30dAvg")}</div>
          </div>
          <div className="card text-center">
            <MoonStar className="w-5 h-5 text-violet-500 mx-auto mb-1" />
            <div className="font-display text-2xl font-bold">{sleep.filter((s) => s.hours >= 7).length}/{sleep.length}</div>
            <div className="text-xs text-slate-400">{t(lang, "sleep.nights7h")}</div>
          </div>
          <div className="card text-center">
            <Sunrise className="w-5 h-5 text-amber-500 mx-auto mb-1" />
            <div className="font-display text-2xl font-bold">{sleep.length ? `${Math.round(sleep.reduce((a, s) => a + (s.quality || 0), 0) / sleep.length)}` : "—"}</div>
            <div className="text-xs text-slate-400">{t(lang, "sleep.avgQuality")}</div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-3">{t(lang, "sleep.logLastNight")}</h2>
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="label">{t(lang, "sleep.date")}</label>
                <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">{t(lang, "sleep.hours")}</label>
                  <input className="input" type="number" step="0.1" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} placeholder="7.5" />
                </div>
                <div>
                  <label className="label">{t(lang, "sleep.quality")}</label>
                  <input className="input" type="number" min="1" max="10" value={form.quality} onChange={(e) => setForm({ ...form, quality: e.target.value })} placeholder="8" />
                </div>
                <div>
                  <label className="label">{t(lang, "sleep.deep")}</label>
                  <input className="input" type="number" step="0.1" value={form.deepHours} onChange={(e) => setForm({ ...form, deepHours: e.target.value })} placeholder="1.5" />
                </div>
              </div>
              <button type="submit" className="btn-primary w-full justify-center">{t(lang, "sleep.save")}</button>
              {saved && <div className="text-sm text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2 text-center">{t(lang, "sleep.saved")}</div>}
            </form>
          </div>

          <div className="card">
            <h2 className="font-display font-bold text-lg mb-3">{t(lang, "sleep.history")}</h2>
            {sleep.length === 0 ? (
              <p className="text-slate-400 text-sm py-6 text-center">No sleep logged yet. Import from Whoop / Oura / Apple Health in Connectors.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {sleep.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 text-sm p-2 rounded-lg hover:bg-sand-100">
                    <div className="w-28 text-slate-500">{new Date(s.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</div>
                    <div className="font-semibold w-14">{s.hours}h</div>
                    {s.deepHours != null && <div className="text-xs text-slate-400">deep {s.deepHours}h</div>}
                    {s.quality != null && (
                      <div className="ml-auto chip chip-z2">{s.quality}/10</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card bg-amber-50 border-amber-200">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <strong>{t(lang, "sleep.coachNote")}</strong> Sleep extension (9h vs 7h) improves sprint times and mood in athletes (Mah et al. 2011). Aim for consistent bed/wake times ±30 min — irregular sleep hurts performance as much as a bad training week.
            </div>
          </div>
        </div>
      </div>
    </ProtectedPage>
  );
}
