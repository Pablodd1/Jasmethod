"use client";

// HYROX Race Split Planner — target time -> 16-segment pacing plan; log actual
// splits after the race -> weak-station analysis + next-block emphasis.
import { useEffect, useState } from "react";
import { Layers, Target, Trophy, Info } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";

export default function HyroxPage() {
  const { user } = useAuth();
  const lang = (user?.language || "es") as string;
  const es = lang === "es";
  const [target, setTarget] = useState("75");
  const [pace, setPace] = useState("");
  const [sex, setSex] = useState("male");
  const [plan, setPlan] = useState<any>(null);
  const [actuals, setActuals] = useState<string[]>(Array(16).fill(""));
  const [analysis, setAnalysis] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  async function loadPlan() {
    setBusy(true);
    const q = new URLSearchParams({ target, ...(pace ? { pace } : {}), sex });
    const res = await fetch(`/api/hyrox/split-planner?${q}`);
    if (res.ok) setPlan((await res.json()).plan);
    setBusy(false);
  }
  useEffect(() => { if (user) loadPlan(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user]);

  async function analyze() {
    setBusy(true);
    const res = await fetch("/api/hyrox/split-planner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, pace: pace || undefined, sex, actualSecs: actuals.map((a) => Number(a) || 0) }),
    });
    const d = await res.json();
    if (res.ok) { setPlan(d.plan); setAnalysis(d.analysis); }
    setBusy(false);
  }

  const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

  return (
    <ProtectedPage>
      <div className="space-y-5 max-w-4xl mx-auto">
        <div>
          <p className="text-xs uppercase tracking-widest text-slate-400">HYROX · 8 runs + 8 stations</p>
          <h1 className="font-display text-3xl font-bold">{es ? "Planificador de parciales" : "Race Split Planner"}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {es
              ? "Tu tiempo objetivo convertido en un plan de 16 segmentos (8 carreras + 8 estaciones). Tras la carrera, registra tus parciales reales y te decimos dónde se perdió la carrera."
              : "Your target finish converted into a 16-segment plan (8 runs + 8 stations). After the race, log your real splits and we show you where the race was lost."}
          </p>
        </div>

        {/* Controls */}
        <div className="card grid sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="label">{es ? "Objetivo (min)" : "Target (min)"}</label>
            <input className="input" type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="75" />
          </div>
          <div>
            <label className="label">{es ? "Ritmo 1km (seg/km)" : "1km pace (sec/km)"}</label>
            <input className="input" type="number" value={pace} onChange={(e) => setPace(e.target.value)} placeholder={es ? "auto de tu perfil" : "auto from profile"} />
          </div>
          <div>
            <label className="label">{es ? "División" : "Division"}</label>
            <select className="input" value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="male">{es ? "Open / Pro hombres" : "Open / Pro men"}</option>
              <option value="female">{es ? "Open / Pro mujeres" : "Open / Pro women"}</option>
            </select>
          </div>
          <button onClick={loadPlan} disabled={busy} className="btn-primary justify-center">
            <Target className="w-4 h-4" /> {es ? "Calcular plan" : "Build plan"}
          </button>
        </div>

        {/* Plan table */}
        {plan && (
          <div className="card !p-0 overflow-hidden">
            <div className="p-4 border-b border-sand-200 flex items-center justify-between flex-wrap gap-2">
              <div className="font-display font-bold flex items-center gap-2"><Layers className="w-5 h-5 text-ocean-600" /> {es ? "Plan de parciales" : "Split plan"}</div>
              <div className="text-xs text-slate-500">{plan.notes[0]}</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-slate-400 text-xs uppercase">
                    <th className="p-2">#</th><th className="p-2">{es ? "Segmento" : "Segment"}</th>
                    <th className="p-2">{es ? "Objetivo" : "Target"}</th><th className="p-2">{es ? "Acumulado" : "Checkpoint"}</th>
                    <th className="p-2 w-28">{es ? "Real (s)" : "Actual (s)"}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.segments.map((seg: any, i: number) => (
                    <tr key={seg.n} className={`border-t border-sand-100 ${seg.kind === "station" ? "bg-sand-50/50" : ""}`}>
                      <td className="p-2 text-slate-400">{seg.n}</td>
                      <td className="p-2 font-medium">{seg.name}</td>
                      <td className="p-2 tabular-nums">{fmt(seg.targetSec)}</td>
                      <td className="p-2 tabular-nums text-slate-500">{fmt(seg.cumulativeSec)}</td>
                      <td className="p-2">
                        <input
                          className="input !py-1 text-xs tabular-nums"
                          type="number"
                          value={actuals[i]}
                          onChange={(e) => setActuals((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                          placeholder="—"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-sand-200 flex justify-end">
              <button onClick={analyze} disabled={busy} className="btn-primary">
                <Trophy className="w-4 h-4" /> {es ? "Analizar mis parciales" : "Analyze my splits"}
              </button>
            </div>
          </div>
        )}

        {/* Weak-station analysis */}
        {analysis && (
          <div className="card border-coral-200">
            <div className="font-display font-bold mb-1">{es ? "Análisis post-carrera" : "Post-race analysis"}</div>
            <p className="text-sm text-slate-700">{analysis.summary}</p>
            <div className="mt-3 space-y-1.5">
              {analysis.stationGaps.slice(0, 3).map((g: any) => (
                <div key={g.key} className={`rounded-xl px-3 py-2 ${g.deltaSec > 0 ? "bg-coral-50 border border-coral-200" : "bg-emerald-50 border border-emerald-200"}`}>
                  <div className="text-sm font-semibold">
                    {g.deltaSec > 0 ? "✗" : "✓"} {g.name}: {fmt(g.actualSec)} {es ? "vs" : "vs"} {fmt(g.targetSec)} ({g.deltaSec >= 0 ? "+" : ""}{g.deltaSec}s · {g.pctOfTotalLoss}% {es ? "del tiempo perdido" : "of lost time"})
                  </div>
                  {g.deltaSec > 0 && g.advice && <div className="text-xs text-slate-600 mt-1">💪 {es ? "Énfasis del próximo bloque: " : "Next block emphasis: "}{g.advice}</div>}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-3 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {es
                ? "Regla 2026/27: cada estación debe cumplir el estándar completo de movimiento — penalizaciones con sandbag en algunas faltas, pero estación incompleta = descalificación."
                : "2026/27 rule: every station must meet full movement standard — sandbag penalties on some faults, incomplete station = DQ."}
            </p>
          </div>
        )}
      </div>
    </ProtectedPage>
  );
}
