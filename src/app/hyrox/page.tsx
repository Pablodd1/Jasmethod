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
  const [pro, setPro] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<any>(null);
  const [actuals, setActuals] = useState<string[]>(Array(16).fill(""));
  const [analysis, setAnalysis] = useState<any>(null);
  const [busy, setBusy] = useState(false);


  async function loadPlan() {
    if (busy) return;
    setBusy(true); setError(""); setPlan(null); setAnalysis(null);
    try {
      const q = new URLSearchParams({ target, ...(pace ? { pace } : {}), sex, pro: pro ? "1" : "0" });
      const res = await fetch(`/api/hyrox/split-planner?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to build the scenario.");
      setPlan(data.plan);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to build the scenario. Try again."); }
    finally { setBusy(false); }
  }
  // Do not fabricate a scenario on first visit: the athlete confirms target and division.
  useEffect(() => { setPlan(null); setAnalysis(null); setError(""); }, [target, pace, sex, pro]);

  async function analyze() {
    if (busy) return;
    setBusy(true); setError(""); setAnalysis(null);
    try {
      const res = await fetch("/api/hyrox/split-planner", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, pace: pace || undefined, sex, pro, actualSecs: actuals.map(a => a.trim() === "" ? null : a) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to analyze splits.");
      setPlan(data.plan); setAnalysis(data.analysis);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to analyze splits. Try again."); }
    finally { setBusy(false); }
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
              ? "Explora un escenario de 16 segmentos, no una predicción validada. Registra los parciales disponibles para compararlos; los campos vacíos son datos faltantes."
              : "Explore a 16-segment scenario, not a validated prediction. Log available splits to compare them; blank fields remain missing data."}
          </p>
        </div>

        {/* Controls */}
        <div className="card grid sm:grid-cols-5 gap-3 items-end">
          <div>
            <label htmlFor="hyrox-target" className="label">{es ? "Objetivo (min)" : "Target (min)"}</label>
            <input id="hyrox-target" disabled={busy} min="1" className="input" type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="75" />
          </div>
          <div>
            <label htmlFor="hyrox-pace" className="label">{es ? "Ritmo 1km (seg/km)" : "1km pace (sec/km)"}</label>
            <input id="hyrox-pace" disabled={busy} min="1" className="input" type="number" value={pace} onChange={(e) => setPace(e.target.value)} placeholder={es ? "umbral guardado o ritmo manual" : "saved threshold or manual pace"} />
          </div>
          <div>
            <label htmlFor="hyrox-sex" className="label">{es ? "División" : "Division"}</label>
            <select id="hyrox-sex" disabled={busy} className="input" value={sex} onChange={(e) => setSex(e.target.value)}>
              <option value="male">{es ? "Hombres" : "Men"}</option>
              <option value="female">{es ? "Mujeres" : "Women"}</option>
            </select>
          </div>
          <div>
            <label htmlFor="hyrox-pro" className="label">Open / Pro</label>
            <select id="hyrox-pro" disabled={busy} className="input" value={pro ? "1" : "0"} onChange={e => setPro(e.target.value === "1")}>
              <option value="0">Open</option><option value="1">Pro</option>
            </select>
          </div>
          <button onClick={loadPlan} disabled={busy} className="btn-primary justify-center">
            <Target className="w-4 h-4" /> {es ? "Calcular plan" : "Build plan"}
          </button>
        </div>

        {busy && <p role="status">{es ? "Calculando…" : "Calculating…"}</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <p className="text-sm text-slate-500">{es ? "Sin dispositivo: introduce un ritmo practicado. El umbral del perfil es solo un punto de partida, no el ritmo de competición HYROX. No se infiere una frecuencia cardíaca objetivo; usa tu esfuerzo percibido o zonas revisadas." : "No device needed: enter a practiced pace. Your saved threshold is only a scenario anchor, not HYROX race pace. No target heart rate is inferred; use perceived effort or reviewed personal zones."}</p>
        {plan && <div className="text-xs text-slate-500 space-y-1">{plan.notes.slice(1).map((note: string) => <p key={note}>{note}</p>)}</div>}
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
                          min="1"
                          disabled={busy}
                          aria-label={`${seg.name} actual seconds`}
                          value={actuals[i]}
                          onChange={(e) => { setAnalysis(null); setActuals((a) => a.map((v, j) => (j === i ? e.target.value : v))); }}
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
                ? "Compara solo segmentos registrados. Las transiciones no están incluidas en los parciales; revisa las reglas oficiales de tu prueba."
                : "Only logged segments are compared. Transitions are not included in segment actuals; review the official rules for your event."}
            </p>
          </div>
        )}
      </div>
    </ProtectedPage>
  );
}
