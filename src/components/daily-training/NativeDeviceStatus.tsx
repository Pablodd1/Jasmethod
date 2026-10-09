"use client";
import React, { useEffect, useRef, useState } from "react";

/** No link to an OAuth grant or export is shown based on a browser-side flag. */
export function NativeDeviceStatus({ es = false, sessionId, revision, disabled = false }: {
  es?: boolean; sessionId?: string; revision?: string; disabled?: boolean;
}) {
  const [exportEnabled, setExportEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    pending.current = null; setBusy(false); setMessage(""); setError("");
    return () => { pending.current?.abort(); pending.current = null; };
  }, [sessionId, revision]);
  async function exportWorkout() {
    if (pending.current || !exportEnabled || !sessionId || !revision || disabled) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/workout/apple-export?${new URLSearchParams({ sessionId, expectedRevision: revision })}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || (es ? "No se pudo exportar. Actualiza el plan y reintenta." : "Export failed. Refresh the plan and retry."));
      }
      if (!response.headers.get("content-type")?.includes("application/json")) throw new Error(es ? "Respuesta de exportación no válida." : "Invalid export response.");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = "jmm-workout.jmmworkout.json";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(es ? "Archivo preparado para descargar. Ábrelo en el compañero nativo para revisarlo; no se ha programado ni enviado al reloj." : "File prepared for download. Open it in the native companion for review; nothing has been scheduled or sent to the watch.");
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : (es ? "No se pudo exportar." : "Export failed."));
    } finally {
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/connectors/native", { cache: "no-store", signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted) setExportEnabled(data?.apple?.exportEnabled === true); })
      .catch(() => { /* Unavailable status never enables a pilot action. */ });
    return () => controller.abort();
  }, []);
  return <details className="rounded-lg border border-slate-200 p-3 text-sm">
    <summary className="cursor-pointer font-medium focus-visible:outline focus-visible:outline-2">{es ? "COROS y Apple Watch: estado del piloto" : "COROS and Apple Watch: pilot status"}</summary>
    <div className="space-y-2 mt-2">
      <p>{es ? "COROS directo: en desarrollo. Falta autorizar la cuenta y validar los formatos reales. La publicación y la importación automáticas están desactivadas." : "Direct COROS: in development. Account authorization and real provider-format validation are pending. Automatic publication and activity imports are disabled."}</p>
      <p>{es ? "Apple Watch: requiere instalar el compañero nativo en un iPhone con reloj enlazado. El navegador no puede programar entrenamientos. La lectura de Apple Health necesita permiso independiente. Aún no se ha validado en un reloj real." : "Apple Watch: requires the native companion installed on an iPhone with a paired watch. The browser cannot schedule workouts. Apple Health reading needs separate permission. Real-watch validation is still pending."}</p>
      {exportEnabled && sessionId && revision && !disabled && <>
        <button type="button" className="underline font-medium focus-visible:outline focus-visible:outline-2" disabled={busy} onClick={() => void exportWorkout()}>
          {busy ? (es ? "Preparando archivo…" : "Preparing file…") : (es ? "Exportar para el compañero Apple (piloto)" : "Export for Apple companion (pilot)")}
        </button>
        <p>{es ? "El archivo contiene tu entrenamiento. Ábrelo solo en tu compañero instalado, revisa la fecha y los pasos, y confirma allí. Descárgalo otra vez tras cualquier cambio; no se sincroniza automáticamente." : "The file contains your workout. Open it only in your installed companion, review the date and steps, then confirm there. Export again after any change; it does not update automatically."}</p>
      </>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {message && <p role="status" aria-live="polite">{message}</p>}
      <p>{es ? "Archivo exportado, programación local y recepción en el reloj son estados diferentes." : "Exported file, local schedule and watch receipt are separate states."}</p>
    </div>
  </details>;
}
