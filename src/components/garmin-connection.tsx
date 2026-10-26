"use client";
import { useEffect, useState } from "react";
import { GARMIN_CONSENT_VERSION, GARMIN_MANUAL_REVOCATION_VERSION, GARMIN_NOTICE } from "@/lib/garmin-config";

type Status = { configured: boolean; status: string; permissions: string[]; lastError: string | null };
async function readStatus(response: Response): Promise<Status> {
  if (!response.ok) throw new Error();
  const value = await response.json();
  if (!value || typeof value.configured !== "boolean" || typeof value.status !== "string" || !Array.isArray(value.permissions)
      || value.permissions.some((p: unknown) => typeof p !== "string")) throw new Error();
  return value;
}
export function GarminConnection({ lang }: { lang: "en" | "es" }) {
  const es = lang === "es", [status, setStatus] = useState<Status | null>(null), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [manualRemoval, setManualRemoval] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const outcome = new URLSearchParams(window.location.search).get("garmin");
    if (outcome && outcome !== "connected") setError(es ? "La autorización de Garmin no se completó. Comprueba el estado; desconecta una autorización pendiente antes de intentarlo de nuevo." : "Garmin authorization was not completed. Check the status; disconnect a pending authorization before starting again.");
    fetch("/api/connectors/garmin/connection", { cache: "no-store", signal: controller.signal })
      .then(async response => setStatus(await readStatus(response)))
      .catch(e => { if (e.name !== "AbortError") setError(es ? "No se pudo comprobar la conexión de Garmin." : "Could not check the Garmin connection."); });
    return () => controller.abort();
  }, [es]);
  async function action(connect: boolean, manual = false) {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/connectors/garmin/${connect ? "authorize" : "connection"}`, { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(connect ? { consent: GARMIN_CONSENT_VERSION } : manual ? { consent: GARMIN_MANUAL_REVOCATION_VERSION } : {}) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || (es ? "No se confirmó la operación." : "The operation was not confirmed."));
      if (connect) {
        const target = new URL(data.authorizationUrl);
        if (target.origin !== "https://connect.garmin.com" || target.pathname !== "/oauth2Confirm") throw new Error("Invalid Garmin destination.");
        window.location.assign(target.toString());
      } else {
        const refreshed = await fetch("/api/connectors/garmin/connection", { cache: "no-store" });
        if (!refreshed.ok) throw new Error(es ? "Actualiza para comprobar la desconexión." : "Refresh to check disconnection.");
        setStatus(await readStatus(refreshed)); setConsent(false); setManualRemoval(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : (es ? "No se confirmó la operación." : "The operation was not confirmed."));
      try { setStatus(await readStatus(await fetch("/api/connectors/garmin/connection", { cache: "no-store" }))); }
      catch { setStatus(null); }
    }
    finally { setBusy(false); }
  }
  const labels: Record<string, string> = es
    ? { connected: "Autorizada", disconnected: "Sin autorizar", authorizing: "Autorización pendiente", reconnect_required: "Requiere reconexión", revocation_required: "Revocación sin confirmar", refreshing: "Renovando autorización", exchanging: "Comprobando autorización", disconnecting: "Desconectando" }
    : { connected: "Authorized", disconnected: "Not authorized", authorizing: "Authorization pending", reconnect_required: "Reconnect required", revocation_required: "Revocation unconfirmed", refreshing: "Refreshing authorization", exchanging: "Checking authorization", disconnecting: "Disconnecting" };
  const disconnected = status?.status === "disconnected";
  return <section className="card space-y-3" aria-labelledby="garmin-direct-heading" id="garmin-direct-connection">
    <h2 className="font-display text-lg font-bold" id="garmin-direct-heading">{es ? "Garmin · conexión directa" : "Garmin · direct connection"}</h2>
    <p className="text-sm">{es ? "Garmin aprobó la aplicación de JMM con acceso Starter. La conexión y las pruebas reales son pasos separados." : "Garmin approved JMM's application with Starter access. Connecting and real integration tests are separate steps."}</p>
    <p className="text-sm">{GARMIN_NOTICE[lang]}</p>
    {!status && !error && <p role="status">{es ? "Comprobando conexión…" : "Checking connection…"}</p>}
    {status && <>
      <p className="text-sm font-semibold">{labels[status.status] || (es ? "Estado sin confirmar" : "Status unconfirmed")}</p>
      {!status.configured && <p className="text-sm">{es ? "Pendiente: credenciales de producción y verificación de destinatarios de datos. Puedes seguir usando archivos y entradas manuales." : "Awaiting production credentials and verification of data recipients. File imports and manual entries remain available."}</p>}
      <p className="text-sm">{es ? "Importaciones: no verificadas. Publicación directa y recepción en el reloj: no habilitadas." : "Imports: unverified. Direct workout publication and watch receipt: not enabled."}</p>
      {status.permissions.length > 0 && <ul className="text-sm list-disc pl-5">{status.permissions.map(p => <li key={p}>{p === "ACTIVITY_EXPORT" ? (es ? "Lectura de actividades" : "Read activities") : p === "HEALTH_EXPORT" ? (es ? "Lectura de salud y recuperación" : "Read health and recovery") : (es ? "Permiso para entrenamientos; publicación aún desactivada" : "Workout permission; publication still disabled")}</li>)}</ul>}
      {status.configured && disconnected && <>
        <label className="flex gap-3 items-start text-sm"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} className="mt-1 h-5 w-5" />{es ? "He leído el uso de datos y conectaré mi propia cuenta. Revisaré los permisos en Garmin." : "I reviewed the data use and will connect my own account. I will review the permissions in Garmin."}</label>
        <button className="btn-primary" type="button" disabled={busy || !consent} onClick={() => action(true)}>{es ? "Continuar a Garmin" : "Continue to Garmin"}</button>
      </>}
      {!disconnected && <button className="btn-secondary" type="button" disabled={busy} onClick={() => action(false)}>{es ? "Desconectar Garmin" : "Disconnect Garmin"}</button>}
      {status.status === "revocation_required" && <details className="text-sm space-y-2">
        <summary className="cursor-pointer">{es ? "Recuperar una desconexión sin confirmar" : "Recover an unconfirmed disconnection"}</summary>
        <p>{es ? "Elimina JMM en los ajustes de tu cuenta Garmin. Limpiar aquí solo borra la conexión local; no verifica la revocación en Garmin." : "Remove JMM in your Garmin account settings. Clearing here only removes the local connection; it does not verify Garmin revocation."}</p>
        <a href="https://connect.garmin.com/modern/settings/accountInformation" target="_blank" rel="noreferrer" className="underline">{es ? "Abrir ajustes de Garmin" : "Open Garmin account settings"}</a>
        <label className="flex gap-3 items-start"><input type="checkbox" className="mt-1 h-5 w-5" checked={manualRemoval} onChange={e => setManualRemoval(e.target.checked)} />{es ? "He eliminado JMM en Garmin." : "I removed JMM in Garmin."}</label>
        <button className="btn-secondary" type="button" disabled={busy || !manualRemoval} onClick={() => action(false, true)}>{es ? "Limpiar conexión local" : "Clear local connection"}</button>
      </details>}
    </>}
    {busy && <p role="status">{es ? "Comprobando con Garmin…" : "Checking with Garmin…"}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
