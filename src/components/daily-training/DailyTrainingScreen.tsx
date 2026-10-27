import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { DailyTraining, Guidance, PaceKey, Segment } from "./training-contract";
import { endpointLabel, plannedSeconds } from "./training-contract";
import { FitDownloadActions } from "./FitDownloadActions";
import { SavedWorkoutPreviewCard } from "./SavedWorkoutPreviewCard";
import { UniversalWorkoutCard } from "./UniversalWorkoutCard";
import { ActualFuelingFields } from "./ActualFuelingFields";
import { actualFuelingFromForm, type ActualFuelingPatch } from "@/lib/actual-fueling";
import { SessionMeasurementsFields } from './SessionMeasurementsFields';
import { observationsFromForm, type SessionObservations } from '@/lib/session-observations';

export type CompletionActual = { durationMinutes: number | null; actualSport: string | null; sessionRpe: number | null; comments: string | null; status: "completed" | "partial" | "substituted" | "skipped" | "unknown"; actualFueling?: ActualFuelingPatch | null; measurements?: SessionObservations };
type Props = {
  plan: DailyTraining;
  onFocusReady: (ready: boolean) => Promise<void>;
  onCompletion: (actual: CompletionActual) => Promise<void>;
  onSaved?: () => void | Promise<void>;
};
const paceNames: Record<PaceKey, string> = { mile: "Mile", "5k": "5K", "10k": "10K", half: "Half marathon", marathon: "Marathon", easy: "Easy" };
const paceKeys: PaceKey[] = ["mile", "5k", "10k", "half", "marathon", "easy"];
function pace(seconds: number | null, metric: boolean) {
  if (seconds == null) return "—";
  const value = Math.round(metric ? seconds / 1.609344 : seconds);
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}/${metric ? "km" : "mi"}`;
}
function GuidanceCard({ number, title, guide, children }: { number: string; title: string; guide: Guidance; children?: ReactNode }) {
  return <details className="jmm-panel"><summary><span className="jmm-num">{number}</span><b>{title}</b><span className="jmm-plus" aria-hidden="true">+</span></summary><div className="jmm-panel-body"><strong className="jmm-panel-title">{guide.title}</strong><ul>{guide.items.map((item, i) => <li key={i}>{item}</li>)}</ul>{guide.note && <p className="jmm-note">{guide.note}</p>}{children}</div></details>;
}
function segmentEndpoint(s: Segment) { return s.endpoint || (s.seconds == null ? undefined : { type: "time" as const, seconds: s.seconds }); }


/** Optional evidence details supplement the universal card without a second workout UI. */
export function TrainingReferenceDetails({ plan }: { plan: DailyTraining }) {
  const {session, profile} = plan;
  const metric = profile.unitSystem === "metric";
  const ready = session.verdict == null || session.verdict === "ready";
  const es = plan.language === "es";
  const missingTargets = [...new Set(plan.workoutCard
    ? plan.workoutCard.session.steps.flatMap(step => step.target.missingReason ? [step.target.missingReason] : [])
    : plan.blocks.flatMap(block => block.segments.flatMap(step => step.target.type === "open" && step.target.note ? [step.target.note] : [])))];
  return <details className="jmm-panel" data-training-references="true"><summary><b>{es ? "Referencias de entrenamiento, densidad y energía" : "Training references, density & energy"}</b><span className="jmm-plus" aria-hidden="true">+</span></summary>
    <section className="jmm-metrics" aria-label="Workout overview"><div><small>{session.durationIsEstimate ? "ESTIMATED TIME" : "TIME"}</small><b>{session.totalMinutes} min</b><span>{session.durationIsEstimate ? "Endpoints below control execution" : "including timed recovery"}</span></div><div><small>DENSITY</small><b>{ready && session.density.score != null ? `${session.density.score} / 10` : "—"}</b><span>{session.density.missingReason || session.density.label}</span></div><div><small>ENERGY</small><b>{session.calories.kcal == null ? "—" : `${session.calories.method === "estimate" ? "~" : ""}${Math.round(session.calories.kcal)} kcal`}</b><span>{session.calories.kcal == null ? session.calories.missingReason : session.calories.method}</span></div></section>
    {!ready && <p>{es ? "La duración indica que no hay una prescripción ejecutable; no es una medición de un entrenamiento realizado." : "The duration reflects no executable prescription; it is not a measurement of a completed workout."}</p>}
    {!!missingTargets.length && <div className="jmm-panel-body"><b>{es ? "Por qué faltan objetivos" : "Why targets are unavailable"}</b><ul>{missingTargets.map(reason => <li key={reason}>{reason}</li>)}</ul></div>}
<div className="jmm-panel-body"><p>Targets shown with each step are plan references, not live measurements. Missing benchmarks do not require a device.</p>{session.sport === "run" ? <div className="jmm-pace-grid">{paceKeys.map(key => <div key={key}><small>{paceNames[key]}</small><b>{pace(profile.paces[key].secondsPerMile, metric)}</b><span>{profile.paces[key].missingReason || profile.paces[key].status.replace("_", " ")}</span>{profile.paces[key].note && <span>{profile.paces[key].note}</span>}</div>)}</div> : <p>Use the {session.sport} instructions and targets below. Running race-pace references do not apply to this session.</p>}{["run", "bike"].includes(session.sport) && <p>Threshold HR: <b>{profile.thresholdHeartRate.bpm == null ? "— (not recorded)" : `${profile.thresholdHeartRate.bpm} bpm`}</b> · {profile.thresholdHeartRate.status.replace("_", " ")}</p>}<a href={plan.links.editProfile}>Edit training profile</a></div>
  </details>;
}

export function DailyTrainingScreen({ plan, onFocusReady, onCompletion, onSaved }: Props) {
  const { session, profile, blocks, guidance } = plan;
  const copy = (en: string, es: string) => plan.language === "es" ? es : en;
  const [focus, setFocus] = useState(plan.completion.focusReady);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [minutes, setMinutes] = useState<number | "">(plan.completion.actual?.durationMinutes ?? "");
  const [actualSport, setActualSport] = useState(plan.completion.actual?.actualSport ?? "");
  const [rpe, setRpe] = useState<number | "">(plan.completion.actual?.sessionRpe ?? "");
  const [comments, setComments] = useState(plan.completion.actual?.comments ?? "");
  const [outcome, setOutcome] = useState<CompletionActual["status"] | "">(plan.completion.actual?.status ?? "");
  const [saved, setSaved] = useState(Boolean(plan.completion.submittedAt));
  const [remaining, setRemaining] = useState<number | null>(null);
  const timerActive = remaining != null && remaining > 0;
  useEffect(() => {
    if (!timerActive) return;
    const id = window.setInterval(() => setRemaining(r => r == null ? null : Math.max(0, r - 1)), 1000);
    return () => window.clearInterval(id);
  }, [timerActive]);
  const metric = profile.unitSystem === "metric";
  const ready = session.verdict == null || session.verdict === "ready";
  const allTimed = blocks.length > 0 && blocks.every(b => b.segments.every(s => segmentEndpoint(s)?.type === "time"));
  const seconds = plannedSeconds(blocks);
  const mismatch = allTimed && Math.abs(seconds - session.totalMinutes * 60) > 1;
  const chart = blocks.flatMap(block => Array.from({ length: block.repeat }, (_, i) => block.segments.map(s => ({ ...s, chartKey: `${block.id}-${i}-${s.id}` }))).flat());
  async function toggleFocus() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError("");
    try { await onFocusReady(!focus); setFocus(!focus); }
    catch (cause) { setError((cause as Error).message || "Could not save focus. Try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    if (!outcome) { setError(copy("Choose what happened to this session before saving.", "Indica qué ocurrió antes de guardar.")); return; }
    if (rpe !== "" && (!Number.isInteger(rpe) || rpe < 0 || rpe > 10)) { setError(copy("Choose an effort between 0 and 10.", "Elige un esfuerzo entre 0 y 10.")); return; }
    if (minutes !== "" && (!Number.isInteger(minutes) || minutes < 0 || minutes > 1440)) { setError(copy("Actual minutes must be a whole number from 0 to 1440.", "Los minutos deben ser un número entero entre 0 y 1440.")); return; }
    pending.current = true; setBusy(true); setError("");
    try { const form = new FormData(event.currentTarget as HTMLFormElement); const actualFueling = actualFuelingFromForm(form), measurements = observationsFromForm(form, plan.profile.unitSystem, plan.completion.actual?.measurements); await onCompletion({ status: outcome, actualSport: actualSport || null, durationMinutes: minutes === "" ? null : minutes, sessionRpe: rpe === "" ? null : rpe, comments: comments.trim() || null, actualFueling, measurements }); setSaved(true); }
    catch (cause) { setError((cause as Error).message || "Could not save feedback. Your entries are still here; try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <main className="jmm-screen">
    {plan.workoutCard && <UniversalWorkoutCard key={plan.workoutCard.session.revision} card={plan.workoutCard} heldPreview={<SavedWorkoutPreviewCard sessionId={session.id} es={plan.language === "es"} />} onSaved={onSaved}/>}
    {plan.workoutCard && <div className="jmm-panel-body"><button type="button" className="jmm-button" disabled={busy||!ready} aria-pressed={focus} onClick={toggleFocus}>{focus?(plan.language==="es"?"Preparación lista ✓":"Focus ready ✓"):(plan.language==="es"?"Marcar preparación lista":"Mark focus ready")}</button>{error&&<p role="alert">{error}</p>}</div>}
    {plan.workoutCard && <TrainingReferenceDetails plan={plan} />}
    {!plan.workoutCard && <>
    <header className="jmm-brand"><span className="jmm-monogram">j.</span><div><b>JAS MIAMI METHOD</b><small>DAILY TRAINING</small></div><span className="jmm-kicker">{session.sport.toUpperCase()}</span></header>
    <section className="jmm-hero"><small>YOUR SESSION · {session.dateLocal} · {session.timezone}</small><h1>{session.title}</h1><p>{session.subtitle}</p><span className="jmm-pill">{session.verdict === "blocked" ? "Needs information" : session.verdict === "rest" ? "Rest" : session.planStatus.replace("_", " ")}</span><span className="jmm-pill">{session.sport}</span></section>
    {session.capability && session.sourceRevision && <FitDownloadActions key={`${session.id}-${session.sourceRevision}`} sessionId={session.id} revision={session.sourceRevision} title={session.title} capability={session.capability} />}
    {!ready && <p role="status" className="jmm-alert">{session.subtitle} {session.verdict === "blocked" && <a href="/checkin">Review today&apos;s check-in</a>}</p>}
    <TrainingReferenceDetails plan={plan} />
    {mismatch && <p className="jmm-alert" role="alert">Plan needs review: timed blocks total {Number((seconds / 60).toFixed(2))} min; the header says {session.totalMinutes} min.</p>}
    {error && <p className="jmm-alert" role="alert">{error}</p>}

    <GuidanceCard number="01" title="Before you begin · Preparation" guide={guidance.focus}><button type="button" className="jmm-button" disabled={busy || !ready} aria-pressed={focus} onClick={toggleFocus}>{focus ? "Focus ready ✓" : "Mark focus ready"}</button></GuidanceCard>
    <GuidanceCard number="02" title="Before training · Fuel" guide={guidance.preFuel} />
    {allTimed && <section className="jmm-chart-card" aria-label="Workout sequence"><div className="jmm-row"><b>Session map</b><small>timed step sequence</small></div><div className="jmm-chart" role="img" aria-label={chart.map(s => `${s.title}: ${endpointLabel(segmentEndpoint(s), metric, session.sport)}`).join("; ")}>{chart.map(s => <div key={s.chartKey} className={`jmm-bar jmm-${s.kind}`} style={{ flexGrow: (s.seconds || 0) / (seconds || 1), flexBasis: 0 }} title={`${s.title} · ${endpointLabel(segmentEndpoint(s), metric, session.sport)}`} />)}</div></section>}
    {blocks.length > 0 && <section className="jmm-workout"><small className="jmm-kicker">03 / STRUCTURED TRAINING</small><h2>Follow each endpoint in order.</h2>{blocks.map(block => <article key={block.id} className={`jmm-workout-block jmm-border-${block.segments[0]?.kind || "other"}`}><h3>{block.title}{block.repeat > 1 ? ` · ${block.repeat} rounds` : ""}</h3>{block.segments.map(s => <div className="jmm-segment" key={s.id}><strong>{endpointLabel(segmentEndpoint(s), metric, session.sport)} · {s.title}</strong><p>{s.instruction}</p><span>{s.target.label}</span>{s.target.note && <small>{s.target.note}</small>}{s.estimatedSeconds != null && s.estimatedSeconds > 0 && <small>Planning estimate only: {Number((s.estimatedSeconds / 60).toFixed(1))} min. End this step by its prescribed distance, reps or manual endpoint.</small>}</div>)}</article>)}</section>}
    <GuidanceCard number="04" title="After training · Recovery food" guide={guidance.postFuel} />
    <GuidanceCard number="05" title="Downshift · Optional breathing" guide={guidance.downshift}><button type="button" className="jmm-button" onClick={() => setRemaining(remaining == null || remaining === 0 ? guidance.downshift.timerSeconds : null)} disabled={!guidance.downshift.timerSeconds}>{remaining == null || remaining === 0 ? "Start optional timer" : "Stop timer"}</button><p role="status">{remaining == null ? "Wait until breathing is comfortable." : remaining === 0 ? "Done. Resume natural breathing." : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")} left`}</p></GuidanceCard>
    </>}
    <details className="jmm-panel"><summary><span className="jmm-num">06</span><b>{copy("Close the loop", "Cuéntanos cómo fue")}</b><span className="jmm-plus" aria-hidden="true">+</span></summary><div className="jmm-panel-body"><p>{guidance.checkIn.items.join(" ")}</p><form onSubmit={submit}><label>{copy("What happened?", "¿Qué ocurrió?")}<select required value={outcome} onChange={e => setOutcome(e.target.value as CompletionActual["status"])}><option value="">{copy("Choose an outcome", "Elige el resultado")}</option><option value="completed">{copy("Completed", "Completado")}</option><option value="partial">{copy("Partly completed", "Parcialmente completado")}</option><option value="substituted">{copy("Substituted (describe actual sport below)", "Sustituido (indica el deporte realizado abajo)")}</option><option value="skipped">{copy("Skipped", "Omitido")}</option><option value="unknown">{copy("Unknown / not reported", "Desconocido / sin informar")}</option></select></label><label>{copy("Actual sport (optional)", "Deporte realizado (opcional)")}<select value={actualSport} onChange={e => setActualSport(e.target.value)}><option value="">{copy("Unknown / not reported", "Desconocido / sin informar")}</option>{["run", "bike", "swim", "strength", "mobility", "recovery", "brick", "hyrox", "other"].map(s => <option key={s} value={s}>{copy(s, ({run:"carrera",bike:"bicicleta",swim:"natación",strength:"fuerza",mobility:"movilidad",recovery:"recuperación",brick:"combinado",hyrox:"HYROX",other:"otro"} as Record<string,string>)[s])}</option>)}</select></label><label>{copy("Actual minutes (leave blank if unknown)", "Minutos realizados (en blanco si no lo sabes)")}<input type="number" min="0" max="1440" value={minutes} onChange={e => setMinutes(e.target.value === "" ? "" : Number(e.target.value))} /></label><label>{copy("Session effort · 0 no effort, 10 maximal (optional)", "Esfuerzo · 0 sin esfuerzo, 10 máximo (opcional)")}<input type="number" min="0" max="10" value={rpe} onChange={e => setRpe(e.target.value === "" ? "" : Number(e.target.value))} /></label><SessionMeasurementsFields saved={plan.completion.actual?.measurements} details={{schemaVersion:1,values:{},fueling:plan.completion.actual?.actualFueling}} actualMinutes={plan.completion.actual?.durationMinutes} es={plan.language === "es"} units={plan.profile.unitSystem} /><ActualFuelingFields details={{schemaVersion:1,fueling:plan.completion.actual?.actualFueling}} actualDurationMin={plan.completion.actual?.durationMinutes} es={plan.language === "es"} /><label>{copy("How did it go?", "¿Cómo te fue?")}<textarea maxLength={1000} value={comments} onChange={e => setComments(e.target.value)} /></label><button className="jmm-button" type="submit" disabled={busy}>{busy ? copy("Saving…", "Guardando…") : copy("Save workout feedback", "Guardar comentario del entrenamiento")}</button>{saved && <p role="status">{copy("Workout feedback saved.", "Comentario del entrenamiento guardado.")}</p>}</form></div></details>
    {!plan.workoutCard && <footer className="jmm-foot">Session revision {session.revision}. Full web instructions remain available without a watch.</footer>}
  </main>;
}
