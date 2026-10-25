"use client";

import { useEffect, useState } from "react";
import { Flag, Plus, Trash2, Thermometer, Mountain, Waves, Clock, Gauge } from "lucide-react";
import Link from "next/link";
import { readWriteReceipt } from "@/lib/client-save-receipt";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
import { TrainingWorkflowNav } from "@/components/training-workflow-nav";

const DISTANCES = ["sprint", "olympic", "half", "full", "5k", "10k", "half-marathon", "marathon", "40k", "100k", "180k", "gran-fondo", "750m", "1500m", "1900m", "3800m", "hyrox"];
const TERRAINS = ["flat", "rolling", "hilly", "mountain", "trail"];
const VENUES = ["pool", "lake", "ocean", "river"];
const FEDERATIONS = ["USAT", "WORLD_TRIATHLON", "BRITISH_TRIATHLON", "IRONMAN"];
const CATEGORIES = ["age_group", "elite"];

// Persist existing format identifiers; labels explain them in the athlete's language.
const OPTION_LABELS: Record<string, [string, string]> = {
  sprint: ["Sprint triathlon", "Triatlón sprint"], olympic: ["Olympic triathlon", "Triatlón olímpico"],
  half: ["70.3 triathlon", "Triatlón 70.3"], full: ["Full-distance triathlon", "Triatlón de larga distancia"],
  "5k": ["5 km run", "Carrera de 5 km"], "10k": ["10 km run", "Carrera de 10 km"],
  "half-marathon": ["Half marathon", "Media maratón"], marathon: ["Marathon", "Maratón"],
  "40k": ["40 km cycling", "Ciclismo de 40 km"], "100k": ["100 km cycling", "Ciclismo de 100 km"],
  "180k": ["180 km cycling", "Ciclismo de 180 km"], "gran-fondo": ["Gran fondo", "Gran fondo"],
  "750m": ["750 m swim", "Natación de 750 m"], "1500m": ["1,500 m swim", "Natación de 1.500 m"],
  "1900m": ["1,900 m swim", "Natación de 1.900 m"], "3800m": ["3,800 m swim", "Natación de 3.800 m"], hyrox: ["HYROX", "HYROX"],
  flat: ["Flat", "Llano"], rolling: ["Rolling", "Ondulado"], hilly: ["Hilly", "Con cuestas"], mountain: ["Mountain", "Montaña"], trail: ["Trail", "Sendero"],
  pool: ["Pool", "Piscina"], lake: ["Lake", "Lago"], ocean: ["Ocean", "Mar"], river: ["River", "Río"],
  none: ["None", "Ninguna"], mild: ["Mild", "Suave"], strong: ["Strong", "Fuerte"], age_group: ["Age group", "Grupo de edad"], elite: ["Elite", "Élite"],
};

const empty = {
  name: "", distance: "", date: "", startTime: "", location: "",
  targetTempC: "", humidity: "", baseElevM: "", goalTimeMin: "", priority: "1",
  bikeElevM: "", bikeTerrain: "", runElevM: "", runTerrain: "",
  swimVenue: "", waterTempC: "", swimCurrent: "", notes: "",
  federation: "", category: "",
};

