"use client";
import React, { useEffect, useRef, useState } from "react";
import { requestCorosConnection, type CorosConnectionAction, type CorosConnectionStatus } from "./coros-connection-ui";

export function CorosConnectActions({ state, es, onChange }: {
  state: CorosConnectionStatus; es: boolean; onChange: () => Promise<void>;
}) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const pending = useRef<AbortController | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { pending.current?.abort(); if (timeout.current) clearTimeout(timeout.current); }, []);
  const working = ["authorizing", "exchanging", "refreshing", "disconnecting", "revocation_pending"].includes(state.connectionStatus);
  const authorized = state.connectionStatus === "authorized";
  const labels: Record<string, [string, string]> = {
    disconnected: ["Sin autorización", "Not authorized"], authorizing: ["Autorización pendiente", "Authorization pending"],
    exchanging: ["Verificando autorización", "Verifying authorization"], authorized: ["Cuenta autorizada; sincronización desactivada", "Account authorized; sync disabled"],
    refreshing: ["Actualizando autorización", "Refreshing authorization"], reconnect_required: ["Reconexión necesaria", "Reconnect required"],
    disconnecting: ["Desconectando", "Disconnecting"], revocation_pending: ["Revocación pendiente", "Revocation pending"],
    revocation_required: ["Acceso local detenido; revoca en COROS", "Local access stopped; revoke in COROS"],
  };
  const knownStatus = Object.prototype.hasOwnProperty.call(labels, state.connectionStatus);
  async function act(action: CorosConnectionAction) {
    if (pending.current) return;
    const controller = new AbortController(); pending.current = controller;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 25000); timeout.current = timer;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await requestCorosConnection(action, consent, controller.signal);
      if (controller.signal.aborted) return;
      if ("authorizationUrl" in result) {
        window.location.assign(result.authorizationUrl!);
        return;
      }
      setMessage(action === "disconnect"
        ? result.requiresProviderRevocation ? (es ? "Acceso local detenido. Aún debes eliminar el permiso de esta aplicación en COROS." : "Local access stopped. You still need to remove this app's permission in COROS.")
          : result.remoteRevoked ? (es ? "Acceso revocado y conexión local eliminada." : "Access revoked and local connection removed.")
            : (es ? "No queda autorización local guardada." : "No saved local authorization remains.")
        : (es ? "Autorización comprobada. La importación y el envío de entrenamientos siguen desactivados." : "Authorization checked. Activity imports and workout delivery remain disabled."));
      setConsent(false);
      await onChange();
    } catch (cause) {
      if (!controller.signal.aborted || timedOut) {
        setError(timedOut ? (es ? "La solicitud tardó demasiado. El resultado es desconocido; actualiza el estado antes de repetirla." : "The request timed out. Its outcome is unknown; refresh status before retrying.") : cause instanceof Error ? cause.message : (es ? "No se pudo actualizar la conexión." : "The connection could not be updated."));
        await onChange();
      }
    } finally {
      clearTimeout(timer); if (timeout.current === timer) timeout.current = null;
      if (pending.current === controller) pending.current = null;
      if (!controller.signal.aborted || timedOut) setBusy(false);
    }
  }
  return <section id="coros-pilot" aria-label={es ? "Autorización COROS" : "COROS authorization"} className="space-y-3 border-t border-slate-200 pt-3">
    <p className="font-medium">{labels[state.connectionStatus]?.[es ? 0 : 1] || (es ? "Estado desconocido: actualiza antes de continuar." : "Unknown status: refresh before continuing.")}</p>
    {authorized && state.localAccessStopped && <p role="status">{es ? "La autorización guardada no está activa con la configuración o vigencia actuales. Comprueba la autorización o desconecta para volver a empezar." : "Saved authorization is inactive under the current setup or expiry. Check authorization or disconnect to start again."}</p>}
    {state.requiresProviderRevocation && <p role="status" className="text-amber-800">{es ? "Una autorización anterior de COROS podría seguir activa. La revocación remota no está confirmada; revisa y elimina el permiso anterior en tu cuenta COROS." : "A previous COROS authorization may still be active. Remote revocation is not confirmed; review and remove the previous app permission in your COROS account."}</p>}
    {state.lastError && <p role="status">{state.lastError}</p>}
    {!state.configured && <p>{es ? "El propietario debe completar la configuración OAuth aprobada antes de conectar una cuenta. No se ha registrado ninguna aplicación ni concedido acceso automáticamente." : "The owner must complete approved OAuth setup before connecting an account. No app is registered or access granted automatically."}</p>}
    {knownStatus && state.authorizationAvailable && ["disconnected", "revocation_required"].includes(state.connectionStatus) && <>
      <label className="flex gap-2 items-start">
        <input type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} className="mt-1" />
        <span>{es ? "Entiendo que COROS concede acceso a mi cuenta, acceso sin conexión y permisos amplios de lectura y escritura de herramientas MCP (openid, offline_access, mcp.tools). Este piloto no importa actividades ni publica entrenamientos. Continuaré en COROS para revisar y autorizar." : "I understand COROS grants account access, offline access and broad read/write MCP tool permissions (openid, offline_access, mcp.tools). This pilot does not import activities or publish workouts. I will continue to COROS to review and authorize."}</span>
      </label>
      <button type="button" className="btn-secondary" disabled={busy || !consent} onClick={() => void act("authorize")}>{authorized ? (es ? "Reautorizar COROS" : "Reauthorize COROS") : (es ? "Continuar a COROS" : "Continue to COROS")}</button>
    </>}
    {state.configured && ["authorized", "reconnect_required"].includes(state.connectionStatus) && <p>{es ? "Para autorizar de nuevo o cambiar de cuenta, desconecta primero la autorización actual." : "To authorize again or change accounts, disconnect the current authorization first."}</p>}
    <div className="flex flex-wrap gap-2">
      {authorized && state.configured && <button type="button" className="btn-secondary" disabled={busy || working} onClick={() => void act("refresh")}>{es ? "Comprobar autorización" : "Check authorization"}</button>}
      {knownStatus && !["disconnected", "revocation_required"].includes(state.connectionStatus) && <button type="button" className="btn-secondary" disabled={busy} onClick={() => void act("disconnect")}>{es ? "Desconectar COROS" : "Disconnect COROS"}</button>}
      <button type="button" className="underline" disabled={busy} onClick={() => void onChange()}>{es ? "Actualizar estado" : "Refresh status"}</button>
    </div>
    {working && <p>{es ? "Hay una operación pendiente. Actualiza el estado antes de repetirla. Si se interrumpió, puedes desconectar localmente; después elimina el permiso en COROS." : "An operation is pending. Refresh status before retrying. If interrupted, disconnect locally, then remove the app permission in COROS."}</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {message && <p role="status" aria-live="polite">{message}</p>}
  </section>;
}
