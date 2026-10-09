"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { CorosConnectActions } from "./CorosConnectActions";
import type { CorosConnectionStatus } from "./coros-connection-ui";

/** No link to an OAuth grant or export is shown based on a browser-side flag. */
export function NativeDeviceStatus({ es = false, sessionId, revision, disabled = false }: {
  es?: boolean; sessionId?: string; revision?: string; disabled?: boolean;
}) {
  const [exportEnabled, setExportEnabled] = useState(false);
  const [coros, setCoros] = useState<CorosConnectionStatus | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [open, setOpen] = useState(false);
  const [returnedFromCoros, setReturnedFromCoros] = useState(false);
  const statusPending = useRef<AbortController | null>(null);
  const loadStatus = useCallback(async () => {
    statusPending.current?.abort();
    const controller = new AbortController(); statusPending.current = controller;
    try {
      const response = await fetch("/api/connectors/native", { cache: "no-store", signal: controller.signal });
      const data = response.ok ? await response.json() : null;
      if (controller.signal.aborted) return;
      if (!data || typeof data.apple?.exportEnabled !== "boolean" || typeof data.coros?.connectionStatus !== "string") throw new Error("Unavailable status");
      setExportEnabled(data.apple.exportEnabled === true);
      setCoros({
        configured: data.coros.configured === true, authorizationAvailable: data.coros.authorizationAvailable === true,
        connectionStatus: data.coros.connectionStatus, reconnectRequired: data.coros.reconnectRequired === true,
        localAccessStopped: data.coros.localAccessStopped === true, requiresProviderRevocation: data.coros.requiresProviderRevocation === true,
        lastError: typeof data.coros.lastError === "string" ? data.coros.lastError : null,
      });
      setStatusError(false);
    } catch {
      if (!controller.signal.aborted) { setExportEnabled(false); setCoros(null); setStatusError(true); }
    }
  }, []);
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
    void loadStatus();
    if (window.location.hash === "#coros-pilot") setOpen(true);
    if (new URLSearchParams(window.location.search).has("coros")) { setOpen(true); setReturnedFromCoros(true); }
    return () => statusPending.current?.abort();
  }, [loadStatus]);
  return <details open={open} onToggle={event => setOpen(event.currentTarget.open)} className="rounded-lg border border-slate-200 p-3 text-sm">
    <summary className="cursor-pointer font-medium focus-visible:outline focus-visible:outline-2">{es ? "COROS y Apple Watch: estado del piloto" : "COROS and Apple Watch: pilot status"}</summary>
    <div className="space-y-2 mt-2">
      <p>{es ? "COROS directo: la autorización de cuenta está disponible solo tras configurar OAuth. La publicación y la importación automáticas siguen desactivadas hasta validar los formatos reales del proveedor." : "Direct COROS: account authorization is available only after OAuth setup. Automatic publication and activity imports remain disabled until real provider formats are validated."}</p>
      {statusError && <p role="status">{es ? "No se pudo comprobar la configuración. Actualiza la página antes de conectar o exportar." : "Could not check setup. Refresh the page before connecting or exporting."}</p>}
      {returnedFromCoros && <p role="status">{es ? "Has vuelto del flujo COROS. Comprueba el estado de autorización a continuación; volver aquí no confirma conexión ni sincronización." : "You returned from the COROS flow. Check the authorization status below; returning here does not confirm connection or sync."}</p>}
      {!sessionId && coros && <CorosConnectActions state={coros} es={es} onChange={loadStatus} />}
      {sessionId && <a href="/connectors#coros-pilot" className="underline">{es ? "Ver autorización COROS" : "Manage COROS authorization"}</a>}
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
