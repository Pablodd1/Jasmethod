"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { NextTrainingReview } from "./NextTrainingReview";
import { readTrainingJson } from "./training-read";
const Workout = dynamic(() => import("./UniversalWorkoutCard").then(module => module.UniversalWorkoutCardLoader));
type Day = { date: string; eventToday?: { name: string | null } | null; sessions: { id: string; title: string; sport: string }[] };
function isDay(value: unknown): value is Day {
  if (!value || typeof value !== "object") return false;
  const day = value as Day;
  return typeof day.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.date) && Array.isArray(day.sessions)
    && (day.eventToday == null || typeof day.eventToday === "object" && (day.eventToday.name === null || typeof day.eventToday.name === "string"))
    && day.sessions.every(session => session && typeof session.id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(session.id) && typeof session.title === "string" && typeof session.sport === "string");
}

type CompletedSession = { id: string; title: string; plannedMinutes: number | null; actualMinutes: number | null; effort: number | null };
type RecoveryReview = { feedbackDate: string; completedReview: CompletedSession[] | null; nextTrainingReview?: unknown };

function isRecoveryReview(value: unknown): value is RecoveryReview {
  if (!value || typeof value !== "object") return false;
  const { feedbackDate, completedReview } = value as RecoveryReview;
  const metric = (n: unknown) => n === null || (typeof n === "number" && Number.isFinite(n) && n >= 0);
  return typeof feedbackDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(feedbackDate) &&
    (completedReview === null || Array.isArray(completedReview) && completedReview.length <= 100 &&
      completedReview.every(row => row && typeof row.id === "string" && typeof row.title === "string" &&
        metric(row.plannedMinutes) && metric(row.actualMinutes) && metric(row.effort)));
}

export function CoachRecoveryReview({ es }: { es: boolean }) {
  const [review, setReview] = useState<RecoveryReview | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [showYesterday, setShowYesterday] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setReview(null);
    setUnavailable(false);
    readTrainingJson(showYesterday ? "/api/checkin" : "/api/checkin?feedbackDate=today", {
      signal: controller.signal, label: es ? "Revisión de recuperación" : "Recovery review", validate: isRecoveryReview,
    }).then(setReview, () => { if (!controller.signal.aborted) setUnavailable(true); });
    return () => controller.abort();
  }, [es, showYesterday]);
  return <section className="rounded-2xl border border-ocean-200 bg-white p-3 space-y-3 min-w-0" aria-label={es ? "Revisión de recuperación" : "Recovery review"}>
    <h3 className="font-semibold">{es ? "Revisa tu recuperación" : "Review your recovery"}</h3>
    <p className="text-sm">{es
      ? "Revisa el resultado y el esfuerzo de tu sesión reciente. Luego confirma cómo te sientes hoy para que JMM revise tu próxima sesión."
      : "Review the result and effort for your recent session. Then confirm how you feel today so JMM can reassess your next session."}</p>
    <button type="button" className="btn-secondary min-h-11" onClick={() => setShowYesterday(value => !value)}>
      {showYesterday ? (es ? "Ver hoy" : "View today") : (es ? "Ver ayer" : "View yesterday")}
    </button>
    {!review && !unavailable && <p role="status" className="text-sm">{es ? "Cargando resultados…" : "Loading results…"}</p>}
    {unavailable && <p role="status" className="text-sm">{es ? "Revisa tus resultados en el check-in." : "Open check-in to review your results."}</p>}
    {review && <>
      <p className="text-xs text-slate-600">{review.feedbackDate}</p>
      {review.completedReview === null ? <p className="text-sm">{es ? "Los registros necesitan revisión antes de compararlos." : "The records need review before comparison."}</p>
        : review.completedReview.length ? <ul className="space-y-2 text-sm">
          {review.completedReview.map(row => <li key={row.id}>
            <b>{row.title}</b>
            <span className="block">{es ? "Previsto" : "Planned"} {row.plannedMinutes ?? "—"} · {es ? "Realizado" : "Actual"} {row.actualMinutes ?? "—"} min · {es ? "Esfuerzo" : "Effort"} {row.effort == null ? "—" : `${row.effort}/10`}</span>
          </li>)}
        </ul> : <p className="text-sm">{es ? "No hay resultados para esa fecha." : "No results recorded for that date."}</p>}
    </>}
    <NextTrainingReview review={review?.nextTrainingReview} es={es} />
    <div className="flex flex-wrap gap-2">
      <Link href="/checkin#previous-session-heading" className="btn-secondary min-h-11">{es ? "Revisar actividad reciente" : "Review recent activity"}</Link>
      <Link href="/checkin#daily-questions" className="btn-primary min-h-11">{es ? "Actualizar check-in" : "Update check-in"}</Link>
    </div>
  </section>;
}

