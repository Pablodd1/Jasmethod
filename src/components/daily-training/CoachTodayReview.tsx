"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { readTrainingJson } from "./training-read";
const Workout = dynamic(() => import("./UniversalWorkoutCard").then(module => module.UniversalWorkoutCardLoader));
type Day = { date: string; sessions: { id: string; title: string; sport: string }[] };
function isDay(value: unknown): value is Day {
  if (!value || typeof value !== "object") return false;
  const day = value as Day;
  return typeof day.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.date) && Array.isArray(day.sessions)
    && day.sessions.every(session => session && typeof session.id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(session.id) && typeof session.title === "string" && typeof session.sport === "string");
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
    {day && !day.sessions.length && <p role="status">{es ? "No hay sesiones guardadas para hoy. No se ha generado ni supuesto un entrenamiento. Puedes revisar un ciclo en las herramientas de abajo." : "No saved sessions for today. No workout has been generated or assumed. You can review a cycle using the tools below."}</p>}
    {!!day?.sessions.length && <div className="flex flex-wrap gap-2">{day.sessions.map(session => <button type="button" key={session.id} className="btn-secondary min-h-11 whitespace-normal" aria-pressed={current?.id === session.id} onClick={() => onSelect(session.id)}>{session.title} · {session.sport}</button>)}</div>}
    {day && day.sessions.length > 0 && !current && <p>{es ? "Elige la sesión que quieres revisar; no se supondrá a cuál te refieres." : "Choose the session to review; we will not assume which one you mean."}</p>}
    {current && <Workout key={current.id + ":" + retry} sessionId={current.id} es={es} onSaved={async () => { setRetry(value => value + 1); await onSaved(); }} />}
  </section>;
}
