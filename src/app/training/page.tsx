"use client";
import "@/components/daily-training/universal-workout-card.css";

import { trustedCycleMovementGuidance } from "@/lib/cycle-movement-guidance";
import { TrainingWorkflowNav } from "@/components/training-workflow-nav";
import { TrainingCycleOverview } from "@/components/training-cycle-overview";
import { PlanTargetPreview } from "@/components/plan-target-preview";
import { raceKilometres } from "@/lib/race-distances";
import { TargetProgressPanel } from "@/components/target-progress-panel";
import { RestPreference } from "@/components/rest-preference";
import { StartingCycle } from "@/components/StartingCycle";
import { planningReasonText } from "@/lib/planning-reason-copy";
import { planningGoal } from "@/lib/planning-setup";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Dumbbell,
  Waves,
  Bike,
  Zap,
  Sparkles,
  Layers,
  HeartPulse,
  ChevronDown,
  ChevronUp,
  CloudSun,
  Pencil,
  Save,
  X,
  Swords,
  Download,
} from "lucide-react";
import { readTrainingJson, isSavedPlanResponse, isTrainingProfileResponse, readSavedCycleMetadata, isPlanPreviewResponse, isGeneratedPlanResponse } from "@/components/daily-training/training-read";
import { SavedWorkoutPreviewCard } from "@/components/daily-training/SavedWorkoutPreviewCard";
import { UniversalWorkoutCardLoader } from "@/components/daily-training/UniversalWorkoutCard";
import { addDaysKey, dateKey } from "@/lib/dates";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import {
  analyzeHydration,
  TRAINING_WINDOWS,
} from "@/lib/adaptive";
import { buildSessionDetail, HR_ZONES } from "@/lib/science";
import { plannedAerobicDistribution } from "@/lib/training-distribution";

const SPORT_ICON: Record<string, any> = {
  swim: Waves,
  bike: Bike,
  run: Zap,
  strength: Dumbbell,
  brick: Zap,
  recovery: HeartPulse,
  hyrox: Layers,
  boxing: Swords,
};

function fmtMin(min: number) {
  if (min >= 60)
    return `${Math.floor(min / 60)}h ${min % 60 ? `${min % 60}m` : ""}`;
  return `${min}m`;
}

export default function TrainingPage() {
  const { user } = useAuth();
  return <TrainingPageContent key={user?.id || "signed-out"} />;
}