/** Browser-only protected view. Its contents are never added to conversation/model input. */
export function CoachTodayReview({ es, selectedId, onSelect, onSaved, onClose }: {
  es: boolean; selectedId: string; onSelect: (id: string) => void; onSaved: () => void | Promise<void>; onClose: () => void;
}) {
  const [day, setDay] = useState<Day | null>(null), [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setDay(null); setError("");
    readTrainingJson("/api/today", { signal: abort.signal, label: es ? "Entrenamiento de hoy" : "Today's workout", validate: isDay })
      .then(value => { if (!abort.signal.aborted) setDay(value); })
      .catch(cause => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : (es ? "No se pudo cargar la sesión." : "Could not load the session.")); });
    return () => abort.abort();
  }, [es, retry]);
  const current = day?.sessions.find(session => session.id === selectedId);
  return <section className="rounded-2xl border border-ocean-200 bg-white p-3 space-y-3 min-w-0" aria-label={es ? "Revisión protegida de hoy" : "Protected today review"}>
    <div className="flex justify-between gap-3"><h3 className="font-semibold">{es ? "Tu entrenamiento de hoy" : "Your training today"}</h3><button type="button" className="underline text-sm min-h-11" onClick={onClose}>{es ? "Cerrar tarjeta" : "Close card"}</button></div>
    <p className="text-xs text-slate-600">{es ? "Registro guardado en JMM · No se envía a IA externa ni se copia al historial del chat." : "Saved record inside JMM · Not sent to external AI or copied into chat history."} {day?.date}</p>
    {error && <div role="alert"><p>{error}</p><button type="button" className="btn-secondary" onClick={() => setRetry(value => value + 1)}>{es ? "Reintentar" : "Retry"}</button></div>}
    {!day && !error && <p role="status">{es ? "Consultando tu sesión guardada…" : "Checking your saved session…"}</p>}
    {day?.eventToday && <p role="status">{es ? "Evento de hoy" : "Today's event"} · {day.eventToday.name || (es ? "Día reservado" : "Reserved event day")} <Link href="/today" className="underline">{es ? "Abrir Hoy" : "Open Today"}</Link></p>}
    {day && !day.eventToday && !day.sessions.length && <p role="status">{es ? "No hay sesiones guardadas para hoy. Puedes revisar tu ciclo en Entrenamiento." : "No saved sessions for today. You can review your cycle in Training."} <Link href="/training" className="underline">{es ? "Ver ciclo" : "View cycle"}</Link></p>}
    {!!day?.sessions.length && <div className="flex flex-wrap gap-2">{day.sessions.map(session => <button type="button" key={session.id} className="btn-secondary min-h-11 whitespace-normal" aria-pressed={current?.id === session.id} onClick={() => onSelect(session.id)}>{session.title} · {session.sport}</button>)}</div>}
    {day && day.sessions.length > 0 && !current && <p>{es ? "Elige la sesión que quieres revisar; no se supondrá a cuál te refieres." : "Choose the session to review; we will not assume which one you mean."}</p>}
    {current && <Workout key={current.id + ":" + retry} sessionId={current.id} es={es} onSaved={async () => { setRetry(value => value + 1); await onSaved(); }} />}
  </section>;
}
