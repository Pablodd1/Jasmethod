"use client";
import { useState } from "react";
import type { ExistingReviewCandidate } from "@/lib/existing-workout-review";

export function ExistingWorkoutReview({ sessionId, revision, candidate, es, disabled, onSaved }: {
  sessionId: string; revision: string; candidate: ExistingReviewCandidate; es: boolean; disabled?: boolean; onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (!candidate.eligible) return null;
  return <details className="card border-ocean-200" data-testid="existing-workout-review">
    <summary className="cursor-pointer font-semibold">{es ? "Revisión breve de esta sesión fácil" : "Short review for this easy session"}</summary>
    <form className="mt-3 space-y-3" onSubmit={async event => {
      event.preventDefault(); if (busy || disabled) return;
      const form = new FormData(event.currentTarget); setBusy(true); setError("");
      try {
        const response = await fetch("/api/checkin", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "review_existing", sessionId, expectedRevision: revision, contextRevision: candidate.contextRevision,
            noSymptoms: form.get("noSymptoms") === "on", recoveryUnchanged: form.get("recoveryUnchanged") === "on",
            timeConfirmed: form.get("timeConfirmed") === "on", confirmed: true }) });
        const result = await response.json(); if (!response.ok || result.ok !== true) throw Error(result.error || "Could not verify the review.");
        await onSaved();
      } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
    }}>
      <p className="text-sm">{es ? "Puedes omitir las escalas completas para esta sesión guardada sin cambios. Esto no crea un entrenamiento ni una puntuación de preparación. Después revisa y aprueba la versión actual antes de exportar." : "You can skip the full scales for this unchanged saved session. This creates neither a workout nor a readiness score. Review and approve the current revision afterward before exporting."}</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="noSymptoms" required disabled={disabled || busy} />{es ? "Confirmo que ahora no tengo síntomas de enfermedad, dolor nuevo o que empeora, molestias en el pecho, desmayo, falta de aire grave sin explicación ni otros síntomas urgentes." : "I confirm I currently have no illness symptoms, new or worsening pain, chest discomfort, fainting, severe unexplained breathlessness or other urgent symptoms."}</label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="recoveryUnchanged" required disabled={disabled || busy} />{es ? "No he notado nuevos problemas de recuperación y conozco este esfuerzo fácil. Si algo cambió, usaré el check-in completo." : "I have noticed no new recovery problems and am familiar with this easy effort. If anything changed, I will use the full check-in."}</label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="timeConfirmed" required disabled={disabled || busy} />{es ? `Tengo ${candidate.remainingPlanMinutes} min para las sesiones guardadas que quedan hoy (${candidate.minutes} min en esta sesión).` : `I have ${candidate.remainingPlanMinutes} min for today's remaining saved sessions (${candidate.minutes} min for this session).`}</label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-3"><button className="btn-primary" disabled={busy || disabled}>{busy ? (es ? "Verificando…" : "Verifying…") : (es ? "Confirmar sesión sin cambios" : "Confirm unchanged session")}</button><a className="btn-secondary" href="/checkin">{es ? "Algo cambió / check-in completo" : "Something changed / full check-in"}</a></div>
    </form>
  </details>;
}