function TrainingPageContent() {
  const { user } = useAuth();
  const es = user?.language === "es";
  const [plans, setPlans] = useState<any[]>([]);
  const [cycle, setCycle] = useState<any>(null);
  const [cycleNeedsReview, setCycleNeedsReview] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [planLoaded, setPlanLoaded] = useState(false);
  const [setupLoading, setSetupLoading] = useState(true);
  const [setupError, setSetupError] = useState("");
  const loadController = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const [generating, setGenerating] = useState(false);
  const generationPending = useRef(false);
  const [form, setForm] = useState({
    distance: "",
    weeks: "",
    startDate: dateKey(new Date(), user?.timezone),
    trainingWindow: "",
  });
  const [error, setError] = useState("");
  const [planningReadiness, setPlanningReadiness] = useState<any>(null);
  const [doubleDayConfirmed,setDoubleDayConfirmed]=useState(false);
  const [eventTradeoffsConfirmed,setEventTradeoffsConfirmed]=useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [zones, setZones] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const initialPreviewFor = useRef<string | null>(null);
  const [editing, setEditing] = useState<
    Record<
      string,
      {
        revision: string;
        title: string;
        durationMin: string;
        intensity: string;
        preWeightKg: string;
        postWeightKg: string;
      }
    >
  >({});

  const load = useCallback(async () => {
    if (!mounted.current) return;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const { signal } = controller;
    setLoading(true);
    setSetupLoading(true);
    setLoadError("");
    setSetupError("");
    // A slow or failed planning setup must not hide an already saved cycle.
    await Promise.all([
      readTrainingJson("/api/plan", { signal, label: "Your saved training", validate: isSavedPlanResponse })
        .then(p => {
          if (!mounted.current || signal.aborted) return;
          setPlans(p.plans);
          setPlanLoaded(true);
          const loadedPlanKey = `${user?.id}:${p.plans[0]?.id ?? "empty"}`;
          if (user && initialPreviewFor.current !== loadedPlanKey) {
            const todayKey = dateKey(new Date(), user.timezone);
            const pendingSession = (session: any) => !session.completed && session.feedbackStatus !== "skipped";
            const nextDay = (p.plans[0]?.days || []).find((day: any) => !day.dayOff && dateKey(new Date(day.date), user.timezone) >= todayKey && day.sessions?.some(pendingSession));
            const nextSession = nextDay?.sessions.find(pendingSession);
            setExpanded(new Set(nextSession ? [nextSession.id] : []));
            if (nextDay) setSelectedMonth(dateKey(new Date(nextDay.date), user.timezone).slice(0, 7));
            initialPreviewFor.current = loadedPlanKey;
          }
          const savedCycle = readSavedCycleMetadata(p.cycle);
          setCycle(savedCycle);
          setCycleNeedsReview(p.cycleSummaryNeedsReview === true || p.cycle != null && savedCycle === null);
        })
        .catch(err => { if (!signal.aborted) setLoadError(err instanceof Error ? err.message : "Could not load training."); })
        .finally(() => { if (!signal.aborted) setLoading(false); }),
      readTrainingJson("/api/profile", { signal, label: "Planning setup", validate: isTrainingProfileResponse })
        .then(z => {
          if (!mounted.current || signal.aborted) return;
          setZones(z.zones);
          setProfile(z.profile);
          setPlanningReadiness(z.planningReadiness);
          setForm(previous => ({...previous, distance: previous.distance || planningGoal(z.profile?.goal) || "", weeks: previous.weeks || String(z.setup?.planWeeks ?? "")}));
        })
        .catch(err => {
          if (!mounted.current || signal.aborted) return;
          setPlanningReadiness(null);
          setSetupError(err instanceof Error ? err.message : "Could not load planning setup.");
        })
        .finally(() => { if (!signal.aborted) setSetupLoading(false); }),
    ]);
  }, [user]);

  useEffect(() => {
    mounted.current = true;
    if (user) void load();
    return () => { mounted.current = false; loadController.current?.abort(); };
  }, [user, load]);

  function updatePlanForm(next: typeof form) {
    setForm(next);
    setPreview(null);
    setDoubleDayConfirmed(false);
    setEventTradeoffsConfirmed(false);
  }

  async function generate(e?: React.FormEvent, confirmed = false) {
    e?.preventDefault();
    if (!planningReadiness?.ready || generationPending.current || loading || setupLoading || loadError || setupError || form.distance !== planningGoal(profile?.goal)) return;
    generationPending.current = true;
    setGenerating(true);
    setError("");
    setSavedMessage("");
    try {
      const res = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({...form, confirmDoubleDay:confirmed&&doubleDayConfirmed, confirmEventTradeoffs:confirmed&&eventTradeoffsConfirmed, preview: !confirmed, previewToken: confirmed ? preview?.previewToken : undefined}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      if (!confirmed) {
        if (!isPlanPreviewResponse(data)) throw new Error(es ? "No se pudo verificar la estructura de la vista previa. No se ha guardado un plan; vuelve a intentarlo." : "The preview structure could not be verified. No plan was saved; please retry.");
        setEventTradeoffsConfirmed(false); setDoubleDayConfirmed(false); setPreview(data); return;
      }
      if (!isGeneratedPlanResponse(data)) throw new Error(es ? "No se pudo confirmar el guardado. Recarga tu plan antes de volver a confirmar para evitar duplicados." : "The save could not be confirmed. Reload your plan before confirming again to avoid duplicates.");
      setPreview(null);
      setSavedMessage(es ? "Tu ciclo estructurado está guardado. Abre Hoy para un nuevo chequeo o elige un mes. Se conserva tu historial completado." : "Your structured training cycle is saved. Open Today for a fresh check-in, or choose a month below. Completed history is retained.");
      await load();
    } catch (err: any) {
      if (confirmed) setPreview(null);
      setError(err.message);
    } finally {
      generationPending.current = false;
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

  async function toggleDayOff(day: any) {
    try {
      await api({ planDayId: day.id, dayOff: !day.dayOff });
    } catch (e: any) {
      setError(e.message);
    }
    load();
  }

  async function saveEdit(sessionId: string) {
    const f = editing[sessionId];
    if (!f) return;
    try {
      await api({
        sessionId,
        expectedRevision: f.revision,
        title: f.title,
        durationMin: Number(f.durationMin),
        ...(f.intensity ? { intensity: f.intensity } : {}),
        ...(f.preWeightKg ? { preWeightKg: f.preWeightKg } : {}),
        ...(f.postWeightKg ? { postWeightKg: f.postWeightKg } : {}),
      });
      setEditing((prev) => {
        const n = { ...prev };
        delete n[sessionId];
        return n;
      });
    } catch (e: any) {
      setError(e.message);
    }
    load();
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function startEdit(s: any) {
    setEditing((prev) => ({
      ...prev,
      [s.id]: {
        revision: s.revision,
        title: s.title,
        durationMin: String(s.durationMin),
        intensity: s.intensity || "",
        preWeightKg: s.preWeightKg ? String(s.preWeightKg) : "",
        postWeightKg: s.postWeightKg ? String(s.postWeightKg) : "",
      },
    }));
  }

  const plan = plans[0];
  const goalChanged = !!profile && form.distance !== planningGoal(profile.goal);
  const setupHref = `/onboard?redo=1&advanced=1&step=race&return=training&goal=${encodeURIComponent(form.distance)}&weeks=${encodeURIComponent(form.weeks)}`;
  const months: string[] = Array.from(new Set<string>((plan?.days || []).map((day: any) => dateKey(new Date(day.date), user?.timezone).slice(0,7)))).sort();
  const visibleMonth = months.includes(selectedMonth) ? selectedMonth : months.includes(dateKey(new Date(), user?.timezone).slice(0,7)) ? dateKey(new Date(), user?.timezone).slice(0,7) : months[0] || "";
  const visibleDays = (plan?.days || []).filter((day: any) => dateKey(new Date(day.date), user?.timezone).startsWith(visibleMonth));
  const sessions = plan?.days?.flatMap((d: any) => d.sessions) || [];
  const completedCount = sessions.filter((s: any) => s.completed).length;
  const totalCount = sessions.length;
  const plannedDistribution=plannedAerobicDistribution(sessions);
  const actualEasy = plannedDistribution.easyPct;

  return (
    <ProtectedPage>
      <div className="training-workflow space-y-5">
        <TrainingWorkflowNav active="plan" es={es} />
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">{es ? "Plan de entrenamiento" : "Training Plan"}</h1>
            <p className="text-slate-500 text-sm">
              {es ? "Revisa tu semana. Previsualiza y confirma los cambios del plan." : "Review your week. Preview and confirm any plan changes."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a href="/protocols" className="btn-secondary min-h-11">{es ? "Protocolos" : "Protocols"}</a>
            <a href="/sport-data" className="btn-secondary min-h-11">{es ? "Datos por deporte" : "Sport data"}</a>
            <a href="/api/training/export" className="btn-secondary min-h-11">
              <Download className="w-4 h-4" aria-hidden="true" /> {es ? "Exportar" : "Export"}
            </a>
            {planLoaded && <span className="chip chip-z2">
              <Layers className="w-3.5 h-3.5" /> {completedCount}/{totalCount}{" "}
              sessions
            </span>}
          </div>
        </div>

        <details className="text-sm text-slate-600"><summary className="min-h-11 cursor-pointer content-center">{es ? "Qué incluye la exportación" : "What the export includes"}</summary><p>{es ? "Historial y análisis en CSV, calendario del plan y archivos FIT para dispositivos compatibles. Revisa la importación en tu dispositivo." : "History and analytics as CSV, the plan calendar, and FIT files for compatible devices. Verify import on your device."}</p></details>

        {loading && <p role="status" className="card" aria-live="polite">{planLoaded ? (es ? "Actualizando tu ciclo guardado…" : "Refreshing your saved training…") : (es ? "Cargando tu ciclo y sesiones guardadas…" : "Loading your saved cycle and sessions…")}</p>}
        {loadError && <div role="alert" className="card border-red-300"><p>{loadError}</p><button type="button" className="btn-secondary mt-2" disabled={loading} onClick={() => void load()}>{es ? "Reintentar entrenamiento" : "Retry loading training"}</button></div>}
        {setupError && <div role="alert" className="card border-amber-300"><p>{setupError} {es ? "El ciclo guardado se carga por separado." : "Your saved cycle loads separately."}</p><button type="button" className="btn-secondary mt-2" disabled={setupLoading} onClick={() => void load()}>{es ? "Reintentar configuración" : "Retry planning setup"}</button></div>}
        {savedMessage && <p role="status" className="card border-emerald-300">{savedMessage}</p>}
        {cycleNeedsReview && <p role="status" className="card border-amber-300 text-sm">{es ? "Tus sesiones guardadas están disponibles. El resumen de este ciclo anterior necesita revisión; no se han modificado las sesiones." : "Your saved sessions are available. This older cycle summary needs review; the sessions have not been changed."}</p>}
        {plan && <TrainingCycleOverview es={es} plan={plan} cycle={cycle} timezone={user?.timezone || "America/New_York"} selectedMonth={visibleMonth} onMonthChange={setSelectedMonth} />}
        <details className="rounded-xl border border-sand-200 bg-white px-4"><summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">{es ? "Objetivos y días de descanso" : "Targets & rest days"}</summary><div className="space-y-4 pb-4"><RestPreference es={es} onSaved={()=>{setPreview(null);void load();}} /><TargetProgressPanel key={user?.id} language={user?.language} /></div></details>

        {/* A saved cycle remains primary; replacing it is an explicit review. */}
        <details className="card" open={planLoaded && !plan && !loading && !loadError}>
          <summary className="font-display font-bold text-lg mb-3 cursor-pointer">{!planLoaded ? (es ? "Configuración del plan" : "Planning setup") : plan ? (es ? "Revisar cambios del entrenamiento futuro" : "Review changes to future training") : (es ? "Crear y guardar tu ciclo de entrenamiento" : "Create and save your training cycle")}</summary>
          <p className="text-sm text-slate-500 mb-4">
            {profile?.lthr
              ? "Saved physiological references remain reported values; dated, verified anchors are needed for exact targets."
              : "No threshold benchmark is required. Use effort and talk-test guidance; missing physiology is not estimated from age, sex or weight."}
          </p>
          {planningReadiness && !planningReadiness.ready && <div role="status" className="mb-4 border border-amber-300 rounded-lg p-3 space-y-3">
            <p className="font-semibold">{es ? "Qué falta para un ciclo personalizado" : "What's needed for a personalized cycle"}</p>
            <p className="text-sm">{es ? "Puedes revisar una semana inicial con datos incompletos. Un ciclo personalizado necesita historial reciente, tiempo disponible y restricciones actuales. No exige dispositivo, prueba umbral ni carrera." : "You can review a starting week with incomplete information. A personalized cycle needs recent training, available time and current restrictions. No device, threshold test or race entry is required."}</p>
            {planningReadiness.review.length>0&&<p className="text-sm font-medium">{planningReasonText(planningReadiness.review[0],es)}</p>}
            <details><summary className="cursor-pointer underline">{es ? "Ver qué necesita revisión" : "See what needs review"} ({planningReadiness.missing.length + planningReadiness.review.length})</summary><ul className="list-disc ml-5 mt-2">{[...planningReadiness.missing, ...planningReadiness.review].map((reason:string)=><li key={reason}>{planningReasonText(reason,es)}</li>)}</ul></details>
            <a className="btn-primary" href={setupHref}>{es ? "Revisar mis datos" : "Review my information"}</a>
            <p className="text-sm">{es ? "Guarda los datos que conoces, revisa la vista previa y confirma el plan. Las pruebas no son obligatorias; los registros importados mantienen su fuente y fecha." : "Save information you know, review the preview, then confirm the plan. Tests are optional; imported records retain their source and date."}</p>
            <StartingCycle key={user?.id} es={es} onSaved={async()=>{setSavedMessage(es?"Semana inicial guardada. Revisa las tareas y sesiones pendientes de seguridad.":"Starting week saved. Review the tasks and sessions pending safety checks.");await load();}}/>
          </div>}
          {planningReadiness?.ready && planningReadiness?.planningBasis === "baseline_only" && <p className="mb-4 text-sm">You explicitly chose baseline-only conservative planning. Your numeric target stays an aspiration; this plan is not optimized or promised to achieve it. Target-driven progression still requires coaching review.</p>}
          <form
            onSubmit={generate}
            className="grid gap-4 items-end [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]"
          >
            <div>
              <label htmlFor="plan-goal" className="label">Training goal / sport</label>
              <select
                id="plan-goal"
                className="input"
                value={form.distance}
                onChange={(e) => updatePlanForm({ ...form, distance: e.target.value })}
              >
                <option value="">Choose your actual goal</option>
                <option value="sprint">Sprint (750m / 20km / 5km)</option>
                <option value="track-sprint">Track Sprint (100m / 200m / 400m)</option>
                <option value="olympic">Olympic (1.5k / 40k / 10k)</option>
                <option value="half">Half Ironman (1.9k / 90k / 21.1k)</option>
                <option value="full">Full Ironman (3.8k / 180k / 42.2k)</option>
                <option value="hyrox">HYROX (8×1km + 8 stations)</option>
                <option value="cycle">Cycling only</option>
                <option value="run-only">Running only</option>
                <option value="swim-only">Swimming only</option>
              </select>
              {goalChanged && <p role="status" className="text-sm mt-2">{es ? "Guarda este cambio de objetivo antes de crear otro ciclo." : "Save this goal change before creating another cycle."} <Link className="underline" href={setupHref}>{es ? "Revisar y guardar objetivo" : "Review and save goal"}</Link></p>}
            </div>
            <div>
              <label htmlFor="plan-weeks" className="label">Weeks</label>
              <select
                id="plan-weeks"
                className="input"
                value={form.weeks}
                onChange={(e) => updatePlanForm({ ...form, weeks: e.target.value })}
              >
                <option value="">Choose horizon</option>
                {[4, 6, 8, 12, 16, 20, 24, 30].map((w) => (
                  <option key={w} value={w}>
                    {w} {es ? "semanas" : "weeks"}{w === 12 ? (es ? " · Unos 3 meses" : " · About 3 months") : w === 24 ? (es ? " · Unos 6 meses" : " · About 6 months") : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="plan-start" className="label">Start date</label>
              <input
                id="plan-start"
                type="date"
                className="input"
                value={form.startDate}
                onChange={(e) =>
                  updatePlanForm({ ...form, startDate: e.target.value })
                }
              />
            </div>
            <div>
              <label htmlFor="plan-window" className="label">Training time</label>
              <select
                id="plan-window"
                className="input"
                value={form.trainingWindow}
                onChange={(e) =>
                  updatePlanForm({ ...form, trainingWindow: e.target.value })
                }
              >
                <option value="">Auto (use profile)</option>
                {TRAINING_WINDOWS.map((w) => (
                  <option key={w.key} value={w.key}>
                    {w.label}
                    {w.startTime ? ` · ${w.startTime}` : ""}
                  </option>
                ))}
              </select>
            </div>
            {planningReadiness && !planningReadiness.ready ? <a href={setupHref} className="btn-primary justify-center">Complete setup to preview</a> : <button
              type="submit"
              disabled={generating || loading || setupLoading || !!loadError || !!setupError || !planningReadiness?.ready || goalChanged}
              className="btn-primary justify-center"
            >
              {loading || setupLoading ? "Loading setup…" : generating ? (
                "Preparing preview…"
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> {es ? "Vista previa del plan" : "Preview Plan"}
                </>
              )}
            </button>}
          </form>
          {preview && <section className="mt-4 border rounded-xl p-4" aria-label="Plan preview">
            <h3 className="font-semibold">Review before assigning</h3>
            <p>{preview.preview.distance}, {preview.preview.weeks} weeks. Weekly time ceiling: {preview.preview.weeklyBudgetMin} minutes. Event date: {preview.preview.raceDate ? String(preview.preview.raceDate).slice(0,10) : "No event date supplied"}.</p>
            {preview.preview.raceTarget?.distance==='custom'&&<p className="my-2 text-sm">{es ? "Distancias declaradas del evento" : "Reported event distances"}: {raceKilometres(preview.preview.raceTarget.legs.swimM)} km {es ? "natación" : "swim"} · {raceKilometres(preview.preview.raceTarget.legs.bikeM)} km {es ? "bici" : "bike"} · {raceKilometres(preview.preview.raceTarget.legs.runM)} km {es ? "carrera" : "run"}. {es ? "No se ha sustituido por una distancia estándar." : "No standard-distance substitution was made."}</p>}
            {preview.preview.recoveryPolicy && <div className="my-3 rounded-lg border border-ink-200 bg-paper p-3 space-y-2">
              <p><strong>Recovery planning:</strong> {preview.preview.recoveryPolicy.minimumRestDays === 0 ? "No fixed minimum off-days for this saved preference/profile. Easy recovery practice stays within the weekly budget; complete rest can still be required." : `At least ${preview.preview.recoveryPolicy.minimumRestDays} planned off-day${preview.preview.recoveryPolicy.minimumRestDays === 1 ? "" : "s"} per seven-day plan block for your current experience level.`}</p>
              <p className="text-sm">These are coaching defaults, not universal research-established off-day counts. Your unavailable days, symptoms, fatigue and coach review can require more rest. Review the dates below before confirming.</p>
              <p className="text-sm"><strong>First week off-days:</strong> {preview.preview.weeksPreview[0]?.restDaySlots?.length ? preview.preview.weeksPreview[0].restDaySlots.map((slot:number)=>addDaysKey(dateKey(new Date(preview.preview.startDate),user?.timezone),slot)).filter((key:string)=>!preview.preview.weeksPreview[0].eventDays?.includes(key)).join(", ") || (es ? "Solo fechas de evento protegidas" : "Protected event dates only") : "None fixed in this preview; add rest whenever needed."} No compulsory workout is assigned on these dates. Planned rest does not count as confirmed completed rest.</p>
            </div>}
            <p>{preview.warning}</p>
            {preview.preview.weeksPreview.some((week:any)=>Array.isArray(week.doseAllocation?.omitted)&&week.doseAllocation.omitted.length>0) && <p role="status" className="my-3 rounded-lg border border-amber-300 p-3 text-sm">{es ? "El horario disponible excluye algunos componentes. Revisa los motivos de cada semana antes de guardar; no se ha añadido trabajo para recuperarlos." : "The available schedule excludes some components. Review each week's omitted purposes before saving; no catch-up work has been added."}</p>}
            {preview.preview.cycle && <div className="my-3 space-y-2 text-sm"><p><strong>Assessment:</strong> {preview.preview.cycle.assessment}</p><p><strong>Recent training:</strong> {preview.preview.cycle.activity.reportedSessions} performed sessions recorded; missing reports are not counted as zero. {preview.preview.cycle.activity.recoveryReview ? "Recent effort or incomplete work calls for a reduced opening week." : "Daily recovery still needs review."}</p><p>Planned week totals: {preview.preview.cycle.weeks.map((week:any) => `W${week.week}: ${week.totalMinutes} min`).join(" · ")}</p></div>}
            <p>{preview.preview.existingPlans ? "Confirming will archive the current plan and supersede its uncompleted future sessions. History is retained." : "Confirming will assign this provisional plan."}</p>
            <details className="my-3"><summary className="cursor-pointer underline">Review every week, off-day and session</summary>{preview.preview.weeksPreview.map((week:any,weekIndex:number)=><div className="my-4" key={week.week}>
              <h4 className="font-semibold">Week {week.week}: {week.theme} · {week.totalMinutes} min</h4>
              {Array.isArray(week.cycleOmissions)&&week.cycleOmissions.length>0 && <p className="my-2 text-sm" role="status">{es ? "Ajustes por recuperación o eventos" : "Recovery or event adjustments"}: {week.cycleOmissions.join(' ')}</p>}
              {Array.isArray(week.doseAllocation?.omitted)&&week.doseAllocation.omitted.length>0 && <div className="my-2 rounded border border-amber-300 p-3 text-sm"><p className="font-semibold">{es ? "Componentes excluidos por los límites del horario" : "Components omitted within schedule limits"}</p><ul className="mt-2 list-disc space-y-1 pl-5">{week.doseAllocation.omitted.map((item:any,index:number)=><li key={index}><strong>{item.title}</strong>: {item.purpose}. {item.reason}</li>)}</ul></div>}
              <p className="text-sm">{week.doubleDayNote}</p>{week.volumeDecision && <p className="text-sm">Dose decision: {week.volumeDecision.scheduledMinutes} scheduled min · adjustment ×{week.volumeDecision.cycleFactor} · {week.volumeDecision.remainingPlannedMinutes} future planned min. {week.volumeDecision.reason}. Performed/protected dates are excluded, not counted as zero training.</p>}
              <ul className="mt-2 space-y-2">{Array.from({length:7},(_,slot)=>{
                const localDay=addDaysKey(dateKey(new Date(preview.preview.startDate),user?.timezone),weekIndex*7+slot);
                const sessions=week.sessions.filter((session:any)=>session.daySlot===slot);
                const isEvent=week.eventDays?.includes(localDay);
                const isOff=week.restDaySlots?.includes(slot) || sessions.length===0;
                return <li key={slot} className="border-l-2 border-ink-200 pl-3">
                  <strong>{localDay}{isEvent ? (es ? " · Evento" : " · Event") : isOff?" · Planned off-day":""}</strong>
                  {isOff?<p className="text-sm">{isEvent ? (es ? "Día protegido: no se añade entrenamiento. Registra solo lo que realices; no se presume descanso ni participación." : "Protected event day: no added workout. Record only what you do; neither rest nor participation is assumed.") : "No compulsory workout. Optional recovery guidance remains separate; record only what you actually do."}</p>:sessions.map((session:any,index:number)=><p key={index}>{session.startTime ? `${session.startTime} · ` : ""}{session.sport}: {session.title}, {session.minutes} min, {session.zone}. {session.movedFromSlot!==undefined ? `Moved from ${addDaysKey(dateKey(new Date(preview.preview.startDate),user?.timezone),weekIndex*7+session.movedFromSlot)}. ` : ""}{session.description}{session.steps?.length > 0 && <span className="block mt-1 text-xs">{session.steps.map((step:any) => `${step.name}: ${step.reps ? `${step.reps} reps (time allocation estimated)` : `${Math.round(step.seconds / 6) / 10} min`} · ${step.zone}${trustedCycleMovementGuidance(step, es ? "es" : "en") ? `. ${trustedCycleMovementGuidance(step, es ? "es" : "en")}` : ""}`).join(" → ")}</span>}{session.targetPreview && <PlanTargetPreview preview={session.targetPreview} steps={session.steps} es={es} />}</p>)}
                </li>;
              })}</ul>
            </div>)}</details>
            {preview.preview.cycle?.events?.events?.length > 0 && <div className="my-3 text-sm space-y-2">
              <p className="font-semibold">{es ? "Eventos y recuperación" : "Events and recovery"}</p>
              <Link href="/races" className="underline">{es ? "Revisar eventos y prioridades" : "Review events and priorities"}</Link>
              <ul>{preview.preview.cycle.events.events.map((event:any)=><li key={event.id}>{event.dateKey} · {event.name || (es ? "Evento" : "Event")} · {event.priority}</li>)}</ul>
              <p>{es ? "A prioriza la preparación; B y C usan reducciones más breves (14/7/3 días de preparación; recuperación inicial de 7–14 días según el evento). Son criterios de entrenamiento, no garantías de recuperación. Cada día de evento queda libre de entrenamiento añadido." : "A prioritizes preparation; B and C use shorter reductions (14/7/3 preparation days; initial recovery of 7–14 days by event). These are coaching policies, not recovery guarantees. Every event day is protected from added training."}</p>
              {preview.preview.cycle.events.warnings?.length > 0 && <ul role="status" className="space-y-1">{preview.preview.cycle.events.warnings.map((warning:any,index:number)=><li key={index}>{es ? `${warning.eventIds.map((id:string)=>preview.preview.cycle.events.events.find((event:any)=>event.id===id)?.name || id).join(" / ")}: ${warning.code === "recent_event" ? "evento reciente; revisar recuperación antes de retomar" : warning.code === "short_preparation" ? "menos de cuatro semanas de preparación; no se garantiza estar listo" : "preparación y recuperación se superponen; revisar prioridades sin prometer varios picos de forma"}.` : warning.message}</li>)}</ul>}

            </div>}
            {preview.preview.cycle?.baselineReviews?.length > 0 && <details className="my-3 text-sm"><summary className="cursor-pointer underline">{es ? "Referencias y revisión por deporte" : "Sport-specific references and reviews"}</summary><ul className="mt-2 space-y-2">{preview.preview.cycle.baselineReviews.map((review:any)=><li key={review.sport}><strong>{review.sport}</strong>: {review.observedAt || "—"} · {es ? "Revisión" : "Review"}: {review.reviewDueAt || (es ? "pendiente" : "due")} · {es ? "Caduca" : "Expires"}: {review.expiresAt || "—"}. {es ? "Observaciones cómodas dentro del tiempo previsto; no renuevan referencias ni requieren pruebas máximas." : "Comfortable observations stay within planned minutes; they never renew anchors or require maximal tests."}</li>)}</ul></details>}
            {preview.eventTradeoffAgreementRequired && <label className="flex gap-2 items-start text-sm my-3"><input type="checkbox" checked={eventTradeoffsConfirmed} onChange={e=>setEventTradeoffsConfirmed(e.target.checked)}/>{es ? "He revisado mis eventos y acepto este plan conservador con preparación y recuperación limitadas, o puedo cancelar y cambiar las prioridades." : "I reviewed my events and accept this conservative plan with limited preparation and recovery, or I can cancel and change priorities."}</label>}
            {preview.doubleDayAgreementRequired && <label className="flex gap-2 items-start text-sm my-3"><input type="checkbox" checked={doubleDayConfirmed} onChange={e=>setDoubleDayConfirmed(e.target.checked)}/>I reviewed both sessions, dates and times for the optional pairs. I agree to report the first and complete a fresh check-in before the second; I can decline or skip without catch-up work.</label>}
            <div className="flex gap-3"><button type="button" className="btn-primary" disabled={generating||(preview.doubleDayAgreementRequired&&!doubleDayConfirmed)||(preview.eventTradeoffAgreementRequired&&!eventTradeoffsConfirmed)} onClick={()=>generate(undefined,true)}>{es ? "Confirmar y guardar este plan" : "Confirm and save this plan"}</button><button type="button" className="btn-secondary" onClick={()=>setPreview(null)}>{es ? "Cancelar vista previa" : "Cancel preview"}</button></div>
          </section>}
          {error && (
            <div role="alert" className="text-sm text-coral-600 mt-3 bg-coral-50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </details>

        {/* Zone table — compact. Full zone-by-zone descriptions live in Profile & Zones. */}
        {zones?.hr && (
          <details className="card">
            <summary className="min-h-11 cursor-pointer font-display font-bold text-lg">{es ? "Referencias de zonas del perfil" : "Profile zone references"}</summary>
            <p className="text-sm mt-2">{es ? "Calculadas a partir del perfil guardado; no son zonas medidas de una sesión." : "Calculated from your saved profile; these are not measured workout zones."} {zones.anchorHr ? `${zones.anchorHr} bpm` : "—"}</p>
            <p className="text-xs text-slate-400 mb-3">
              Z1 = recovery · Z2 = all-day pace · Z3 = comfortably hard · Z4 =
              threshold · Z5 = max. RPE = how hard it feels, 1–10. Full
              descriptions & swim/power zones in{" "}
              <a href="/settings" className="text-ocean-600 underline">
                Profile &amp; Zones
              </a>
              .
            </p>
            <div className="grid md:grid-cols-5 gap-2">
              {HR_ZONES.map((z) => {
                const r = zones.hr![z.key];
                const b = zones.bikeHr?.[z.key];
                return (
                  <div
                    key={z.key}
                    className="rounded-xl border border-sand-200 p-3 text-center"
                  >
                    <div className={`chip ${`chip-${z.key}`} mx-auto`}>
                      {z.name}
                    </div>
                    <div className="font-display text-lg font-bold mt-2">
                      {r.low}-{r.high}
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase">
                      bpm · RPE {z.rpe}
                    </div>
                    {b && (
                      <div className="text-[10px] text-slate-400">
                        bike {b.low}-{b.high}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
        )}

        {/* Intensity distribution — target vs actual */}
        {plan && actualEasy !== null && (
          <details className="card">
            <summary className="min-h-11 cursor-pointer font-display font-bold text-lg">{es ? "Distribución aeróbica prevista" : "Planned aerobic allocation"}</summary>
            <p className="text-xs text-slate-400 mb-3">
              Planned allocation: {actualEasy}% easy / {100 - actualEasy}% quality.
              {" "}Entire saved cycle: {plan.days?.[0]?.date?.slice(0,10)} – {plan.days?.at(-1)?.date?.slice(0,10)}; denominator {plannedDistribution.totalMinutes} planned aerobic minutes across {plannedDistribution.sessionCount} sessions. Strength and station work are excluded.
            </p>
            <p className="text-xs text-slate-600 mb-3">Achieved physiological zone distribution: —. These are prescribed session labels, not measured completed time in zones. No achieved ratio is inferred from this plan.</p>
            <div className="flex gap-1 h-6 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white"
                style={{ width: `${actualEasy}%` }}
              >
                Easy {actualEasy}%
              </div>
              <div
                className="bg-red-500 flex items-center justify-center text-[10px] font-bold text-white"
                style={{ width: `${100 - actualEasy}%` }}
              >
                Quality {100 - actualEasy}%
              </div>
            </div>
          </details>
        )}

        {/* Plan view */}
        {plan ? (
          <div className="space-y-4">
            {visibleDays.map((day: any) => {
              const off = day.dayOff;
              return (
                <div
                  key={day.id}
                  className={`card ${off ? "border-dashed border-slate-300 bg-slate-50" : ""}`}
                >
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <div className="text-sm font-semibold text-slate-500">
                      Week {day.week} ·{" "}
                      {new Date(day.date).toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                        timeZone: user?.timezone,
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleDayOff(day)}
                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${off ? "bg-ocean-600 text-white" : "bg-white border border-ocean-200 text-ocean-700"}`}
                      >
                        <CloudSun className="w-3.5 h-3.5 inline mr-1" />
                        {off ? (es?"Revisar regreso al entrenamiento":"Review return to training") : (es?"Marcar como descanso":"Make this a rest day")}
                      </button>
                    </div>
                  </div>

                  {off ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="font-semibold text-sm text-slate-700">
                        ☁️ {es ? "Descanso planificado" : "Planned rest"}
                      </div>
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {es ? "Sin entrenamiento obligatorio. Revisa cómo te sientes antes de volver a entrenar." : "No compulsory workout. Review how you feel before returning to training."}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-2 italic">
                        {es ? "El movimiento suave es opcional y se registra solo si se realiza. No se recuperan las sesiones omitidas." : "Comfortable movement is optional and should only be recorded if you do it. Missed sessions are not made up."}
                      </p>
                    </div>
                  ) : (
                    <div>
                      {day.sessions.map((s: any) => {
                        const Icon = SPORT_ICON[s.sport] || Dumbbell;
                        const done = s.completed;
                        const edit = editing[s.id];
                        const isExpanded = expanded.has(s.id);
                        return (
                          <div
                            key={s.id}
                            className={`rounded-xl mb-1.5 ${done ? "bg-emerald-50 border border-emerald-200" : "hover:bg-sand-100"}`}
                          >
                            <div className="flex flex-wrap items-center gap-2 p-2.5">
                              <div
                                className={`w-9 h-9 rounded-lg flex items-center justify-center ${done ? "bg-emerald-500 text-white" : "bg-ocean-100 text-ocean-700"}`}
                              >
                                <Icon className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-36">
                                <div className="font-semibold text-sm">
                                  {s.title}
                                </div>
                                <div className="text-xs text-slate-500 truncate">
                                  {fmtMin(s.durationMin)}
                                  {s.distanceKm
                                    ? ` · ${s.distanceKm} km`
                                    : ""}{" "}
                                  · {s.intensity} · {s.type}
                                </div>
                              </div>
                              <span
                                className={`chip ${`chip-${s.intensity || "unknown"}`} hidden sm:inline-flex`}
                              >
                                {s.intensity || "—"}
                              </span>
                              <button
                                onClick={() => startEdit(s)}
                                className="inline-flex min-h-11 min-w-11 items-center justify-center text-xs p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                                title={es ? "Editar sesión" : "Edit session"}
                                aria-label={es ? "Editar sesión" : "Edit session"}
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => toggleExpand(s.id)}
                                className="inline-flex min-h-11 items-center text-xs p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                                title={es ? "Detalles del entrenamiento" : "Workout details"}
                                aria-label={`${es ? "Detalles del entrenamiento" : "Workout details"}: ${s.title}`}
                                aria-expanded={isExpanded}
                              >
                                <span className="mr-1">{es ? "Detalles" : "Details"}</span>{isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <Link
                                href={`/daily?sessionId=${encodeURIComponent(s.id)}&feedback=1#workout-feedback`}
                                className={`inline-flex min-h-11 items-center text-xs font-semibold px-3 py-1.5 rounded-lg ${done ? "bg-emerald-600 text-white" : "bg-white border border-ocean-200 text-ocean-700"}`}
                              >
                                {done ? (es ? "Revisar resultado" : "Review result") : (es ? "Registrar resultado" : "Log result")}
                              </Link>
                            </div>

                            {isExpanded && (
                              <div className="px-3 pb-3 -mt-1 space-y-2">
                                {dateKey(new Date(day.date), user?.timezone) === dateKey(new Date(), user?.timezone) ? <UniversalWorkoutCardLoader key={`${s.id}-${s.revision}`} sessionId={s.id} es={es} heldPreview={<SavedWorkoutPreviewCard sessionId={s.id} es={es} compact plannedSession={s} />} onSaved={() => load()} /> : <SavedWorkoutPreviewCard key={`${s.id}-${s.revision}`} sessionId={s.id} es={es} compact plannedSession={s} />}
                                <Link className="btn-secondary inline-flex" href={`/daily?sessionId=${encodeURIComponent(s.id)}`}>{es ? "Abrir entrenamiento actual" : "Open current workout"}</Link>
                                {s.preWeightKg &&
                                  s.postWeightKg &&
                                  (() => {
                                    const h = analyzeHydration(
                                      s.preWeightKg,
                                      s.postWeightKg,
                                    );
                                    return (
                                      <p
                                        className={`text-[11px] leading-relaxed rounded-lg px-2 py-1.5 ${h.flag === "severe" ? "bg-coral-50 text-coral-700" : h.flag === "high" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
                                      >
                                        💧 {h.advice}
                                      </p>
                                    );
                                  })()}
                              </div>
                            )}

                            {edit && (
                              <div className="px-3 pb-3 -mt-1 flex flex-wrap items-end gap-2">
                                <div className="flex-1 min-w-40">
                                  <label className="label">Title</label>
                                  <input
                                    className="input"
                                    value={edit.title}
                                    onChange={(e) =>
                                      setEditing((p) => ({
                                        ...p,
                                        [s.id]: {
                                          ...p[s.id],
                                          title: e.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </div>
                                <div className="w-24">
                                  <label className="label">Min</label>
                                  <input
                                    type="number"
                                    className="input"
                                    value={edit.durationMin}
                                    onChange={(e) =>
                                      setEditing((p) => ({
                                        ...p,
                                        [s.id]: {
                                          ...p[s.id],
                                          durationMin: e.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </div>
                                <div className="w-28">
                                  <label className="label">Intensity</label>
                                  <select
                                    className="input"
                                    value={edit.intensity}
                                    onChange={(e) =>
                                      setEditing((p) => ({
                                        ...p,
                                        [s.id]: {
                                          ...p[s.id],
                                          intensity: e.target.value,
                                        },
                                      }))
                                    }
                                  >
                                    <option value="">{es ? "Sin cambiar / desconocida" : "Unchanged / unknown"}</option>
                                    {[
                                      "z1",
                                      "z2",
                                      "z3",
                                      "z4",
                                      "z5",
                                      "z6",
                                      "z7",
                                    ].map((z) => (
                                      <option key={z} value={z}>
                                        {z.toUpperCase()}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="w-24">
                                  <label className="label">Pre kg</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    className="input"
                                    value={edit.preWeightKg}
                                    onChange={(e) =>
                                      setEditing((p) => ({
                                        ...p,
                                        [s.id]: {
                                          ...p[s.id],
                                          preWeightKg: e.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="e.g. 74.2"
                                  />
                                </div>
                                <div className="w-24">
                                  <label className="label">Post kg</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    className="input"
                                    value={edit.postWeightKg}
                                    onChange={(e) =>
                                      setEditing((p) => ({
                                        ...p,
                                        [s.id]: {
                                          ...p[s.id],
                                          postWeightKg: e.target.value,
                                        },
                                      }))
                                    }
                                    placeholder="e.g. 73.4"
                                  />
                                </div>
                                <button
                                  onClick={() => saveEdit(s.id)}
                                  className="btn-primary text-xs px-3 py-2"
                                >
                                  <Save className="w-3.5 h-3.5 inline mr-1" />
                                  Save
                                </button>
                                <button
                                  onClick={() =>
                                    setEditing((p) => {
                                      const n = { ...p };
                                      delete n[s.id];
                                      return n;
                                    })
                                  }
                                  className="text-xs p-2 rounded-lg text-slate-400 hover:bg-slate-100"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
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
        ) : planLoaded && !loading && !loadError ? (
          <div className="card text-center py-16 text-slate-400">
            <Dumbbell className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-500">{es ? "Aún no tienes un plan guardado" : "No training plan yet"}</p>
            <p className="text-sm">
              {planningReadiness?.ready ? "Preview a cycle above, review its weeks and confirm it to save structured training. Today and the calendar will use the saved plan." : "Complete planning setup using the button above. You can browse protocols now; applying one requires a confirmed plan and a compatible session."}
            </p>
          </div>
        ) : null}
      </div>
    </ProtectedPage>
  );
}
