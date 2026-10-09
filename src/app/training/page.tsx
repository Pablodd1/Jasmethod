"use client";

import { trustedCycleMovementGuidance } from "@/lib/cycle-movement-guidance";
import { TrainingCycleOverview } from "@/components/training-cycle-overview";
import { TargetProgressPanel } from "@/components/target-progress-panel";
import { planningGoal } from "@/lib/planning-setup";
import { useEffect, useState } from "react";
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
import { workoutDetail } from "@/lib/workout-view";
import { addDaysKey, dateKey } from "@/lib/dates";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import {
  analyzeHydration,
  TRAINING_WINDOWS,
} from "@/lib/adaptive";
import { buildSessionDetail, HR_ZONES } from "@/lib/science";

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
  const es = user?.language === "es";
  const [plans, setPlans] = useState<any[]>([]);
  const [cycle, setCycle] = useState<any>(null);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [form, setForm] = useState({
    distance: "",
    weeks: "",
    startDate: dateKey(new Date(), user?.timezone),
    easyPct: "70",
    trainingWindow: "",
  });
  const [error, setError] = useState("");
  const [planningReadiness, setPlanningReadiness] = useState<any>(null);
  const [doubleDayConfirmed,setDoubleDayConfirmed]=useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [zones, setZones] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
    const [planResponse, profileResponse] = await Promise.all([
      fetch("/api/plan", {cache:"no-store", signal:AbortSignal.timeout(15000)}),
      fetch("/api/profile", {cache:"no-store", signal:AbortSignal.timeout(15000)}),
    ]);
    if (!planResponse.ok || !profileResponse.ok) throw Error("Could not load your plan and planning setup. Retry to check your saved information.");
    const [p, z] = await Promise.all([planResponse.json(), profileResponse.json()]);
    setPlans(p.plans || []);
    setCycle(p.cycle ?? null);
    setZones(z.zones);
    setProfile(z.profile);
    setPlanningReadiness(z.planningReadiness);
    setForm(previous => ({...previous, distance: previous.distance || planningGoal(z.profile?.goal) || "", weeks: previous.weeks || String(z.setup?.planWeeks ?? "")}));
    } catch (err) {
      setPlanningReadiness(null);
      setLoadError(err instanceof Error ? err.message : "Could not load training.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (user) load();
  }, [user]);

  async function generate(e?: React.FormEvent, confirmed = false) {
    e?.preventDefault();
    if (!planningReadiness?.ready) return;
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({...form, confirmDoubleDay:confirmed&&doubleDayConfirmed, preview: !confirmed, previewToken: confirmed ? preview?.previewToken : undefined}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      if (!confirmed) { setDoubleDayConfirmed(false); setPreview(data); return; }
      setPreview(null);
      setSavedMessage(es ? "Tu ciclo estructurado está guardado. Abre Hoy para un nuevo chequeo o elige un mes. Se conserva tu historial completado." : "Your structured training cycle is saved. Open Today for a fresh check-in, or choose a month below. Completed history is retained.");
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
    try {
      await api({ sessionId: session.id, completed: !session.completed });
    } catch (e: any) {
      setError(e.message);
    }
    load();
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
        intensity: f.intensity,
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
        intensity: s.intensity || "z2",
        preWeightKg: s.preWeightKg ? String(s.preWeightKg) : "",
        postWeightKg: s.postWeightKg ? String(s.postWeightKg) : "",
      },
    }));
  }

  const plan = plans[0];
  const setupHref = `/onboard?redo=1&advanced=1&step=race&return=training&goal=${encodeURIComponent(form.distance)}&weeks=${encodeURIComponent(form.weeks)}`;
  const months: string[] = Array.from(new Set<string>((plan?.days || []).map((day: any) => dateKey(new Date(day.date), user?.timezone).slice(0,7)))).sort();
  const visibleMonth = months.includes(selectedMonth) ? selectedMonth : months.includes(dateKey(new Date(), user?.timezone).slice(0,7)) ? dateKey(new Date(), user?.timezone).slice(0,7) : months[0] || "";
  const visibleDays = (plan?.days || []).filter((day: any) => dateKey(new Date(day.date), user?.timezone).startsWith(visibleMonth));
  const sessions = plan?.days?.flatMap((d: any) => d.sessions) || [];
  const completedCount = sessions.filter((s: any) => s.completed).length;
  const totalCount = sessions.length;
  const easyMin = sessions
    .filter((s: any) => s.intensity === "z1" || s.intensity === "z2")
    .reduce((a: number, s: any) => a + s.durationMin, 0);
  const totalMin = sessions.reduce((a: number, s: any) => a + s.durationMin, 0);
  const actualEasy = totalMin ? Math.round((easyMin / totalMin) * 100) : null;
  const targetEasy = plan?.easyPct ?? 70;

  return (
    <ProtectedPage>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold">{es ? "Plan de entrenamiento" : "Training Plan"}</h1>
            <p className="text-slate-500 text-sm">
              {es ? "Tu ciclo guardado, calendario mensual y sesiones estructuradas. Revisa lo realizado y tu recuperación antes de progresar." : "Your saved cycle, monthly schedule and structured sessions. Review actual training and recovery before progressing."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a href="/protocols" className="btn-primary">Training protocols</a>
            <a href="/api/training/export" className="btn-secondary">
              <Download className="w-4 h-4" /> Download all training
            </a>
            <span className="chip chip-z2">
              <Layers className="w-3.5 h-3.5" /> {completedCount}/{totalCount}{" "}
              sessions
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-500 -mt-4">
          The ZIP includes your complete training history and analytics data as
          CSV, the active plan as an importable calendar, and structured FIT
          files for compatible Garmin/COROS workflows.
        </p>

        {savedMessage && <p role="status" className="card border-emerald-300">{savedMessage}</p>}
        {plan && <TrainingCycleOverview es={es} plan={plan} cycle={cycle} timezone={user?.timezone || "America/New_York"} selectedMonth={visibleMonth} onMonthChange={setSelectedMonth} />}
        <TargetProgressPanel key={user?.id} language={user?.language} />

        {/* A saved cycle remains primary; replacing it is an explicit review. */}
        <details className="card" open={!plan}>
          <summary className="font-display font-bold text-lg mb-3 cursor-pointer">{plan ? (es ? "Revisar cambios del entrenamiento futuro" : "Review changes to future training") : (es ? "Crear y guardar tu ciclo de entrenamiento" : "Create and save your training cycle")}</summary>
          <p className="text-sm text-slate-500 mb-4">
            {profile?.lthr
              ? "Saved physiological references remain reported values; dated, verified anchors are needed for exact targets."
              : "No threshold benchmark is required. Use effort and talk-test guidance; missing physiology is not estimated from age, sex or weight."}
          </p>
          {loadError && <div role="alert" className="mb-4 rounded-lg border border-red-300 p-3"><p>{loadError}</p><button type="button" className="btn-secondary mt-2" disabled={loading} onClick={()=>void load()}>Retry loading training</button></div>}
          {planningReadiness && !planningReadiness.ready && <div role="status" className="mb-4 border border-amber-300 rounded-lg p-3 space-y-3">
            <p className="font-semibold">Complete your planning setup to unlock a preview</p>
            <p className="text-sm">You can use JMM without completing onboarding. A personalized plan needs your recent training, available time and current restrictions. No device, threshold test or race entry is required.</p>
            <details><summary className="cursor-pointer underline">See what needs review ({planningReadiness.missing.length + planningReadiness.review.length})</summary><ul className="list-disc ml-5 mt-2">{[...planningReadiness.missing, ...planningReadiness.review].map((reason:string)=><li key={reason}>{reason}</li>)}</ul></details>
            <a className="btn-primary" href={setupHref}>Complete planning setup</a>
            <p className="text-sm">Save your answers, return here, preview the plan, then confirm it. Protocols can then replace compatible upcoming sessions.</p>
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
                onChange={(e) => setForm({ ...form, distance: e.target.value })}
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
            </div>
            <div>
              <label htmlFor="plan-weeks" className="label">Weeks</label>
              <select
                id="plan-weeks"
                className="input"
                value={form.weeks}
                onChange={(e) => setForm({ ...form, weeks: e.target.value })}
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
                  setForm({ ...form, startDate: e.target.value })
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
                  setForm({ ...form, trainingWindow: e.target.value })
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
            <div>
              <label htmlFor="plan-split" className="label">
                Easy / quality split: {form.easyPct}% /{" "}
                {100 - Number(form.easyPct)}%
              </label>
              <input
                id="plan-split"
                type="range"
                min={50}
                max={85}
                step={5}
                className="w-full accent-cyan-600"
                value={form.easyPct}
                onChange={(e) => setForm({ ...form, easyPct: e.target.value })}
              />
              <div className="text-[10px] text-slate-400 mt-0.5">
                % of weekly minutes in Z1-Z2 (easy). 70 = 70/30.
              </div>
            </div>
            {planningReadiness && !planningReadiness.ready ? <a href={setupHref} className="btn-primary justify-center">Complete setup to preview</a> : <button
              type="submit"
              disabled={generating || loading || !planningReadiness?.ready}
              className="btn-primary justify-center"
            >
              {loading ? "Loading setup…" : generating ? (
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
            {preview.preview.recoveryPolicy && <div className="my-3 rounded-lg border border-ink-200 bg-paper p-3 space-y-2">
              <p><strong>Recovery planning:</strong> {preview.preview.recoveryPolicy.minimumRestDays === 0 ? "No fixed minimum off-days for a professional profile. This does not require seven training days." : `At least ${preview.preview.recoveryPolicy.minimumRestDays} planned off-day${preview.preview.recoveryPolicy.minimumRestDays === 1 ? "" : "s"} per seven-day plan block for your current experience level.`}</p>
              <p className="text-sm">These are coaching defaults, not universal research-established off-day counts. Your unavailable days, symptoms, fatigue and coach review can require more rest. Review the dates below before confirming.</p>
              <p className="text-sm"><strong>First week off-days:</strong> {preview.preview.weeksPreview[0]?.restDaySlots?.length ? preview.preview.weeksPreview[0].restDaySlots.map((slot:number)=>addDaysKey(dateKey(new Date(preview.preview.startDate),user?.timezone),slot)).join(", ") : "None fixed in this preview; add rest whenever needed."} No compulsory workout is assigned on these dates. Planned rest does not count as confirmed completed rest.</p>
            </div>}
            <p>{preview.warning}</p>
            {preview.preview.cycle && <div className="my-3 space-y-2 text-sm"><p><strong>Assessment:</strong> {preview.preview.cycle.assessment}</p><p><strong>Recent training:</strong> {preview.preview.cycle.activity.reportedSessions} performed sessions recorded; missing reports are not counted as zero. {preview.preview.cycle.activity.recoveryReview ? "Recent effort or incomplete work calls for a reduced opening week." : "Daily recovery still needs review."}</p><p>Planned week totals: {preview.preview.cycle.weeks.map((week:any) => `W${week.week}: ${week.totalMinutes} min`).join(" · ")}</p></div>}
            <p>{preview.preview.existingPlans ? "Confirming will archive the current plan and supersede its uncompleted future sessions. History is retained." : "Confirming will assign this provisional plan."}</p>
            <details className="my-3"><summary className="cursor-pointer underline">Review every week, off-day and session</summary>{preview.preview.weeksPreview.map((week:any,weekIndex:number)=><div className="my-4" key={week.week}>
              <h4 className="font-semibold">Week {week.week}: {week.theme} · {week.totalMinutes} min</h4>
              <p className="text-sm">{week.doubleDayNote}</p>
              <ul className="mt-2 space-y-2">{Array.from({length:7},(_,slot)=>{
                const localDay=addDaysKey(dateKey(new Date(preview.preview.startDate),user?.timezone),weekIndex*7+slot);
                const sessions=week.sessions.filter((session:any)=>session.daySlot===slot);
                const isOff=week.restDaySlots?.includes(slot) || sessions.length===0;
                return <li key={slot} className="border-l-2 border-ink-200 pl-3">
                  <strong>{localDay}{isOff?" · Planned off-day":""}</strong>
                  {isOff?<p className="text-sm">No compulsory workout. Optional recovery guidance remains separate; record only what you actually do.</p>:sessions.map((session:any,index:number)=><p key={index}>{session.startTime ? `${session.startTime} · ` : ""}{session.sport}: {session.title}, {session.minutes} min, {session.zone}. {session.movedFromSlot!==undefined ? `Moved from ${addDaysKey(dateKey(new Date(preview.preview.startDate),user?.timezone),weekIndex*7+session.movedFromSlot)}. ` : ""}{session.description}{session.steps?.length > 0 && <span className="block mt-1 text-xs">{session.steps.map((step:any) => `${step.name}: ${step.reps ? `${step.reps} reps (time allocation estimated)` : `${Math.round(step.seconds / 6) / 10} min`} · ${step.zone}${trustedCycleMovementGuidance(step, es ? "es" : "en") ? `. ${trustedCycleMovementGuidance(step, es ? "es" : "en")}` : ""}`).join(" → ")}</span>}</p>)}
                </li>;
              })}</ul>
            </div>)}</details>
            {preview.doubleDayAgreementRequired && <label className="flex gap-2 items-start text-sm my-3"><input type="checkbox" checked={doubleDayConfirmed} onChange={e=>setDoubleDayConfirmed(e.target.checked)}/>I reviewed both sessions, dates and times for the optional pairs. I agree to report the first and complete a fresh check-in before the second; I can decline or skip without catch-up work.</label>}
            <div className="flex gap-3"><button type="button" className="btn-primary" disabled={generating||(preview.doubleDayAgreementRequired&&!doubleDayConfirmed)} onClick={()=>generate(undefined,true)}>{es ? "Confirmar y guardar este plan" : "Confirm and save this plan"}</button><button type="button" className="btn-secondary" onClick={()=>setPreview(null)}>{es ? "Cancelar vista previa" : "Cancel preview"}</button></div>
          </section>}
          {error && (
            <div role="alert" className="text-sm text-coral-600 mt-3 bg-coral-50 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </details>

        {/* Zone table — compact. Full zone-by-zone descriptions live in Profile & Zones. */}
        {zones?.hr && (
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-1">
              Your Training Zones (max HR {zones.anchorHr} bpm)
            </h2>
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
          </div>
        )}

        {/* Intensity distribution — target vs actual */}
        {plan && actualEasy !== null && (
          <div className="card">
            <h2 className="font-display font-bold text-lg mb-1">
              Intensity Distribution
            </h2>
            <p className="text-xs text-slate-400 mb-3">
              Your target: {targetEasy}% easy / {100 - targetEasy}% quality ·
              Actual in this plan: {actualEasy}% easy / {100 - actualEasy}%
              quality (peak/taper weeks keep race-specific work).
            </p>
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
            <div className="flex gap-1 h-1.5 mt-1 rounded-full overflow-hidden opacity-60">
              <div
                className="bg-slate-300"
                style={{ width: `${targetEasy}%` }}
              />
              <div
                className="bg-slate-400"
                style={{ width: `${100 - targetEasy}%` }}
              />
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              ▁ target marker
            </div>
          </div>
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
                        {off ? "Resume training" : "Day off"}
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
                            <div className="flex items-center gap-3 p-2.5">
                              <div
                                className={`w-9 h-9 rounded-lg flex items-center justify-center ${done ? "bg-emerald-500 text-white" : "bg-ocean-100 text-ocean-700"}`}
                              >
                                <Icon className="w-5 h-5" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-sm truncate">
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
                                className={`chip ${`chip-${s.intensity || "z2"}`} hidden sm:inline-flex`}
                              >
                                {s.intensity || "Z2"}
                              </span>
                              <button
                                onClick={() => startEdit(s)}
                                className="text-xs p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
                                title="Edit session"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => toggleExpand(s.id)}
                                className="text-xs p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
                                title="Details"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                onClick={() => toggleComplete(s)}
                                className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${done ? "bg-emerald-600 text-white" : "bg-white border border-ocean-200 text-ocean-700"}`}
                              >
                                {done ? "✓" : "Done"}
                              </button>
                            </div>

                            {isExpanded && (
                              <div className="px-3 pb-3 -mt-1 space-y-2">
                                {(() => {
                                  const d = workoutDetail(s, user?.profile);
                                  return (
                                    <div className="rounded-xl border border-ocean-100 bg-ocean-50/50 p-3 space-y-1.5 text-xs">
                                      <p className="text-slate-700">
                                        <span className="font-bold text-ocean-700">
                                          WARM-UP
                                        </span>{" "}
                                        — {d.wu}
                                      </p>
                                      <p className="text-slate-700">
                                        <span className="font-bold text-ocean-700">
                                          MAIN SET
                                        </span>{" "}
                                        — {d.main}
                                      </p>
                                      <p className="text-slate-700">
                                        <span className="font-bold text-ocean-700">
                                          COOL-DOWN
                                        </span>{" "}
                                        — {d.cd}
                                      </p>
                                      <p className="text-slate-500">
                                        🧘 {d.breathing}
                                      </p>
                                      <p className="text-slate-400">
                                        📚 Study: {d.study}
                                      </p>
                                    </div>
                                  );
                                })()}
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
        ) : (
          <div className="card text-center py-16 text-slate-400">
            <Dumbbell className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="font-medium text-slate-500">{es ? "Aún no tienes un plan guardado" : "No training plan yet"}</p>
            <p className="text-sm">
              {planningReadiness?.ready ? "Preview a cycle above, review its weeks and confirm it to save structured training. Today and the calendar will use the saved plan." : "Complete planning setup using the button above. You can browse protocols now; applying one requires a confirmed plan and a compatible session."}
            </p>
          </div>
        )}
      </div>
    </ProtectedPage>
  );
}
