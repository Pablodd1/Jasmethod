"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SPORT_STRUCTURE_EXAMPLES } from "@/lib/sport-structure-examples";

type StructureMetadata = {
  sessionId: string; sport: string; revision: string; sportStructure: unknown | null;
  declaredBudgetMin: number | null; editable: boolean; reason: string | null; verdict: string; resolutionReason: string;
};
type Props = { sessionId: string; sport: string; disabled?: boolean; es?: boolean; athleteId?: string; onSaved: () => void | Promise<void> };

export function StructuredSportEditor({ sessionId, sport, disabled = false, es = false, athleteId, onSaved }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [metadata, setMetadata] = useState<StructureMetadata | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState<"loading" | "saving" | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const request = useRef<AbortController | null>(null);
  const textArea = useRef<HTMLTextAreaElement>(null);
  const example = SPORT_STRUCTURE_EXAMPLES[sport];
  const url = `/api/workout/structure?id=${encodeURIComponent(sessionId)}${athleteId ? `&athleteId=${encodeURIComponent(athleteId)}` : ""}`;

  useEffect(() => () => request.current?.abort(), []);
  async function load() {
    if (request.current || disabled) return;
    const controller = new AbortController(); request.current = controller;
    setBusy("loading"); setError(""); setStatus(""); setMetadata(null);
    try {
      const response = await fetch(url, { credentials: "include", cache: "no-store", signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load the saved structure.");
      if (data.sessionId !== sessionId || typeof data.revision !== "string") throw new Error("Unexpected session response. Reload the page.");
      if (controller.signal.aborted) return;
      setMetadata(data); setDraft(data.sportStructure === null ? "" : JSON.stringify(data.sportStructure, null, 2));
      setStatus(es ? "Se cargó la estructura guardada." : "Loaded the saved structure.");
    } catch (cause) { if (!controller.signal.aborted) setError((cause as Error).message); }
    finally { if (request.current === controller) request.current = null; if (!controller.signal.aborted) setBusy(null); }
  }
  function toggle() {
    if (busy === "saving") return;
    if (open) { request.current?.abort(); request.current = null; setBusy(null); setOpen(false); return; }
    setOpen(true); void load();
  }
  async function save(clear: boolean) {
    if (request.current || disabled || !metadata?.editable) return;
    let structure: unknown = null;
    if (!clear) {
      try {
        structure = JSON.parse(draft);
        if (!structure || typeof structure !== "object" || Array.isArray(structure)) throw new Error("Use a JSON object. Use Clear structure to remove it.");
      } catch (cause) { setError(`${es ? "JSON no válido" : "Invalid JSON"}: ${(cause as Error).message}`); textArea.current?.focus(); return; }
    }
    const controller = new AbortController(); request.current = controller;
    setBusy("saving"); setError(""); setStatus("");
    try {
      const response = await fetch(url, {
        method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ id: sessionId, expectedRevision: metadata.revision, sportStructure: structure }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) setMetadata(null);
        throw new Error(data.error || "Could not save the structure. Your JSON is still here.");
      }
      if (controller.signal.aborted) return;
      setMetadata(data); setDraft(data.sportStructure === null ? "" : JSON.stringify(data.sportStructure, null, 2));
      setStatus(data.message || (es ? "Estructura guardada." : "Structure saved."));
      await onSaved();
    } catch (cause) { if (!controller.signal.aborted) { setError((cause as Error).message); textArea.current?.focus(); } }
    finally { if (request.current === controller) request.current = null; if (!controller.signal.aborted) setBusy(null); }
  }

  if (!example) return null;
  const locked = disabled || !!busy || !metadata?.editable;
  return <section className="rounded-xl border border-slate-300 bg-white p-4 text-slate-900 space-y-3" aria-label={es ? "Estructura deportiva explícita" : "Explicit sport structure"}>
    <button type="button" className="btn-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700" aria-expanded={open} aria-controls={`${id}-panel`} disabled={disabled || busy === "saving"} onClick={toggle}>{open ? (es ? "Cerrar editor" : "Close editor") : (es ? "Editar estructura deportiva (JSON)" : "Edit sport structure (JSON)")}</button>
    {open && <div id={`${id}-panel`} className="space-y-3">
      <p className="text-sm">{es ? "Solo se guarda lo que introduces. No se deducen largos, cargas ni transiciones del texto. Siguen vigentes los límites del check-in." : "Only the structure you enter is saved. Lengths, loads and transitions are never inferred from prose. Current check-in limits still apply."}</p>
      <button type="button" className="btn-secondary" disabled={disabled || !!busy} onClick={() => void load()}>{busy === "loading" ? (es ? "Cargando…" : "Loading…") : (es ? "Recargar guardado (reemplaza el borrador)" : "Reload saved structure (replaces draft)")}</button>
      {metadata && <p className="text-sm">{es ? "Tiempo revisado" : "Reviewed time budget"}: {metadata.declaredBudgetMin == null ? (es ? "— requiere check-in" : "— complete check-in") : `${metadata.declaredBudgetMin} min`}. {es ? "La estructura debe respetar este límite." : "Your structure must fit this limit."}</p>}
      {metadata?.reason && <p role="status">{metadata.reason}</p>}
      {metadata && metadata.verdict !== "ready" && <p role="status">{metadata.resolutionReason}</p>}
      <label htmlFor={`${id}-json`} className="block font-medium">{es ? "Estructura deportiva JSON" : "Sport structure JSON"}</label>
      <textarea ref={textArea} id={`${id}-json`} value={draft} onChange={event => { setDraft(event.target.value); setError(""); setStatus(""); }} disabled={disabled || !!busy} readOnly={metadata !== null && !metadata.editable} rows={14} maxLength={60000} spellCheck={false} aria-invalid={!!error} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`} className="w-full rounded-lg border border-slate-500 bg-white p-3 font-mono text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700" />
      <p id={`${id}-help`} className="text-sm">{es ? "schemaVersion debe ser 1. Cada paso requiere campos explícitos y válidos. Los ejemplos son ficticios; ajústalos a tu plan antes de aplicar." : "schemaVersion must be 1. Every step needs valid, explicit fields. Examples are illustrative; edit them to match your plan before applying."}</p>
      <details>
        <summary className="cursor-pointer font-medium">{es ? "Ver ejemplos completos y campos" : "See full examples and fields"}</summary>
        <div className="space-y-3 pt-3">
          <p className="text-sm">{es ? "Pool: longitudes en m/yd, estilo y descansos. Strength: ejercicio, serie, repeticiones/tiempo/manual y carga opcional kg/lb. HYROX: carrera y estaciones en orden. Brick: componentes separados y una transición entre cada par." : "Pool: pool length in m/yd, strokes and rests. Strength: exercise, set number, reps/time/manual endpoint and optional kg/lb load. HYROX: runs and stations in order. Brick: separate components and one transition between each pair."}</p>
          <p className="text-sm">{es ? "estimatedSeconds es solo una estimación. Los envíos pool (sendOffSeconds opcional) se conservan en la web, pero bloquean el FIT nativo. Los estilos admitidos son freestyle, backstroke, breaststroke, butterfly, drill, mixed e im. Los componentes swim de brick usan sportStructure pool en vez de steps." : "estimatedSeconds is a planning estimate only. Optional pool sendOffSeconds stays in web instructions and blocks native FIT. Supported strokes are freestyle, backstroke, breaststroke, butterfly, drill, mixed and im. Brick swim components use a nested pool sportStructure instead of steps."}</p>
          {Object.entries(SPORT_STRUCTURE_EXAMPLES).map(([key, entry]) => <details key={key}>
            <summary className="cursor-pointer">{entry.label}</summary>
            <pre className="max-h-80 overflow-auto rounded-lg border border-slate-300 bg-slate-50 p-3 text-xs text-slate-900">{JSON.stringify(entry.structure, null, 2)}</pre>
            {key === sport && <button type="button" className="btn-secondary mt-2" disabled={locked} onClick={() => { setDraft(JSON.stringify(entry.structure, null, 2)); setError(""); setStatus(es ? "Ejemplo cargado como borrador. No está guardado." : "Example loaded as a draft. It has not been saved."); textArea.current?.focus(); }}>{es ? "Usar como borrador (no guarda)" : "Use as draft (does not save)"}</button>}
          </details>)}
        </div>
      </details>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={locked || !draft.trim()} onClick={() => void save(false)}>{busy === "saving" ? (es ? "Guardando…" : "Saving…") : (es ? "Aplicar estructura JSON" : "Apply JSON structure")}</button>
        <button type="button" className="btn-secondary" disabled={locked || metadata?.sportStructure == null} onClick={() => void save(true)}>{es ? "Borrar estructura" : "Clear structure"}</button>
      </div>
      <p className="text-sm">{es ? "Borrar elimina también los pasos antiguos. Deberás recalcular con el check-in antes de entrenar o exportar." : "Clearing also removes obsolete executable steps. Recalculate through check-in before training or export."}</p>
      {error && <p id={`${id}-error`} role="alert" className="text-red-800">{error}</p>}
      <p role="status" aria-live="polite">{status}</p>
    </div>}
  </section>;
}
