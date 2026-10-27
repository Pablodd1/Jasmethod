"use client";
import { useState } from "react";
import { sessionWeightInput } from "@/lib/session-observations";
import { weightFromDisplay, weightToDisplay, type UnitSystem } from "@/lib/units";

type Measurement = { weightKg: number; observedAt: string; revision: string; source: "athlete_reported" };
type Session = { id: string; title: string; feedbackRevision: string; preWorkoutWeight?: Measurement | null };
export function PreWorkoutWeightCard({ session, units, es, disabled, onSaved }: { session: Session; units: UnitSystem; es: boolean; disabled: boolean; onSaved: () => Promise<void> }) {
  const [value, setValue] = useState(sessionWeightInput(session.preWorkoutWeight?.weightKg, units));
  const [saving, setSaving] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState("");
  const unit = units === "imperial" ? "lb" : "kg";
  async function save(remove = false) {
    if (saving || disabled) return;
    if (!remove && !value.trim()) { setError(es ? "Introduce un peso o deja esta opción sin usar." : "Enter a weight or leave this optional step unused."); return; }
    const number = Number(value);
    const previous = session.preWorkoutWeight?.weightKg;
    const kg = remove ? null : previous != null && number === Number(sessionWeightInput(previous, units)) ? previous : Number(weightFromDisplay(number, units).toFixed(4));
    if (!remove && (!Number.isFinite(kg) || kg! < 20 || kg! > 350)) { setError(es ? "Introduce un peso válido." : "Enter a valid weight."); return; }
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/workout/pre-weight", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: session.id, expectedRevision: session.feedbackRevision, expectedMeasurementRevision: session.preWorkoutWeight?.revision ?? null, weightKg: kg }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || (es ? "No se pudo guardar." : "Could not save."));
      if (result.ok !== true || result.sessionId !== session.id || (remove ? result.measurement !== null : result.measurement?.weightKg !== kg || result.measurement?.source !== "athlete_reported" || typeof result.measurement?.revision !== "string")) throw new Error(es ? "No se pudo verificar el guardado. Recarga." : "The save could not be verified. Reload.");
      setMessage(remove ? (es ? "Peso eliminado." : "Weight removed.") : (es ? "Peso guardado." : "Weight saved."));
      await onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : (es ? "No se pudo guardar." : "Could not save.")); }
    finally { setSaving(false); }
  }
  return <details className="card space-y-3">
    <summary className="cursor-pointer font-semibold">{es ? "Peso antes del entrenamiento (opcional)" : "Weight before training (optional)"}{session.preWorkoutWeight ? ` · ${sessionWeightInput(session.preWorkoutWeight.weightKg, units)} ${unit} ${es ? "guardado" : "saved"}` : ""}</summary>
    <p className="text-sm my-2">{session.title}. {es ? "Usa la misma báscula y ropa seca. Esto no registra la sesión como completada." : "Use the same scale and dry clothing. This does not mark the session complete."}</p>
    <form onSubmit={event => { event.preventDefault(); void save(); }} className="space-y-3">
      <label>{es ? `Peso antes (${unit})` : `Weight before (${unit})`}<input className="input" type="number" min={weightToDisplay(20, units)} max={weightToDisplay(350, units)} step="any" value={value} onChange={event => setValue(event.target.value)} /></label>
      {session.preWorkoutWeight && <p className="text-sm">{es ? "Registrado" : "Recorded"}: {new Date(session.preWorkoutWeight.observedAt).toLocaleString(es ? "es" : "en")}</p>}
      <div className="flex flex-wrap gap-2"><button className="btn-secondary" disabled={disabled || saving} type="submit">{saving ? (es ? "Guardando…" : "Saving…") : (es ? "Guardar peso" : "Save weight")}</button>{session.preWorkoutWeight && <button className="btn-secondary" disabled={disabled || saving} type="button" onClick={() => void save(true)}>{es ? "Eliminar peso" : "Remove weight"}</button>}</div>
      {message && <p role="status">{message}</p>}{error && <p role="alert" className="text-red-700">{error}</p>}
    </form>
  </details>;
}