export default function RacesPage() {
  const { user } = useAuth();
  const lang = (user?.language || "en") as string;
  const [races, setRaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<any>(empty);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  const [verified, setVerified] = useState(false);

  async function load() {
    setVerified(false);
    try {
      const res = await fetch("/api/races",{cache:"no-store",signal:AbortSignal.timeout(15000)});
      const d = await res.json();
      if(!res.ok||!Array.isArray(d.races))throw Error("Could not verify saved races. Reload before editing.");
      setRaces(d.races); setVerified(true); setErr("");
    }catch(error){setErr((error as Error).message);}finally{setLoading(false);}
  }
  useEffect(() => { if (user) load(); }, [user]);

  function set(k: string, v: string) { setForm((f: any) => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !verified) return;
    setBusy(true); setErr(""); setSaved(false);
    try {
      const res = await fetch("/api/races", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          date: form.date ? `${form.date}T00:00:00.000Z` : undefined,
        }),
      });
      await readWriteReceipt(res,"race");
      setForm(empty); setSaved(true); await load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function saveTiming(event: React.FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    if (busy || !verified) return;
    const values = new FormData(event.currentTarget);
    setBusy(true); setErr(""); setSaved(false);
    try {
      const response = await fetch("/api/races", {method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({id,date:values.get("date"),priority:Number(values.get("priority")),location:values.get("location")})});
      await readWriteReceipt(response,"race",id); setSaved(true);
      await load();
    } catch(error) {setErr(error instanceof Error ? error.message : "Could not save event details");}
    finally {setBusy(false);}
  }

  async function saveResult(id: string, value: string) {
    if (busy || !verified) return;
    const v = value === "" ? null : parseFloat(value);
    if (value !== "" && (isNaN(v as number) || (v as number) <= 0)) return;
    setErr("");
    try {
      await readWriteReceipt(await fetch("/api/races", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, resultMin: v }),signal:AbortSignal.timeout(15000) }),"race",id);
      await load();
    }catch(error){setErr((error as Error).message+" Reload saved races to verify the result before retrying.");}
  }

  async function del(id: string) {
    if (busy || !verified) return;
    setErr("");
    try {
      await readWriteReceipt(await fetch(`/api/races?id=${encodeURIComponent(id)}`, { method: "DELETE",signal:AbortSignal.timeout(15000) }));
      await load();
    }catch(error){setErr((error as Error).message+" Reload saved races before retrying.");}
  }

  async function uploadGpx(id: string, file: File) {
    if (busy || !verified) return;
    setErr("");
    try {
      const text = await file.text();
      const res = await fetch(`/api/races/${id}/course`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gpx: text }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw Error(d.error || "GPX upload failed");
      setErr("");
      load();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  const es = lang === "es";
  const t = (en: string, spanish: string) => es ? spanish : en;
  const optionLabel = (value: string) => OPTION_LABELS[value]?.[es ? 1 : 0] ?? value;
  const field = (key: string, label: string, type = "text", required = false) => <div><label htmlFor={`race-${key}`} className="label">{label}</label><input id={`race-${key}`} type={type} step={type === "number" ? "any" : undefined} className="input min-h-11 !text-base" value={form[key]} onChange={event => set(key, event.target.value)} required={required} /></div>;
  const select = (key: string, label: string, options: string[]) => <div><label htmlFor={`race-${key}`} className="label">{label}</label><select id={`race-${key}`} className="input min-h-11 !text-base" value={form[key]} onChange={event => set(key, event.target.value)}><option value="">{t("Not known yet", "Aún no lo sé")}</option>{options.map(option => <option key={option} value={option}>{optionLabel(option)}</option>)}</select></div>;

  return (
    <ProtectedPage>
      <div className="training-workflow mx-auto max-w-4xl space-y-5">
        <TrainingWorkflowNav active="races" es={es} />
        <div>
          <h1 className="font-display text-2xl font-bold">{t("Races & venues", "Carreras y lugares")}</h1>
          <p className="text-slate-500 text-sm">{t("Save the event first. Add venue and course details when you know them.", "Guarda primero la carrera. Añade lugar y recorrido cuando los conozcas.")}</p>
        </div>

        <Link href="/races/scenarios" className="btn-secondary min-h-11 justify-center w-fit">
          <Gauge className="w-4 h-4" aria-hidden="true" /> {lang === "es" ? "Revisar lugar y pronóstico" : "Review venue & forecast"}
        </Link>

        {saved && <p role="status" className="text-sm text-emerald-800">{t("Race saved. Review a new plan preview if the event date or priority changed.", "Carrera guardada. Revisa una nueva vista previa si cambió la fecha o prioridad.")}</p>}
        {err && <div role="alert" className="text-sm text-coral-600 bg-coral-50 rounded-lg px-3 py-2">{err}</div>}

        {races.length > 0 && <p role="status" className="text-sm rounded-lg border p-3">{lang === "es" ? "¿Cambiaste fecha o prioridad? Revisa una nueva vista previa. Tu plan guardado no cambia." : "Changed the date or priority? Review a new plan preview. Your saved plan stays unchanged."} <Link href="/training" className="underline">{lang === "es" ? "Revisar ciclo actualizado" : "Review updated cycle"}</Link></p>}

        {/* Races list */}
        {!loading && races.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            {races.map((r) => (
              <div key={r.id} className="card">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display font-bold flex items-center gap-2"><Flag className="w-4 h-4 text-coral-500" /> {r.name}</div>
                    <div className="text-xs text-slate-500">
                      {optionLabel(r.distance)} · {new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone:"UTC" })}
                      {r.startTime ? ` · ${r.startTime}` : ""}
                      {r.priority === 1 ? " · A-race" : r.priority === 2 ? " · B-race" : r.priority === 3 ? " · C-race" : ""}
                    </div>
                  </div>
                  <button type="button" aria-label={`${t("Delete race", "Eliminar carrera")}: ${r.name}`} onClick={() => del(r.id)} className="flex min-h-11 min-w-11 items-center justify-center text-slate-500 hover:text-coral-600"><Trash2 className="w-4 h-4" /></button>
                </div>
                <details className="mt-2"><summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">{t("Edit date, priority or venue", "Editar fecha, prioridad o lugar")}</summary>
                <form key={`${r.id}-${r.date}-${r.priority}-${r.location}`} onSubmit={event=>saveTiming(event,r.id)} className="mt-3 flex flex-wrap items-end gap-2">
                  <label className="text-sm">{lang === "es" ? "Fecha del evento" : "Event date"}<input name="date" type="date" className="input" defaultValue={String(r.date).slice(0,10)} required/></label>
                  <label className="text-sm">{lang === "es" ? "Prioridad" : "Priority"}<select name="priority" className="input" defaultValue={String(r.priority)}><option value="1">A</option><option value="2">B</option><option value="3">C</option></select></label>
                  <label className="w-full text-sm">{t("Venue or city", "Lugar o ciudad")}<input name="location" className="input min-h-11 !text-base" defaultValue={r.location || ""} /></label>
                  <button className="btn-secondary min-h-11" disabled={busy}>{t("Save event details", "Guardar datos del evento")}</button>
                </form>
                </details>
                <details className="mt-3 border-t pt-2"><summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">{t("Result & course details", "Resultado y recorrido")}</summary>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <div>
                    <label htmlFor={`result-${r.id}`} className="label">{lang === "es" ? "Resultado real (min)" : "Actual result (min)"}</label>
                    <input
                      id={`result-${r.id}`} className="input min-h-11 text-base w-32"
                      type="number"
                      step="0.01"
                      defaultValue={r.resultMin ?? ""}
                      onBlur={(e) => saveResult(r.id, e.target.value)}
                      placeholder={r.goalTimeMin ? `goal ${r.goalTimeMin}` : "—"}
                    />
                  </div>
                  {r.resultMin != null && (
                    <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1">
                      🏁 {r.resultMin} min {r.goalTimeMin ? (r.resultMin <= r.goalTimeMin ? "· 🎯 goal beaten" : `· +${Math.round((r.resultMin - r.goalTimeMin) * 10) / 10} vs goal`) : ""}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-xs text-slate-500 space-y-0.5">
                  {r.weather && (
                    <div className="bg-sky-50 text-sky-800 rounded-lg px-2 py-1 mb-1">
                      🌤 {lang === "es" ? "Pronóstico día de carrera" : "Race-day forecast"}: {r.weather.tempC}°C ({lang === "es" ? "sensación" : "feels"} {r.weather.feelsLikeC}°C) · 💨 {r.weather.windKph} km/h · {r.weather.condition}
                    </div>
                  )}
                  {r.targetTempC != null && <div><Thermometer className="w-3 h-3 inline mr-1" />{r.targetTempC}°C{r.humidity != null ? ` · ${r.humidity}% RH` : ""}</div>}
                  {r.baseElevM != null && <div><Mountain className="w-3 h-3 inline mr-1" />{r.baseElevM}m base elevation</div>}
                  {r.bikeTerrain && <div>Bike: {r.bikeTerrain}{r.bikeElevM ? ` (${r.bikeElevM}m climb)` : ""}</div>}
                  {r.runTerrain && <div>Run: {r.runTerrain}{r.runElevM ? ` (${r.runElevM}m)` : ""}</div>}
                  {r.swimVenue && <div><Waves className="w-3 h-3 inline mr-1" />{r.swimVenue}{r.waterTempC != null ? ` · ${r.waterTempC}°C` : ""}{r.swimCurrent && r.swimCurrent !== "none" ? ` · ${r.swimCurrent} current` : ""}</div>}
                  {(r.courseKm != null || r.courseElevM != null) && (
                    <div className="bg-emerald-50 text-emerald-800 rounded-lg px-2 py-1">
                      📐 {lang === "es" ? "Estimación derivada del GPX" : "GPX-derived estimate"}: {r.courseKm} km · {r.courseElevM} m {lang === "es" ? "ascenso · revisar en escenarios" : "ascent · review in scenarios"}
                    </div>
                  )}
                  {r.notes && <details className="rounded-lg border p-3"><summary className="cursor-pointer font-medium">{lang === "es" ? "Notas de la carrera y recorrido declarado" : "Race notes & reported course"}</summary><p className="mt-2 whitespace-pre-wrap break-words">{r.notes}</p><p className="mt-2">{lang === "es" ? "Las notas no sustituyen un recorrido verificado. Introduce las distancias de cada segmento explícitamente en Escenarios." : "Notes do not replace a verified course. Enter each leg distance explicitly in Scenarios."}</p></details>}
                  <div className="pt-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-ocean-600 cursor-pointer hover:underline">
                      📐 {r.courseKm != null ? (lang === "es" ? "Reemplazar GPX del recorrido" : "Replace course GPX") : (lang === "es" ? "Subir GPX del recorrido" : "Upload course GPX")}
                      <input
                        type="file"
                        accept=".gpx,text/xml,application/gpx+xml"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          await uploadGpx(r.id, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <div className="text-[10px] text-slate-400 mt-0.5">{lang === "es" ? "Revisa la distancia, la elevación y su procedencia antes de usar un escenario." : "Review distance, elevation and provenance before using a scenario."}</div>
                  </div>
                </div>
                </details>
                <p className="mt-3 text-sm text-slate-600">{r.location || t("Venue missing — add it when available.", "Falta el lugar; añádelo cuando lo sepas.")}</p>
                <Link href="/races/scenarios" className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold underline">{t("Review venue, course & weather", "Revisar lugar, recorrido y clima")}</Link>
              </div>
            ))}
          </div>
        )}

        {!loading && !verified && <button className="btn-secondary min-h-11" onClick={() => void load()}>{t("Reload saved races", "Recargar carreras")}</button>}
        {loading && <p role="status">{t("Loading saved races…", "Cargando carreras…")}</p>}
        {!loading && verified && races.length === 0 && <p className="text-sm text-slate-600">{t("No races saved. You can train without a race.", "No tienes carreras guardadas. Puedes entrenar sin carrera.")}</p>}
        <section className="card" aria-labelledby="add-race-title">
          <h2 id="add-race-title" className="font-display font-bold text-lg">{t("Add a race", "Añadir carrera")}</h2>
          <p className="mb-4 mt-1 text-sm text-slate-600">{t("Name, distance and date are required. Everything else can wait.", "Nombre, distancia y fecha son obligatorios. Lo demás puede esperar.")}</p>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {field("name", t("Race name", "Nombre de la carrera"), "text", true)}
              <div><label htmlFor="race-distance" className="label">{t("Distance / format", "Distancia / formato")}</label><select id="race-distance" required className="input min-h-11 !text-base" value={form.distance} onChange={event => set("distance", event.target.value)}><option value="">{t("Choose a distance", "Elige distancia")}</option>{DISTANCES.map(distance => <option key={distance} value={distance}>{optionLabel(distance)}</option>)}</select></div>
              {field("date", t("Date", "Fecha"), "date", true)}
              {field("location", t("Venue or city (optional)", "Lugar o ciudad (opcional)"))}
            </div>
            <details className="border-t border-sand-200 pt-2">
              <summary className="min-h-11 cursor-pointer content-center font-semibold text-sm">{t("Timing & goal (optional)", "Horario y objetivo (opcional)")}</summary>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {field("startTime", t("Local start time", "Hora local de salida"), "time")}
                <div><label htmlFor="race-priority" className="label">{t("Priority", "Prioridad")}</label><select id="race-priority" className="input min-h-11 !text-base" value={form.priority} onChange={event => set("priority", event.target.value)}><option value="1">{t("A — main race", "A — carrera principal")}</option><option value="2">{t("B — secondary", "B — secundaria")}</option><option value="3">{t("C — practice", "C — práctica")}</option></select></div>
                {field("goalTimeMin", t("Goal time (minutes)", "Tiempo objetivo (minutos)"), "number")}
                {field("notes", t("Notes / official race link", "Notas / enlace oficial"))}
              </div>
            </details>
            <details className="border-t border-sand-200 pt-2">
              <summary className="min-h-11 cursor-pointer content-center font-semibold text-sm">{t("Course & conditions (optional)", "Recorrido y condiciones (opcional)")}</summary>
              <p className="my-3 text-sm text-slate-600">{t("Enter confirmed information only. Blank means unknown. Use the venue & forecast workspace to check sources and assumptions.", "Introduce solo datos confirmados. Vacío significa desconocido. Revisa fuentes y supuestos en lugar y pronóstico.")}</p>
              <fieldset className="space-y-3"><legend className="font-semibold text-sm">{t("Land course", "Recorrido terrestre")}</legend><div className="grid gap-4 sm:grid-cols-2">
                {select("bikeTerrain", t("Bike terrain", "Terreno de ciclismo"), TERRAINS)}
                {field("bikeElevM", t("Bike ascent (m)", "Ascenso en bici (m)"), "number")}
                {select("runTerrain", t("Run terrain", "Terreno de carrera"), TERRAINS)}
                {field("runElevM", t("Run ascent (m)", "Ascenso a pie (m)"), "number")}
                {field("baseElevM", t("Venue elevation (m)", "Altitud del lugar (m)"), "number")}
              </div></fieldset>
              <fieldset className="mt-4 space-y-3"><legend className="font-semibold text-sm">{t("Weather", "Clima")}</legend><div className="grid gap-4 sm:grid-cols-2">
                {field("targetTempC", t("Air temperature (°C)", "Temperatura del aire (°C)"), "number")}
                {field("humidity", t("Humidity (%)", "Humedad (%)"), "number")}
              </div></fieldset>
              <details className="mt-3"><summary className="min-h-11 cursor-pointer content-center text-sm font-semibold">{t("Swim details", "Datos de natación")}</summary><div className="mt-3 grid gap-4 sm:grid-cols-2">
                {select("swimVenue", t("Water type", "Tipo de agua"), VENUES)}
                {field("waterTempC", t("Water temperature (°C)", "Temperatura del agua (°C)"), "number")}
                {select("swimCurrent", t("Current", "Corriente"), ["none", "mild", "strong"])}
                {select("federation", t("Federation", "Federación"), FEDERATIONS)}
                {select("category", t("Category", "Categoría"), CATEGORIES)}
              </div><p className="mt-3 text-sm text-slate-600">{t("Confirm current wetsuit rules with the organizer.", "Confirma las reglas del traje de neopreno con el organizador.")}</p></details>
            </details>
            <button type="submit" disabled={busy || loading || !verified} className="btn-primary min-h-11 w-full justify-center sm:w-auto"><Plus className="w-4 h-4" aria-hidden="true" />{busy ? t("Saving…", "Guardando…") : t("Save race", "Guardar carrera")}</button>
          </form>
        </section>
      </div>
    </ProtectedPage>
  );
}
