"use client";

// HYROX Race Split Planner — target time -> 16-segment pacing plan; log actual
// splits after the race -> explicitly confirmed, private result snapshots.
import { useEffect, useState } from "react";
import { Layers, Target, Trophy, Info } from "lucide-react";
import { ProtectedPage } from "@/components/gate";
import { AthleteMetricInput } from "@/components/AthleteMetricInput";
import { unitsOf } from "@/lib/units";
import { clockText } from "@/lib/metric-entry";
import { useAuth } from "@/components/auth";
import type { readHyroxResults } from "@/lib/hyrox-results";
type SavedResult = Awaited<ReturnType<typeof readHyroxResults>>["results"][number];

export default function HyroxPage() {
  const { user } = useAuth();
  const lang = (user?.language || "es") as string;
  const es = lang === "es";
  const imperial = unitsOf(user?.profile?.units, lang) === "imperial";
  const [target, setTarget] = useState("");
  const [pace, setPace] = useState("");
  const [sex, setSex] = useState("");
  const [pro, setPro] = useState("");
  const [error, setError] = useState("");
  const [plan, setPlan] = useState<any>(null);
  const [actuals, setActuals] = useState<string[]>(Array(16).fill(""));
  const [analysis, setAnalysis] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<SavedResult[]>([]);
  const [revision, setRevision] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [observedDate, setObservedDate] = useState("");
  const [eventName, setEventName] = useState("");
  const [transitionSeconds, setTransitionSeconds] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedId, setSavedId] = useState("");
  const [status, setStatus] = useState("");
  const inputsReady = ["male", "female"].includes(sex) && ["0", "1"].includes(pro) && Number.isFinite(Number(target)) && Number(target) >= 1;
  const missingInputs = es ? "Elige tu división, Open o Pro y un objetivo de tiempo antes de calcular." : "Choose your division, Open or Pro and a target time before calculating.";

  async function loadPlan() {
    if (busy) return;
    if (!inputsReady) { setError(missingInputs); return; }
    setBusy(true); setError(""); setPlan(null); setAnalysis(null);
    try {
      const q = new URLSearchParams({ target, ...(pace ? { pace } : {}), sex, pro });
      const res = await fetch(`/api/hyrox/split-planner?${q}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to build the scenario.");
      setPlan(data.plan);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to build the scenario. Try again."); }
    finally { setBusy(false); }
  }
  function restore(result: SavedResult) {
    const input = result.input;
    setTarget(String(input.target)); setPace(String(input.pace)); setSex(input.sex); setPro(input.pro ? "1" : "0");
    setActuals(input.actualSecs.map(value => value === null ? "" : String(value)));
    setObservedDate(input.observedDate); setEventName(input.eventName || ""); setTransitionSeconds(input.transitionSeconds === null ? "" : String(input.transitionSeconds));
    setPlan(result.plan); setAnalysis(result.analysis); setSavedId(result.id); setDirty(false); setConfirmed(false); setError(""); setStatus("");
  }
  async function loadResults(signal?: AbortSignal, restoreLatest = false) {
    setHistoryLoading(true); setHistoryError("");
    try {
      const response = await fetch("/api/hyrox/results", { cache: "no-store", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
      const data = await response.json();
      if (!response.ok || typeof data.revision !== "string" || !Array.isArray(data.results)) throw Error(data.error || "Saved results could not be verified.");
      if (signal?.aborted) return;
      setResults(data.results); setRevision(data.revision);
      if (restoreLatest && data.results[0]) restore(data.results[0]);
      if (data.unreadableResults) setHistoryError(es ? "Algunos resultados guardados no se pudieron verificar. No se han eliminado." : "Some saved results could not be verified. They have not been deleted.");
    } catch (e) { if (!signal?.aborted) { setRevision(null); setHistoryError(e instanceof Error ? e.message : "Unable to load saved results."); } }
    finally { if (!signal?.aborted) setHistoryLoading(false); }
  }
  useEffect(() => {
    if (!user?.id) return;
    setResults([]); setRevision(null); setTarget(""); setPace(""); setSex(""); setPro("");
    setActuals(Array(16).fill("")); setObservedDate(""); setEventName(""); setTransitionSeconds("");
    setPlan(null); setAnalysis(null); setSavedId(""); setConfirmed(false); setDirty(false); setStatus("");
    const controller = new AbortController();
    void loadResults(controller.signal, true);
    return () => controller.abort();
    // The initial owner result is restored once; later edits remain local until confirmed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  function changeScenario(change: () => void) { change(); setPlan(null); setAnalysis(null); setError(""); setDirty(true); setConfirmed(false); setStatus(""); }
  function changeActual(change: () => void) { change(); setConfirmed(false); setDirty(true); setStatus(""); }

  async function analyze() {
    if (busy) return;
    if (!inputsReady) { setError(missingInputs); return; }
    setBusy(true); setError(""); setAnalysis(null);
    try {
      const res = await fetch("/api/hyrox/split-planner", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, pace: pace || undefined, sex, pro: pro === "1", actualSecs: actuals.map(a => a.trim() === "" ? null : a) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to analyze splits.");
      setPlan(data.plan); setAnalysis(data.analysis);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to analyze splits. Try again."); }
    finally { setBusy(false); }
  }

  async function saveResults() {
    if (busy || !confirmed || !dirty || !analysis || !revision) return;
    setBusy(true); setError(""); setStatus("");
    try {
      const response = await fetch("/api/hyrox/results", { method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ expectedRevision: revision, confirmed: true, observedDate, eventName, target, pace: pace || undefined, sex, pro: pro === "1", actualSecs: actuals.map(value => value.trim() === "" ? null : value), transitionSeconds: transitionSeconds.trim() === "" ? null : transitionSeconds }) });
      const data = await response.json();
      if (!response.ok || data.ok !== true || !Array.isArray(data.results) || !data.results.some((result: SavedResult) => result.id === data.id)) {
        if (response.status === 409) setRevision(null);
        throw Error(data.error || "Result save could not be verified. Reload saved results before retrying.");
      }
      setResults(data.results); setRevision(data.revision); setSavedId(data.id); setDirty(false); setConfirmed(false);
      setStatus(es ? "Parciales guardados en tu historial privado. Tu perfil y entrenamiento no cambiaron." : "Splits saved to your private results. Your profile and training did not change.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save results. Reload saved results before retrying."); }
    finally { setBusy(false); }
  }

  const fmt = (sec: number) => { const rounded = Math.round(sec); return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`; };
  const completeFinish = analysis && actuals.every(value => value.trim() !== "") && transitionSeconds.trim() !== "" && Number.isFinite(Number(transitionSeconds)) && Number(transitionSeconds) >= 0 && Number(transitionSeconds) <= 14400
    ? analysis.actualTotalSec + Number(transitionSeconds) : null;

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
          <p className="text-sm text-amber-800 mt-2">{es
            ? "Analizar no guarda nada. Revisa y confirma los parciales reales para conservarlos aquí después de recargar. Los resultados son declarados por ti; no cambian automáticamente tu capacidad, perfil ni entrenamiento."
            : "Analyzing does not save anything. Review and confirm actual splits to keep them here after reload. Results are athlete-reported; they do not automatically change capacity, profile or training."}</p>
        </div>

        {/* Controls */}
        <div className="card grid sm:grid-cols-5 gap-3 items-end">
          <div>
            <label htmlFor="hyrox-target" className="label">{es ? "Objetivo (min)" : "Target (min)"}</label>
            <input id="hyrox-target" disabled={busy || historyLoading} min="1" className="input" type="number" value={target} onChange={(e) => changeScenario(() => setTarget(e.target.value))} placeholder={es ? "Ejemplo: 75" : "Example: 75"} />
          </div>
          <div>
            <label htmlFor="hyrox-pace" className="label">{es ? `Ritmo (min:sec/${imperial ? "mi" : "km"})` : `Pace (min:sec/${imperial ? "mi" : "km"})`}</label>
            <AthleteMetricInput id="hyrox-pace" disabled={busy || historyLoading} min={1} es={es} factor={imperial ? 1.609344 : 1} value={pace} onChange={value => changeScenario(() => setPace(value))}/>
          </div>
          <div>
            <label htmlFor="hyrox-sex" className="label">{es ? "División individual" : "Singles division"}</label>
            <select id="hyrox-sex" disabled={busy || historyLoading} className="input" value={sex} onChange={(e) => changeScenario(() => setSex(e.target.value))}>
              <option value="">{es ? "Elige tu división" : "Choose your division"}</option>
              <option value="male">{es ? "Hombres" : "Men"}</option>
              <option value="female">{es ? "Mujeres" : "Women"}</option>
            </select>
          </div>
          <div>
            <label htmlFor="hyrox-pro" className="label">Open / Pro</label>
            <select id="hyrox-pro" disabled={busy || historyLoading} className="input" value={pro} onChange={e => changeScenario(() => setPro(e.target.value))}>
              <option value="">{es ? "Elige Open o Pro" : "Choose Open or Pro"}</option>
              <option value="0">Open</option><option value="1">Pro</option>
            </select>
          </div>
          <button id="hyrox-build-plan" onClick={loadPlan} disabled={busy || historyLoading || !inputsReady} className="btn-primary justify-center">
            <Target className="w-4 h-4" /> {es ? "Calcular plan" : "Build plan"}
          </button>
        </div>

        {busy && <p role="status">{es ? "Procesando…" : "Working…"}</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {status && <p role="status" className="text-sm text-emerald-800">{status}</p>}
        <details className="card">
          <summary className="cursor-pointer min-h-11 content-center font-semibold">{es ? "Mis resultados guardados" : "My saved results"} ({results.length})</summary>
          {historyLoading && <p role="status">{es ? "Cargando historial…" : "Loading results…"}</p>}
          {historyError && <p role="alert" className="text-amber-800">{historyError}</p>}
          {!historyLoading && !results.length && <p className="text-sm">{es ? "Todavía no hay parciales confirmados guardados." : "No confirmed splits have been saved yet."}</p>}
          {!!results.length && <label className="block mt-3">{es ? "Restaurar un resultado" : "Restore a result"}<select className="input" value={savedId} disabled={busy || historyLoading} onChange={event => { const saved = results.find(result => result.id === event.target.value); if (saved) restore(saved); }}><option value="">{es ? "Seleccionar" : "Select"}</option>{results.map(result => <option key={result.id} value={result.id}>{result.input.observedDate} · {result.input.eventName || "HYROX"} · {result.input.sex === "female" ? (es ? "Mujeres" : "Women") : (es ? "Hombres" : "Men")} {result.input.pro ? "Pro" : "Open"} · {result.completeness.loggedSegments}/16</option>)}</select></label>}
          <div className="flex flex-wrap gap-3 mt-3"><button className="btn-secondary" disabled={busy || historyLoading} onClick={() => void loadResults()}>{es ? "Actualizar historial" : "Reload saved results"}</button><button className="btn-secondary" disabled={busy || historyLoading} onClick={() => { setActuals(Array(16).fill("")); setObservedDate(""); setEventName(""); setTransitionSeconds(""); setAnalysis(null); setSavedId(""); setConfirmed(false); setDirty(true); setStatus(""); }}>{es ? "Otro resultado" : "New result"}</button></div>
          <p className="text-xs text-slate-500 mt-2">{es ? "Se muestran los últimos 50 registros. Una corrección confirmada añade otro registro; no borra el anterior. Los cambios sin confirmar se pierden al salir." : "The latest 50 records are shown. A confirmed correction adds a record and preserves the previous one. Unsaved changes are lost when leaving."}</p>
        </details>
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
                    <th className="p-2 w-28">{es ? "Real (m:ss)" : "Actual (m:ss)"}</th>
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
                        <AthleteMetricInput className="input !py-1 text-xs tabular-nums" min={1} disabled={busy} es={es}
                          label={`${seg.name} ${es ? "tiempo real (m:ss)" : "actual time (m:ss)"}`} value={actuals[i]}
                          onChange={value => changeActual(() => { setAnalysis(null); setActuals(a => a.map((v,j) => j === i ? value : v)); })}/>

                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-3 border-t border-sand-200 flex justify-end">
              <button id="hyrox-analyze" onClick={analyze} disabled={busy || !inputsReady} className="btn-primary">
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
            <p className="text-sm mt-2">{es ? "Tiempo final incluyendo las transiciones declaradas" : "Finish total including reported transitions"}: {completeFinish === null ? (es ? "— faltan parciales o transiciones" : "— splits or transitions missing") : fmt(completeFinish)}.</p>
            <div className="mt-3 space-y-1.5">
              {analysis.stationGaps.slice(0, 3).map((g: any) => (
                <div key={g.key} className={`rounded-xl px-3 py-2 ${g.deltaSec > 0 ? "bg-coral-50 border border-coral-200" : "bg-emerald-50 border border-emerald-200"}`}>
                  <div className="text-sm font-semibold">
                    {g.deltaSec > 0 ? "✗" : "✓"} {g.name}: {fmt(g.actualSec)} {es ? "vs" : "vs"} {fmt(g.targetSec)} ({g.deltaSec >= 0 ? "+" : ""}{g.deltaSec}s · {g.pctOfTotalLoss}% {es ? "del tiempo perdido" : "of lost time"})
                  </div>
                  {g.deltaSec > 0 && g.advice && <div className="text-xs text-slate-600 mt-1">💪 {es ? "Para revisar con tu coach: " : "Discuss with your coach: "}{g.advice}</div>}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-3 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {es
                ? "Compara solo segmentos registrados. Las transiciones no están incluidas en los parciales; revisa las reglas oficiales de tu prueba."
                : "Only logged segments are compared. Transitions are not included in segment actuals; review the official rules for your event."}
            </p>
            <div className="mt-5 border-t pt-4 space-y-3">
              <h2 className="font-semibold">{es ? "Guardar resultado real" : "Save an actual result"}</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                <label className="block text-sm">{es ? "Fecha local de la prueba" : "Actual local race date"}<input className="input" type="date" disabled={busy} value={observedDate} onChange={event => changeActual(() => setObservedDate(event.target.value))}/></label>
                <label className="block text-sm">{es ? "Nombre de la prueba (opcional)" : "Event name (optional)"}<input className="input" maxLength={200} disabled={busy} value={eventName} onChange={event => changeActual(() => setEventName(event.target.value))}/></label>
                <label className="block text-sm">{es ? "Total real de transiciones/Roxzone (m:ss, opcional)" : "Actual transitions/Roxzone total (m:ss, optional)"}<AthleteMetricInput es={es} max={14400} disabled={busy} value={transitionSeconds} onChange={value => changeActual(() => setTransitionSeconds(value))}/></label>
              </div>
              <p className="text-sm">{actuals.filter(value => value.trim() !== "").length}/16 {es ? "parciales registrados. Transiciones" : "segments logged. Transitions"}: {transitionSeconds === "" ? (es ? "— sin registrar" : "— missing") : clockText(Number(transitionSeconds)) || "—"}. {es ? "Introduce cada segmento sin transiciones; registra el total Roxzone por separado. Sin los 16 parciales y las transiciones, no hay tiempo final completo." : "Enter segment times excluding transitions; log total Roxzone separately. Without all 16 splits and transitions there is no complete finish total."}</p>
              <label className="flex gap-2 items-start text-sm"><input className="mt-1" type="checkbox" disabled={busy || !dirty} checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>{es ? "Confirmo que son mis parciales reales de la fecha indicada; los campos vacíos siguen desconocidos. Guardar no modifica mi entrenamiento." : "I confirm these are my actual splits on the stated date; blank fields remain unknown. Saving does not change my training."}</span></label>
              <button className="btn-primary" disabled={busy || !dirty || !confirmed || !observedDate || !revision || !actuals.some(value => value.trim() !== "")} onClick={saveResults}>{es ? "Confirmar y guardar parciales" : "Confirm and save splits"}</button>
              {!revision && <p className="text-sm text-amber-800">{es ? "Actualiza el historial guardado antes de confirmar." : "Reload saved results before confirming."}</p>}
            </div>
          </div>
        )}
      </div>
    </ProtectedPage>
  );
}
