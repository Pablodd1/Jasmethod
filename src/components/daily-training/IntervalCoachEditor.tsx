"use client";
import React, { useCallback, useEffect, useState } from "react";
import { endpointText } from "@/lib/universal-workout-card";
import type { UniversalWorkoutCard } from "@/lib/universal-workout-card";

/**
 * "Tell your coach what to change." Preview → (confirm if it raises load) → apply → approve again.
 * All logic lives on the server (parser, limits, single-writer save, audit); this component only shows the
 * preview it is given and sends the athlete's confirmation. Nothing here exports, sends or approves anything.
 */
interface Preview { before: Summary; after: Summary; changes: string[]; requiresConfirmation: boolean; confirmationReasons: string[] }
interface Summary { repeats: number; workSeconds: number | null; restSeconds: number | null; workZone: number | null; totalSeconds: number }
interface HistoryEntry { id: string; at: string; kind: string; summary: string; approvalCleared: boolean }
interface SuggestionResponse { suggestion: { kind: "reduce" | "hold" | "progress" | "none"; patch: Record<string, number> | null; requiresConfirmation: boolean; reasons: string[] } | null; basedOn?: { title: string; date: string } }
interface HistoryResponse { history: HistoryEntry[]; approval: { approved: boolean; approvedAt: string | null; reason: string }; canRestoreLatestStepEdit: boolean }

