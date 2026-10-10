"use client";
import { useEffect, useRef, useState } from "react";
import { assessDailyEnvironment, dailyEnvironmentGuidance, isDailyEnvironmentAssessment, parseDailyEnvironmentInput, type DailyEnvironmentAssessment, type DailyEnvironmentInput } from "@/lib/daily-environment";

type Props = { sessionId: string; dateLocal: string; timezone: string; startTime?: string | null; environment?: DailyEnvironmentAssessment; es?: boolean; disabled?: boolean; offline?: boolean; onSaved: () => void | Promise<void> };
function draftFor(environment: DailyEnvironmentAssessment | undefined, dateLocal: string, timezone: string, startTime?: string | null) {
  const c = environment?.context;
  return { setting: c?.setting ?? "unknown", venueName: c?.venueName ?? "", latitude: c?.latitude == null ? "" : String(c.latitude), longitude: c?.longitude == null ? "" : String(c.longitude), plannedLocal: c?.plannedLocal ?? (startTime ? `${dateLocal}T${startTime}` : ""), timeZone: c?.timeZone ?? timezone, venueConfirmed: c?.venueConfirmed ?? false };
}
export function DailyEnvironmentCard({ sessionId, dateLocal, timezone, startTime, environment, es = false, disabled = false, offline = false, onSaved }: Props) {
  const [saved, setSaved] = useState(environment);
  const [draft, setDraft] = useState(() => draftFor(environment, dateLocal, timezone, startTime));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => new Date());
  const pending = useRef(false);
  const requestSequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const sequence = requestSequence, requests = controller;
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => { window.clearInterval(timer); sequence.current++; requests.current?.abort(); };
  }, []);
  const current = assessDailyEnvironment({ record: saved?.context ?? null, revision: saved?.revision, athleteId: saved?.context?.athleteId ?? "", sessionId, dateLocal, timezone, startTime, now });
  const displayed = dirty ? { ...current, status: "unknown" as const, reason: "unconfirmed" as const, conditions: null, fetchedAt: null, validAt: null } : offline && current.status === "forecast" ? { ...current, status: "unknown" as const, reason: "offline" as const, conditions: null } : current;
  function change(key: keyof typeof draft, value: string | boolean) { setDraft(d => ({ ...d, [key]: value, ...(key === "venueConfirmed" ? {} : { venueConfirmed: false }) })); setDirty(true); setMessage(""); }
  async function reload() {
    if (pending.current || disabled) return;
    pending.current = true; setBusy(true); setError("");
    const sequence = ++requestSequence.current;
    controller.current?.abort(); controller.current = new AbortController();
    try {
      const response = await fetch(`/api/training/environment?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store", signal: controller.current.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || (es ? "No se pudo cargar el lugar." : "Could not load venue."));
      if (!isDailyEnvironmentAssessment(data.environment)) throw new Error(es ? "La respuesta del lugar no se puede verificar." : "Venue response could not be verified.");
      if (sequence !== requestSequence.current) return;
      setSaved(data.environment); setDirty(false); setDraft(draftFor(data.environment, dateLocal, timezone, startTime)); setMessage(es ? "Datos guardados cargados." : "Saved details loaded.");
      await onSaved();
    } catch (cause) { if (sequence === requestSequence.current && !controller.current?.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load venue."); }
    finally { if (sequence === requestSequence.current) { pending.current = false; setBusy(false); } }
  }
  async function save(requestForecast: boolean) {
    if (pending.current || disabled) return;
    let input: DailyEnvironmentInput;
    try { input = parseDailyEnvironmentInput({ ...draft, latitude: draft.latitude === "" ? null : Number(draft.latitude), longitude: draft.longitude === "" ? null : Number(draft.longitude), requestForecast }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Review venue details."); return; }
    pending.current = true; setBusy(true); setError(""); setMessage("");
    const sequence = ++requestSequence.current;
    controller.current?.abort(); controller.current = new AbortController();
    try {
      const response = await fetch("/api/training/environment", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.current.signal,
        body: JSON.stringify({ sessionId, expectedRevision: saved?.revision ?? null, environment: input }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || (es ? "No se pudo guardar. Revisa antes de reintentar." : "Could not save. Reload before retrying."));
      if (!isDailyEnvironmentAssessment(data.environment)) throw new Error(es ? "La respuesta del lugar no se puede verificar." : "Venue response could not be verified.");
      if (sequence !== requestSequence.current) return;
      setSaved(data.environment); setDirty(false); setNow(new Date()); setMessage(es ? "Lugar y hora guardados. Revisa el plan actualizado." : "Venue and time saved. Review the updated plan.");
      await onSaved();
    } catch (cause) { if (sequence === requestSequence.current && !controller.current?.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not save. Reload before retrying."); }
    finally { if (sequence === requestSequence.current) { pending.current = false; setBusy(false); } }
  }
  return <section className="rounded-xl border border-slate-300 bg-white p-4 text-slate-800" aria-label={es ? "Lugar y condiciones" : "Venue and conditions"}>
    <details>
      <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocean-600">{es ? "Lugar y condiciones" : "Venue & conditions"} · {displayed.status === "indoor" ? (es ? "Interior" : "Indoor") : displayed.status === "forecast" ? (es ? "Pronóstico" : "Forecast") : (es ? "Desconocidos" : "Unknown")}{displayed.conditions ? ` · ${displayed.conditions.temperatureC} °C` : ""}</summary>
      {dirty && <p className="mt-2 text-sm">{es ? "Cambios sin guardar: el pronóstico anterior no se aplica a los datos editados." : "Unsaved changes: the previous forecast does not apply to these edited details."}</p>}
      <p className="mt-3 text-sm" role="status">{dailyEnvironmentGuidance(displayed, es ? "es" : "en")}</p>
      {displayed.fetchedAt && <p className="mt-2 text-xs">{es ? "Obtenido" : "Retrieved"}: {displayed.fetchedAt} · {displayed.forecastAgeMinutes == null ? "—" : `${displayed.forecastAgeMinutes} min`} · {es ? "Válido para" : "Valid at"}: {displayed.validAt ?? "—"}. {es ? "Caduca" : "Fresh until"}: {displayed.freshUntil ?? "—"}.</p>}
      {displayed.fetchedAt && <p className="mt-1 text-xs"><a className="underline" href="https://api.met.no/" target="_blank" rel="noreferrer">MET Norway</a> · <a className="underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. {es ? "Muestra de pronóstico seleccionada; no es una observación del lugar." : "Selected forecast sample; not a venue observation."}</p>}
      <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); void save(false); }}>
        <fieldset disabled={disabled || busy} className="space-y-3">
          <label className="block text-sm">{es ? "¿Dónde entrenarás?" : "Where will you train?"}<select className="input mt-1" value={draft.setting} onChange={event => change("setting", event.target.value)}><option value="unknown">{es ? "No lo sé todavía" : "Not known yet"}</option><option value="indoor">{es ? "Interior" : "Indoor"}</option><option value="outdoor">{es ? "Exterior" : "Outdoor"}</option></select></label>
          <label className="block text-sm">{es ? "Lugar real del entrenamiento" : "Actual workout venue"}<input className="input mt-1" maxLength={160} value={draft.venueName} onChange={event => change("venueName", event.target.value)} placeholder={es ? "Gimnasio, parque o ruta" : "Gym, park or route"} /></label>
          <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">{es ? "Fecha y hora en el lugar" : "Date and time at venue"}<input className="input mt-1" type="datetime-local" value={draft.plannedLocal} onChange={event => change("plannedLocal", event.target.value)} /></label><label className="block text-sm">{es ? "Zona horaria del lugar" : "Venue timezone"}<input className="input mt-1" maxLength={100} value={draft.timeZone} onChange={event => change("timeZone", event.target.value)} placeholder="America/New_York" /></label></div>
          {draft.setting === "outdoor" && <div><p className="text-xs">{es ? "Para el pronóstico, introduce las coordenadas del lugar. No usamos la ubicación del teléfono ni de casa." : "For a forecast, enter the venue coordinates. Phone and home location are never assumed."}</p><div className="mt-2 grid grid-cols-2 gap-3"><label className="block text-sm">{es ? "Latitud" : "Latitude"}<input className="input mt-1" type="number" step="any" min="-90" max="90" value={draft.latitude} onChange={event => change("latitude", event.target.value)} /></label><label className="block text-sm">{es ? "Longitud" : "Longitude"}<input className="input mt-1" type="number" step="any" min="-180" max="180" value={draft.longitude} onChange={event => change("longitude", event.target.value)} /></label></div></div>}
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.venueConfirmed} onChange={event => change("venueConfirmed", event.target.checked)} />{es ? "Confirmo el lugar real, interior/exterior, la hora y la zona horaria de este entrenamiento." : "I confirm the actual venue, indoor/outdoor setting, planned time and timezone for this workout."}</label>
          <div className="flex flex-wrap gap-2"><button className="btn-secondary text-sm" type="submit">{busy ? (es ? "Guardando…" : "Saving…") : (es ? "Guardar lugar y hora" : "Save venue and time")}</button>{draft.setting === "outdoor" && <button className="btn-primary text-sm" type="button" onClick={() => void save(true)}>{es ? "Guardar y consultar pronóstico" : "Save and forecast venue"}</button>}<button className="btn-secondary text-sm" type="button" onClick={() => void reload()}>{es ? "Cargar lo guardado" : "Reload saved details"}</button></div>
          {draft.setting === "outdoor" && <p className="text-xs">{es ? "Consultar el pronóstico envía las coordenadas y la hora a MET Norway. No se envían tu identidad, salud ni nombre del lugar. Guardar sin consultar deja las condiciones como desconocidas." : "Forecasting sends venue coordinates and time to MET Norway. Your identity, health and venue name are not sent. Saving without a forecast leaves conditions unknown."}</p>}
        </fieldset>
      </form>
      {offline && <p className="mt-2 text-sm">{es ? "Vuelve a conectarte y carga la sesión actual antes de confirmar." : "Reconnect and load the current session before confirming."}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mt-2 text-sm">{message}</p>}
    </details>
  </section>;
}
