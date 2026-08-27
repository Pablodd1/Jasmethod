"use client";

import { useEffect, useState } from "react";
import { Bike, Footprints, Waves, HeartPulse, Gauge, Zap, Shield, BookOpen, RefreshCw } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";

const CAT_ICON: Record<string, any> = {
  power: Gauge, aero: Zap, pacing: RefreshCw, heart: HeartPulse, swim: Waves, equipment: Bike, data: Shield,
};

const TOGGLES: { key: string; label: string; icon: any }[] = [
  { key: "hasBikePowerMeter", label: "Bike power meter", icon: Gauge },
  { key: "hasRunPowerMeter", label: "Run power meter (Stryd)", icon: Footprints },
  { key: "hasBikeComputer", label: "Bike computer", icon: Bike },
  { key: "hasAeroBars", label: "Aero bars", icon: Zap },
  { key: "hasHrm", label: "Chest HR strap", icon: HeartPulse },
  { key: "hasGpsWatch", label: "GPS multisport watch", icon: Shield },
  { key: "hasSwimPaceTool", label: "Swim pacing tool", icon: Waves },
  { key: "hasSmartTrainer", label: "Smart trainer", icon: RefreshCw },
  { key: "hasCadenceSensor", label: "Cadence sensor", icon: Gauge },
];

export default function GearPage() {
  const { user } = useAuth();
  const [advice, setAdvice] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [showSources, setShowSources] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const res = await fetch("/api/gear");
    const d = await res.json();
    setAdvice(d.advice || []);
    setSources(d.sources || []);
    setProfile(d.profile || {});
    setLoading(false);
  }
  useEffect(() => { if (user) load(); }, [user]);

  async function toggle(key: string, val: boolean) {
    setProfile((p: any) => ({ ...p, [key]: val }));
    await fetch("/api/gear", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [key]: val }) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    load();
  }

  if (loading) return (<ProtectedPage><div className="flex justify-center py-32"><div className="w-8 h-8 border-4 border-ocean-600 border-t-transparent rounded-full animate-spin" /></div></ProtectedPage>);

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Gear Lab — Measure Everything</h1>
          <p className="text-slate-500 text-sm mt-1">Every recommendation is grounded in peer-reviewed research. Tick what you own — the smart coach fills the gaps.</p>
        </div>

        {/* Measurement stack toggles */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-bold text-lg">Your measurement stack</h2>
            {saved && <span className="text-emerald-600 text-xs font-semibold">✓ Saved</span>}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {TOGGLES.map((t) => {
              const Icon = t.icon;
              const on = profile[t.key];
              return (
                <button key={t.key} onClick={() => toggle(t.key, !on)}
                  className={`flex items-center gap-2 p-3 rounded-xl border text-sm transition-all ${on ? "bg-ocean-600 text-white border-ocean-600" : "bg-white border-sand-200 text-slate-600 hover:border-ocean-300"}`}>
                  <Icon className="w-4 h-4" /> {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Smart coach gear advice */}
        <div>
          <h2 className="font-display font-bold text-lg mb-3">Smart coach recommendations</h2>
          {advice.length === 0 ? (
            <div className="card text-slate-400 text-sm">Complete your profile (goal, FTP, paces) to unlock gear recommendations.</div>
          ) : (
            <div className="space-y-3">
              {advice.map((a) => {
                const Icon = CAT_ICON[a.category] || Bike;
                return (
                  <div key={a.id} className="card border-l-4" style={{ borderLeftColor: a.priority === 1 ? "#0891b2" : a.priority === 2 ? "#0f766e" : "#64748b" }}>
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-lg bg-ocean-100 flex items-center justify-center text-ocean-600 shrink-0"><Icon className="w-4 h-4" /></div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{a.title}</span>
                          {a.priority === 1 && <span className="text-[10px] bg-ocean-600 text-white rounded-full px-2 py-0.5">DO FIRST</span>}
                        </div>
                        <p className="text-sm text-slate-600 mt-1">{a.advice}</p>
                        {a.sourceIds.length > 0 && (
                          <div className="mt-2 text-[11px] text-slate-400">
                            {sources.filter((s: any) => a.sourceIds.includes(s.id)).map((s: any) => (
                              <div key={s.id} className="flex items-start gap-1">
                                <BookOpen className="w-3 h-3 mt-0.5 shrink-0 text-ocean-500" />
                                <span><strong>{s.claim}</strong> — {s.ref} <span className="text-ocean-500">[{s.level}]</span></span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* All evidence */}
        <button onClick={() => setShowSources(!showSources)} className="text-sm text-ocean-600 hover:underline flex items-center gap-1">
          <BookOpen className="w-4 h-4" /> {showSources ? "Hide" : "Show"} all training & equipment evidence ({sources.length} sources)
        </button>
        {showSources && (
          <div className="card space-y-1.5">
            {sources.map((s: any) => (
              <div key={s.id} className="text-xs text-slate-600 flex gap-2">
                <span className="w-5 shrink-0 font-bold text-ocean-600">{s.level}</span>
                <span><strong>{s.claim}</strong> — {s.ref} · <em>{s.population}</em></span>
              </div>
            ))}
          </div>
        )}
      </div>
    </ProtectedPage>
  );
}
