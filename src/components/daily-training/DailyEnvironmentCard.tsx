"use client";
import { useEffect, useRef, useState } from "react";
import { assessDailyEnvironment, dailyEnvironmentGuidance, isDailyEnvironmentAssessment, parseDailyEnvironmentInput, type DailyEnvironmentAssessment, type DailyEnvironmentInput } from "@/lib/daily-environment";
import { isTrainingLocation, type TrainingLocation } from "@/lib/training-location";
import { fmtTemp, unitsOf, type UnitSystem } from "@/lib/units";

type Props = { sessionId: string; dateLocal: string; timezone: string; startTime?: string | null; environment?: DailyEnvironmentAssessment; units?:UnitSystem; es?: boolean; disabled?: boolean; offline?: boolean; onSaved: () => void | Promise<void> };
function draftFor(environment: DailyEnvironmentAssessment | undefined, dateLocal: string, timezone: string, startTime?: string | null) {
  const c = environment?.context;
  return { setting: c?.setting ?? "unknown", venueName: c?.venueName ?? "", latitude: c?.latitude == null ? "" : String(c.latitude), longitude: c?.longitude == null ? "" : String(c.longitude), plannedLocal: c?.plannedLocal ?? (startTime ? `${dateLocal}T${startTime}` : ""), timeZone: c?.timeZone ?? timezone, venueConfirmed: c?.venueConfirmed ?? false };
}
export function DailyEnvironmentCard({ sessionId, dateLocal, timezone, startTime, environment, units, es = false, disabled = false, offline = false, onSaved }: Props) {
  const displayUnits=units??unitsOf("auto",es?"es":"en");
  const [saved, setSaved] = useState(environment);
  const [draft, setDraft] = useState(() => draftFor(environment, dateLocal, timezone, startTime));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const query = draft.venueName;
  const [locations, setLocations] = useState<TrainingLocation[]>([]);
  const [savedLocations, setSavedLocations] = useState<TrainingLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const searchSequence = useRef(0);
  useEffect(() => {
    const searches = searchSequence;
    const abort = new AbortController();
    void fetch("/api/training/locations", { cache: "no-store", signal: abort.signal }).then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      if (!abort.signal.aborted && Array.isArray(data.locations)) {
        const choices = data.locations.filter(isTrainingLocation);
        setSavedLocations(choices);
        // Reuse a saved area as an editable suggestion, never as today's confirmation.
        if (choices[0]) setDraft(d => d.venueName || d.latitude || d.longitude ? d : { ...d, venueName: choices[0].label, latitude: String(choices[0].latitude), longitude: String(choices[0].longitude), timeZone: choices[0].timeZone, venueConfirmed: false });
      }
    }).catch(() => {});
    return () => { abort.abort(); searches.current++; };
  }, []);
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
  function selectLocation(location: TrainingLocation) {
    searchSequence.current++;
    setSearching(false); setLocations([]);
    setDraft(d => ({ ...d, venueName: location.label, latitude: String(location.latitude), longitude: String(location.longitude), timeZone: location.timeZone, venueConfirmed: false }));
    setDirty(true); setMessage(es ? "Ubicación seleccionada; confirma si entrenarás aquí." : "Location selected; confirm you will train here.");
  }
  async function searchLocation() {
    if (disabled || busy || searching || query.trim().length < 2) return;
    const sequence = ++searchSequence.current;
    setSearching(true); setError(""); setLocations([]);
    try {
      const response = await fetch("/api/training/locations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (sequence !== searchSequence.current) return;
      if (!response.ok) throw Error(data.error || "Location search unavailable.");
      if (!Array.isArray(data.locations) || !data.locations.every(isTrainingLocation)) throw Error("Location response could not be verified.");
      setLocations(data.locations); setMessage(data.locations.length ? (es ? "Elige tu ciudad y región." : "Choose the matching city and region.") : (es ? "Sin resultados. Prueba ciudad y estado o código postal." : "No matches. Try a city and state/region or postal code."));
    } catch (cause) { if (sequence === searchSequence.current) setError(cause instanceof Error ? cause.message : "Location search unavailable."); }
    finally { if (sequence === searchSequence.current) setSearching(false); }
  }
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
      <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ocean-600">{es ? "Lugar y condiciones" : "Venue & conditions"} · {displayed.status === "indoor" ? (es ? "Interior" : "Indoor") : displayed.status === "forecast" ? (es ? "Pronóstico" : "Forecast") : (es ? "Desconocidos" : "Unknown")}{displayed.conditions ? ` · ${fmtTemp(displayed.conditions.temperatureC,displayUnits)}` : ""}</summary>
      {dirty && <p className="mt-2 text-sm">{es ? "Cambios sin guardar: el pronóstico anterior no se aplica a los datos editados." : "Unsaved changes: the previous forecast does not apply to these edited details."}</p>}
      <p className="mt-3 text-sm" role="status">{dailyEnvironmentGuidance(displayed, es ? "es" : "en",displayUnits)}</p>
      {displayed.fetchedAt && <p className="mt-2 text-xs">{es ? "Obtenido" : "Retrieved"}: {displayed.fetchedAt} · {displayed.forecastAgeMinutes == null ? "—" : `${displayed.forecastAgeMinutes} min`} · {es ? "Válido para" : "Valid at"}: {displayed.validAt ?? "—"}. {es ? "Caduca" : "Fresh until"}: {displayed.freshUntil ?? "—"}.</p>}
      {displayed.fetchedAt && <p className="mt-1 text-xs"><a className="underline" href="https://api.met.no/" target="_blank" rel="noreferrer">MET Norway</a> · <a className="underline" href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a>. {es ? "Muestra de pronóstico seleccionada; no es una observación del lugar." : "Selected forecast sample; not a venue observation."}</p>}
      <form className="mt-3 space-y-3" onSubmit={event => { event.preventDefault(); void save(false); }}>
        <fieldset disabled={disabled || busy} className="space-y-3">
          <label className="block text-sm">{es ? "¿Dónde entrenarás?" : "Where will you train?"}<select className="input mt-1" value={draft.setting} onChange={event => change("setting", event.target.value)}><option value="unknown">{es ? "No lo sé todavía" : "Not known yet"}</option><option value="indoor">{es ? "Interior" : "Indoor"}</option><option value="outdoor">{es ? "Exterior" : "Outdoor"}</option></select></label>
          {savedLocations.length > 0 && <label className="block text-sm">{es ? "Usar una ubicación guardada" : "Use a saved location"}<select className="input mt-1" value="" onChange={event => { if (event.target.value === "") return; const location = savedLocations[Number(event.target.value)]; if (location) selectLocation(location); }}><option value="">{es ? "Elegir ubicación" : "Choose location"}</option>{savedLocations.map((location, i) => <option key={i} value={i}>{location.label}</option>)}</select></label>}
          <label className="block text-sm">{es ? "Ubicación del entrenamiento" : "Training location"}<input className="input mt-1" maxLength={120} value={draft.venueName} onChange={event => { searchSequence.current++; setSearching(false); setLocations([]); change("venueName", event.target.value); setDraft(d => ({ ...d, latitude: "", longitude: "" })); }} placeholder={es ? "Ciudad, estado o código postal" : "City, state/region or postal code"} /></label>
          {draft.setting === "outdoor" && <div className="space-y-2">
            <button type="button" className="btn-secondary text-sm" disabled={searching || query.trim().length < 2} onClick={() => void searchLocation()}>{searching ? (es ? "Buscando…" : "Searching…") : (es ? "Buscar ubicación" : "Find location")}</button>
            {locations.length > 0 && <ul aria-label={es ? "Resultados de ubicación" : "Location results"}>{locations.map((location, i) => <li key={i}><button type="button" className="underline text-sm py-2 text-left" onClick={() => selectLocation(location)}>{location.label}</button></li>)}</ul>}
            <p className="text-xs">{es ? "Solo ciudad/región o código postal: no necesitas coordenadas ni altitud. La búsqueda envía tu texto a Open-Meteo; selecciona el resultado. El pronóstico representa esa zona, no el microclima de una ruta." : "City/region or postal code only: no coordinates or altitude needed. Search sends your text to Open-Meteo; select the matching result. The forecast represents that area, not a route’s microclimate."} <a className="underline" href="https://open-meteo.com/en/docs/geocoding-api">Open-Meteo / GeoNames</a></p>
          </div>}
          <label className="block text-sm">{es ? "Hora prevista del entrenamiento" : "Planned workout time"}<input className="input mt-1" type="datetime-local" value={draft.plannedLocal} onChange={event => change("plannedLocal", event.target.value)} /></label>
          <p className="text-xs">{es ? "Zona horaria" : "Timezone"}: {draft.timeZone}</p>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={draft.venueConfirmed} onChange={event => change("venueConfirmed", event.target.checked)} />{es ? "Esta es la zona donde entrenaré. Confirmo interior/exterior y la hora prevista." : "This is the area where I will train. I confirm indoor/outdoor and the planned time."}</label>
          <div className="flex flex-wrap gap-2"><button className="btn-secondary text-sm" type="submit">{busy ? (es ? "Guardando…" : "Saving…") : (es ? "Guardar lugar y hora" : "Save venue and time")}</button>{draft.setting === "outdoor" && <button className="btn-primary text-sm" type="button" disabled={!draft.latitude || !draft.longitude} onClick={() => void save(true)}>{es ? "Guardar y consultar pronóstico" : "Save and forecast venue"}</button>}<button className="btn-secondary text-sm" type="button" onClick={() => void reload()}>{es ? "Cargar lo guardado" : "Reload saved details"}</button></div>
          {draft.setting === "outdoor" && <p className="text-xs">{es ? "Consultar el pronóstico envía las coordenadas y la hora a MET Norway. No se envían tu identidad, salud ni nombre del lugar. Guardar sin consultar deja las condiciones como desconocidas." : "Forecasting sends venue coordinates and time to MET Norway. Your identity, health and venue name are not sent. Saving without a forecast leaves conditions unknown."}</p>}
        </fieldset>
      </form>
      {offline && <p className="mt-2 text-sm">{es ? "Vuelve a conectarte y carga la sesión actual antes de confirmar." : "Reconnect and load the current session before confirming."}</p>}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}{message && <p role="status" className="mt-2 text-sm">{message}</p>}
    </details>
  </section>;
}
