"use client";

import React, { useEffect, useState } from "react";
import type { SavedWorkoutPreview } from "@/lib/saved-workout-preview-contract";
import { fetchSavedWorkoutPreview, savedPreviewNotice, savedPreviewPresentation } from "@/lib/saved-workout-preview-client";
import { WorkoutIntensityTimeline, WorkoutIntervalDetails, TrainingTargetSelector } from "./UniversalWorkoutCard";

// Support both the original card and its compact guide disclosure. Only the
// unlabeled local-playback controls are removed; target selectors keep working.
const previewStyles = `
.saved-workout-preview-timeline .uwc-controls:not([aria-label]),
.saved-workout-preview-timeline .uwc-section > small,
.saved-workout-preview-timeline .uwc-guide > small,
.saved-workout-preview-timeline .uwc-extra > small { display: none !important; }
`;

export function SavedWorkoutPreviewView({ preview, es = false }: { preview: SavedWorkoutPreview; es?: boolean }) {
  const card = savedPreviewPresentation(preview, es);
  const notice = savedPreviewNotice(es);
  if (!card) return <section className="uwc saved-workout-preview" aria-label={es ? "Plan guardado" : "Saved plan preview"}>
    <p role="status">{notice}</p>
    <p>{es ? "La estructura guardada no está disponible. No se han deducido pasos ni objetivos." : "The saved structure is unavailable. No steps or targets were guessed."}</p>
    <p className="uwc-muted">{preview.reason}</p>
  </section>;
  const s = card.session;
  return <section className="uwc saved-workout-preview" aria-label={es ? "Plan guardado" : "Saved plan preview"}>
    <style>{previewStyles}</style>
    <header className="uwc-header">
      <div><p>{s.sport.toUpperCase()} · {s.dateLocal} · {s.timezone}</p><h1>{s.title}</h1></div>
      <div className="uwc-stats"><b>{s.exactTimeSeconds === null ? "~" : ""}{Number((s.exactTimeSeconds === null ? s.durationMin : s.exactTimeSeconds / 60).toFixed(2))}<small>MIN</small></b></div>
    </header>
    <div className="uwc-selected" role="status"><b>{es ? "VISTA GUARDADA · SOLO LECTURA" : "SAVED PREVIEW · READ ONLY"}</b><p>{notice}</p></div>
    <div className="saved-workout-preview-timeline"><WorkoutIntensityTimeline card={card} /></div>
    <WorkoutIntervalDetails card={card} />
    <details className="uwc-extra"><summary>{es ? "Ritmo, potencia y frecuencia cardíaca" : "Pace, power & heart rate"}</summary><TrainingTargetSelector card={card} /></details>
  </section>;
}

function SavedWorkoutPreviewLoader({ sessionId, es }: { sessionId: string; es: boolean }) {
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
  if (preview?.sessionId === sessionId) return <SavedWorkoutPreviewView preview={preview} es={es} />;
  return <div role={error ? "alert" : "status"}>
    {error ? (es ? "No se pudo verificar la vista guardada. Reintenta para consultar la sesión." : error) : (es ? "Cargando plan guardado…" : "Loading saved plan preview…")}
    {error && <button type="button" className="btn-secondary ml-2" onClick={() => setRetry(value => value + 1)}>{es ? "Reintentar" : "Retry"}</button>}
  </div>;
}

export function SavedWorkoutPreviewCard({ sessionId, es = false }: { sessionId: string; es?: boolean }) {
  // Keyed state prevents the previous session flashing during navigation, even
  // before effect cleanup runs. Each mounted Details view loads only its ID.
  return <SavedWorkoutPreviewLoader key={sessionId} sessionId={sessionId} es={es} />;
}