export function IntervalCoachEditor({ card, onSaved }: { card: UniversalWorkoutCard; onSaved: () => void | Promise<void> }) {
  const es = card.language === "es", s = card.session;
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<{ patch: unknown; data: Preview } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [proposal, setProposal] = useState<SuggestionResponse | null>(null);
  useEffect(() => { setPreview(null); setConfirmed(false); setHistory(null); setProposal(null); setText(""); }, [s.id, s.revision, s.athleteId]);
  const q = `?athleteId=${encodeURIComponent(s.athleteId)}`;

  const call = useCallback(async (body: Record<string, unknown>) => {
    const response = await fetch(`/api/workout/interval-edit${q}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, expectedRevision: s.revision, ...body }) });
    const data = await response.json();
    return { response, data };
  }, [q, s.id, s.revision]);

  const loadProposal = useCallback(async () => {
    try {
      const response = await fetch(`/api/workout/next-suggestion${q}&id=${encodeURIComponent(s.id)}`, { cache: "no-store" });
      if (response.ok) setProposal(await response.json());
    } catch { /* proposals are optional */ }
  }, [q, s.id]);

  const loadHistory = useCallback(async () => {
    try {
      const response = await fetch(`/api/workout/history${q}&id=${encodeURIComponent(s.id)}`, { cache: "no-store" });
      if (response.ok) setHistory(await response.json());
    } catch { /* history is optional */ }
  }, [q, s.id]);

  const unavailable = s.verdict !== "ready" ? (es ? "Primero revisa el check-in y el bloqueo de esta sesión. El editor no puede autorizar el entrenamiento." : "Review this session's check-in and hold first. The editor cannot clear exercise.")
    : !["run", "bike"].includes(s.sport) ? (es ? "Los comandos de intervalos admiten carrera y ciclismo. Revisa los pasos guardados de este deporte en la tarjeta." : "Interval commands support running and cycling. Review this sport's saved steps in the workout card.")
    : !s.steps.length || !s.steps.every(step => step.endpoint.type === "time") ? (es ? "Esta sesión no tiene una secuencia de intervalos por tiempo compatible. No se convierten distancias o repeticiones en segundos supuestos." : "This session has no supported timed interval sequence. Distance or repetition steps are not converted into assumed seconds.") : null;
  if (unavailable) return <details data-testid="interval-coach-unavailable"><summary className="cursor-pointer underline">{es ? "Disponibilidad de los comandos de intervalos" : "Interval command availability"}</summary><p className="text-sm mt-2">{unavailable}</p></details>;

  async function doPreview(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !text.trim()) return;
    setBusy(true); setError(""); setDone(""); setPreview(null); setConfirmed(false);
    try {
      const { response, data } = await call({ mode: "preview", text });
      if (!response.ok || !data.ok) throw new Error(data.message || data.error || (es ? "No se pudo previsualizar." : "Could not preview."));
      setPreview({ patch: data.patch, data: data.preview });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function previewPatch(patch: Record<string, number>) {
    if (busy) return;
    setBusy(true); setError(""); setDone(""); setPreview(null); setConfirmed(false);
    try {
      const { response, data } = await call({ mode: "preview", patch });
      if (!response.ok || !data.ok) throw new Error(data.message || data.error || (es ? "No se pudo previsualizar." : "Could not preview."));
      setPreview({ patch: data.patch, data: data.preview });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function doApply() {
    if (busy || !preview) return;
    setBusy(true); setError("");
    try {
      const { response, data } = await call({ mode: "apply", patch: preview.patch, text, confirmed });
      if (!response.ok || !data.ok) throw new Error(data.message || data.error || (es ? "No se pudo guardar." : "Could not save."));
      setPreview(null); setText(""); setConfirmed(false);
      setDone(es ? "Guardado. La aprobación anterior se eliminó: aprueba de nuevo antes de exportar o enviar." : "Saved. The previous approval was cleared: approve again before exporting or sending.");
      await onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function undo() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/workout/card${q}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: s.id, expectedRevision: s.revision, action: "restore" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || (es ? "No se pudo restaurar." : "Could not restore."));
      setDone(es ? "Se restauraron los pasos anteriores. Aprueba de nuevo." : "Previous steps restored. Approve again.");
      await onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const mins = (sec: number) => endpointText({ endpoint: { type: "time", seconds: sec } }, es ? "es" : "en");

  return (
    <details data-testid="interval-coach-editor" onToggle={event => { if ((event.currentTarget as HTMLDetailsElement).open) { void loadHistory(); void loadProposal(); } }}>
      <summary>{es ? "Cambiar intervalos con tu coach" : "Change intervals with your coach"}</summary>
      <p>{es ? "Escribe qué quieres cambiar, por ejemplo “5 × 4 min con 2 min de descanso”. Verás una vista previa antes de guardar; guardar elimina la aprobación." : "Say what you want, for example “5 × 4 min with 2 min rest”. You'll see a preview before anything is saved; saving clears the approval."}</p>
      {proposal?.suggestion && proposal.suggestion.kind !== "none" && (
        <section aria-label={es ? "Sugerencia basada en tu última actividad" : "Suggestion based on your latest activity"} data-testid="interval-suggestion">
          <p><strong>{es ? "Sugerencia" : "Suggestion"}</strong>{proposal.basedOn ? ` · ${proposal.basedOn.title}` : ""}</p>
          <ul>{proposal.suggestion.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          {proposal.suggestion.patch
            ? <button type="button" disabled={busy} onClick={() => previewPatch(proposal.suggestion!.patch!)}>{es ? "Ver este cambio" : "Preview this change"}</button>
            : <p>{es ? "Sin cambio propuesto." : "No change proposed."}</p>}
        </section>
      )}
      <form onSubmit={doPreview}>
        <label>
          {es ? "Cambio" : "Change"}
          <input type="text" value={text} maxLength={400} onChange={event => setText(event.target.value)} placeholder={es ? "p. ej. un intervalo menos" : "e.g. one less interval"} />
        </label>
        <button type="submit" disabled={busy || !text.trim()}>{es ? "Vista previa" : "Preview"}</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <section aria-label={es ? "Vista previa del cambio" : "Change preview"} data-testid="interval-preview">
          <ul>{preview.data.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
          <p>{es ? "Antes" : "Before"}: {preview.data.before.repeats} × {preview.data.before.workSeconds == null ? "—" : mins(preview.data.before.workSeconds)} · {es ? "Después" : "After"}: {preview.data.after.repeats} × {preview.data.after.workSeconds == null ? "—" : mins(preview.data.after.workSeconds)} · {mins(preview.data.before.totalSeconds)} → {mins(preview.data.after.totalSeconds)}</p>
          {preview.data.requiresConfirmation && (
            <label>
              <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />{" "}
              {es ? "Entiendo que esto aumenta la carga: " : "I understand this raises the load: "}{preview.data.confirmationReasons.join(" ")}
            </label>
          )}
          <button type="button" disabled={busy || (preview.data.requiresConfirmation && !confirmed)} onClick={doApply}>{es ? "Guardar cambio" : "Save change"}</button>{" "}
          <button type="button" disabled={busy} onClick={() => { setPreview(null); setConfirmed(false); }}>{es ? "Descartar" : "Discard"}</button>
        </section>
      )}
      {done && <p role="status">{done}</p>}
      {history && (
        <section aria-label={es ? "Historial de cambios" : "Change history"} data-testid="interval-history">
          <p>{history.approval.approved ? (es ? "Aprobado para esta revisión." : "Approved for this revision.") : history.approval.reason === "revision_changed" ? (es ? "Cambió desde la última aprobación: falta aprobar de nuevo." : "Changed since the last approval: approve again.") : (es ? "Aún sin aprobar." : "Not approved yet.")}</p>
          {history.history.length === 0 ? <p>{es ? "Sin cambios registrados." : "No changes recorded."}</p> : <ol>{history.history.slice(0, 8).map(h => <li key={h.id}>{new Date(h.at).toLocaleString(es ? "es" : "en")} — {h.summary}</li>)}</ol>}
          {history.canRestoreLatestStepEdit && <button type="button" disabled={busy} onClick={undo}>{es ? "Deshacer el último cambio de pasos" : "Undo last step change"}</button>}
        </section>
      )}
    </details>
  );
}
