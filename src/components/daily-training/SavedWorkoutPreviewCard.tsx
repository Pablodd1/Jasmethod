"use client";

import React, { useEffect, useState } from "react";
import type { SavedWorkoutPreview } from "@/lib/saved-workout-preview-contract";
import { fetchSavedWorkoutPreview, savedPreviewNotice, savedPreviewPresentation } from "@/lib/saved-workout-preview-client";
import { WorkoutIntensityTimeline, WorkoutIntervalDetails, TrainingTargetSelector } from "./UniversalWorkoutCard";
import { endpointText } from "@/lib/universal-workout-card";
import { sportConsistentTitle } from "@/lib/session-purpose-title";

type PreviewDisplay = { compact?: boolean; embedded?: boolean; plannedSession?: {title:string;sport:string;durationMin:number} };

// Support both the original card and its compact guide disclosure. Only the
// unlabeled local-playback controls are removed; target selectors keep working.
const previewStyles = `
.saved-workout-preview-timeline .uwc-controls:not([aria-label]),
.saved-workout-preview-timeline .uwc-section > small,
.saved-workout-preview-timeline .uwc-guide > small,
.saved-workout-preview-timeline .uwc-extra > small { display: none !important; }
`;

export function SavedWorkoutPreviewView({ preview, es = false, compact = false, embedded = false, plannedSession }: { preview: SavedWorkoutPreview; es?: boolean } & PreviewDisplay) {
  const card = savedPreviewPresentation(preview, es);
  const notice = savedPreviewNotice(es);
  if (compact && !card && ["A current injury restriction blocks training.", "Rest day has no workout to export."].includes(preview.reason)) return <section className="uwc saved-workout-preview" aria-label={es ? "Revisión de la sesión" : "Workout review"}>
    <p role="status">{es ? preview.reason.startsWith("A current injury") ? "Una restricción de lesión actual mantiene el entrenamiento en pausa." : "Día de descanso previsto; no hay una sesión para ejecutar." : preview.reason}</p>
  </section>;
  if (compact && !card) return <section className="uwc saved-workout-preview" aria-label={es ? "Sesión prevista" : "Planned workout"}>
    {!embedded && plannedSession && <header className="uwc-header"><div><p>{plannedSession.sport.toUpperCase()}</p><h1>{sportConsistentTitle(plannedSession.title,plannedSession.sport)}</h1></div><div className="uwc-stats"><b>{Number.isFinite(plannedSession.durationMin) && plannedSession.durationMin > 0 ? `${plannedSession.durationMin} min` : "—"}<small>{es ? "TIEMPO PREVISTO" : "PLANNED TIME"}</small></b></div></header>}
    {embedded && plannedSession && Number.isFinite(plannedSession.durationMin) && plannedSession.durationMin > 0 && <p>{es ? "Tiempo previsto" : "Planned time"}: {plannedSession.durationMin} min</p>}
    <p role="status">{es ? "Pasos pendientes de revisión; no hay una adaptación aprobada." : "Steps need review; no approved daily adaptation."}</p>
    <a className="inline-flex min-h-11 items-center underline" href={`/daily?sessionId=${encodeURIComponent(preview.sessionId)}`}>{es ? "Revisar estructura" : "Review structure"}</a>
    <details className="text-sm"><summary>{es ? "Detalles de la revisión" : "Review details"}</summary><p>{preview.reason}</p></details>
  </section>;
  if (!card) return <section className="uwc saved-workout-preview" aria-label={es ? "Plan guardado" : "Saved plan preview"}>
    <p role="status">{notice}</p>
    <p>{es ? "La estructura guardada no está disponible. No se han deducido pasos ni objetivos." : "The saved structure is unavailable. No steps or targets were guessed."}</p>
    <p className="uwc-muted">{preview.reason}</p>
  </section>;
  const s = card.session;
  return <section className="uwc saved-workout-preview" aria-label={es ? "Plan guardado" : "Saved plan preview"}>
    <style>{previewStyles}</style>
    {!embedded && <header className="uwc-header">
      <div><p>{s.sport.toUpperCase()} · {s.dateLocal} · {s.timezone}</p><h1>{s.title}</h1></div>
      <div className="uwc-stats"><b>{s.exactTimeSeconds === null ? "~" : ""}{endpointText({ endpoint: { type: "time", seconds: s.exactTimeSeconds ?? s.durationMin * 60 } }, es ? "es" : "en")}<small>{es ? "DURACIÓN" : "DURATION"}</small></b></div>
    </header>}
    <div className="uwc-selected" role="status"><b>{compact ? (es ? "SESIÓN PREVISTA · SIN ADAPTAR" : "PLANNED WORKOUT · NOT ADAPTED") : (es ? "VISTA GUARDADA · SOLO LECTURA" : "SAVED PREVIEW · READ ONLY")}</b>{!compact && <p>{notice}</p>}</div>
    <div className="saved-workout-preview-timeline"><WorkoutIntensityTimeline card={card} /></div>
    <WorkoutIntervalDetails card={card} />
    <details className="uwc-extra"><summary>{es ? "Ritmo, potencia y frecuencia cardíaca" : "Pace, power & heart rate"}</summary><TrainingTargetSelector card={card} /></details>
    {compact && <details className="uwc-extra"><summary>{es ? "Acerca de esta vista" : "About this view"}</summary><p>{notice}</p></details>}
  </section>;
}

function SavedWorkoutPreviewLoader({ sessionId, es, ...display }: { sessionId: string; es: boolean } & PreviewDisplay) {
  const [preview, setPreview] = useState<SavedWorkoutPreview | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setPreview(null);
    setError("");
    fetchSavedWorkoutPreview(sessionId, { signal: abort.signal })
      .then(value => { if (!abort.signal.aborted && value.sessionId === sessionId) setPreview(value); })
      .catch(reason => { if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Could not load the saved preview."); });
    return () => abort.abort();
  }, [sessionId, retry]);
  if (preview?.sessionId === sessionId) return <SavedWorkoutPreviewView preview={preview} es={es} {...display} />;
  return <div role={error ? "alert" : "status"}>
    {error ? (es ? "No se pudo verificar la vista guardada. Reintenta para consultar la sesión." : error) : (es ? "Cargando plan guardado…" : "Loading saved plan preview…")}
    {error && <button type="button" className="btn-secondary ml-2" onClick={() => setRetry(value => value + 1)}>{es ? "Reintentar" : "Retry"}</button>}
  </div>;
}

export function SavedWorkoutPreviewCard({ sessionId, es = false, ...display }: { sessionId: string; es?: boolean } & PreviewDisplay) {
  // Keyed state prevents the previous session flashing during navigation, even
  // before effect cleanup runs. Each mounted Details view loads only its ID.
  return <SavedWorkoutPreviewLoader key={sessionId} sessionId={sessionId} es={es} {...display} />;
}
