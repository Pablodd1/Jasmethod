"use client";

import { useEffect, useRef, useState } from "react";
import { Trophy, Plus, Trash2 } from "lucide-react";
import { personalRecordEntry, personalRecordText, RECORD_SPORTS, type RecordDraft } from "@/lib/personal-record-entry";
import { dateKey } from "@/lib/dates";

// Personal Records card for Profile & Zones:
//  — recorded activity results (read-only; not verified race or segment PRs)
//  — manual PRs (user-editable: track PBs, gym marks, hand-timed field tests)
export function PrsCard({ lang = "en", timezone = "UTC", units = "metric" }: { lang?: "en" | "es"; timezone?: string; units?: "metric"|"imperial" }) {
  const [data, setData] = useState<any>(null);
  const [manual, setManual] = useState<any[]>([]);
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [sport, setSport] = useState("run");
  const [metric, setMetric] = useState("time");
  const [unit, setUnit] = useState(units==="imperial"?"min/mi":"min/km");
  const [distance, setDistance] = useState("");
  const [distanceUnit, setDistanceUnit] = useState(units==="imperial"?"mi":"km");
  const [date, setDate] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [hyrox, setHyrox] = useState<{results:any[];unreadableResults:number}|null>(null);
  const [hyroxError,setHyroxError] = useState("");
  const hyroxLoading = useRef(false);
  const savingRef = useRef(false);
  const es = lang === "es";
  async function loadHyrox() {
    if(hyroxLoading.current || hyrox) return;
    hyroxLoading.current=true;setHyroxError("");
    try {
      const response=await fetch("/api/hyrox/results",{cache:"no-store",signal:AbortSignal.timeout(15000)});
      const result=await response.json();
      if(!response.ok || !Array.isArray(result.results) || result.results.some((row:any)=>typeof row.id!=="string" || row.source!=="athlete_report" || typeof row.input?.observedDate!=="string" || !Array.isArray(row.input?.actualSecs) || row.input.actualSecs.length!==16 || typeof row.completeness?.loggedSegments!=="number")) throw Error(es?"No se pudieron verificar los resultados HYROX guardados.":"Saved HYROX results could not be verified.");
      setHyrox({results:result.results,unreadableResults:result.unreadableResults||0});
    } catch(error){setHyroxError((error as Error).message);}
    finally {hyroxLoading.current=false;}
  }

  useEffect(() => {
    let active = true;
    fetch("/api/prs", {cache:"no-store", signal:AbortSignal.timeout(15000)}).then(async response => {
      if (!response.ok) throw Error("Could not load saved personal bests. Reload before editing.");
      const result = await response.json();
      if (typeof result.revision !== "string" || !Array.isArray(result.manual)) throw Error("Saved personal bests could not be verified. Reload before editing.");
      if (active) { setData(result); setManual(result.manual); }
    }).catch(error => { if (active) setErr((error as Error).message); });
    return () => { active = false; };
  }, []);

  async function save(next: any[], recordDraft?: RecordDraft) {
    if (savingRef.current) return false;
    if (!data || data.manualReviewRequired) {
      setErr(es ? "Revisa los registros guardados antes de editarlos. No se han modificado." : "Review the saved records before editing. They have not been changed.");
      return false;
    }
    savingRef.current = true; setSaving(true); setErr("");
    try {
      const response = await fetch("/api/prs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manual: next, expectedRevision: data.revision, ...(recordDraft ? {recordDraft} : {}) }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok) throw Error(response.status === 409 ? (es ? "Tus marcas cambiaron. Recarga para revisarlas; tu entrada sigue aquí y no se ha reenviado." : "Your saved records changed. Reload to review them; your entry is still here and nothing was resubmitted.") : result.error || "Save failed");
      if (result.ok !== true || typeof result.revision !== "string" || !Array.isArray(result.manual)) throw Error("The save could not be verified. Your entry is still here; reload saved records before retrying.");
      setData((current: any) => ({...current, manual: result.manual, revision: result.revision}));
      setManual(result.manual);
      return true;
    } catch (error) { setErr((error as Error).message); return false; }
    finally { savingRef.current = false; setSaving(false); }
  }

  const fmtPace = (sec: number) =>
    `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  return (
    <div className="card">
      <h2 className="font-display font-bold text-lg mb-1 flex items-center gap-2">
        <Trophy className="w-5 h-5 text-amber-500" />{" "}
        {es ? "Récords personales" : "Personal records"}
      </h2>
      <p className="text-xs text-slate-500 mb-3">
        {es
          ? "Revisa primero los resultados registrados, con su fuente y fecha. Si falta una marca, añádela manualmente. No cambian tus umbrales automáticamente."
          : "Review recorded results with their source and date first. Add a missing result manually. Records do not automatically change your thresholds."}
      </p>

      {saving && <p role="status" className="text-sm">{es ? "Guardando…" : "Saving…"}</p>}
      {err && <div role="alert" className="text-xs text-red-600 mb-2">{err}</div>}

      {data?.manualReviewRequired && <p role="alert" className="text-sm text-amber-900 mb-3">{es ? "Las marcas guardadas necesitan revisión. Añadir o borrar está desactivado para conservar los registros originales." : "Your saved personal bests need review. Adding or removing records is disabled to preserve the original data."}</p>}

      {/* Computed PRs from devices */}
      {data?.prs?.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {data.prs.map((p: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">
                {p.label}
                <span className="block text-slate-500 text-xs">{p.source || (es ? "Fuente no verificada" : "Source unverified")} · {p.date?.slice(0,10) || "—"} · {p.title}</span>
              </span>
              <span className="font-semibold tabular-nums">
                {p.minutes > 0
                  ? `${p.minutes} min`
                  : p.watts
                  ? `${p.watts} W`
                  : p.paceSecKm
                    ? fmtPace(p.paceSecKm) + "/km"
                    : p.paceSec100m
                      ? fmtPace(p.paceSec100m) + "/100m"
                      : p.avgSpeedKmh
                        ? `${p.avgSpeedKmh} km/h`
                        : p.km
                          ? `${p.km} km`
                          : `${p.minutes} min`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Manual PRs */}
      <div className="space-y-1.5">
        {manual.map((m, i) => (
          <div key={i} className="flex items-center gap-2 text-sm rounded-lg border border-slate-200 px-3 py-1.5">
            <span className="flex-1 truncate font-medium">{m.label}</span>
            <span className="tabular-nums font-semibold">
              {personalRecordText(m.value,m.unit)}
            </span>
            <span className="text-[10px] text-slate-400">{m.date}</span>
            <button
              className="min-h-11 min-w-11 inline-flex items-center justify-center rounded hover:bg-red-50 text-red-500"
              title={es ? "Eliminar marca" : "Remove record"}
              aria-label={`${es ? "Eliminar" : "Remove"} ${m.label}`}
              disabled={saving || !data || data.manualReviewRequired}
              onClick={() => save(manual.filter((_, j) => j !== i))}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Add manual PR */}
      <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
        <summary className="text-sm font-semibold min-h-11 cursor-pointer">{es ? "Añadir un resultado real que falta" : "Add a missing actual result"}</summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 [&_input]:min-h-11 [&_select]:min-h-11">
          <label className="text-xs">{es ? "Deporte" : "Sport"}<select aria-label="Record sport" className="input" disabled={saving} value={sport} onChange={e=>setSport(e.target.value)}>{RECORD_SPORTS.map(s=><option key={s} value={s}>{({run:es?"Carrera":"Run",bike:es?"Ciclismo":"Bike",swim:es?"Natación":"Swim",triathlon:es?"Triatlón":"Triathlon",hyrox:"HYROX",strength:es?"Fuerza":"Strength"})[s]}</option>)}</select></label>
          <label className="text-xs">{es ? "Tipo de resultado" : "Result type"}<select aria-label="Record metric" className="input" disabled={saving} value={metric} onChange={e=>{setMetric(e.target.value);setValue("");setUnit(e.target.value==="speed"?"km/h":e.target.value==="load"?"kg":"min/km");}}>{[ ["time",es?"Tiempo total":"Total time"],["pace",es?"Ritmo":"Pace"],["speed",es?"Velocidad":"Speed"],["power",es?"Potencia media":"Average power"],["distance",es?"Distancia":"Distance"],["load",es?"Carga":"Load"],["reps",es?"Repeticiones":"Repetitions"] ].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
          <input aria-label={es ? "Nombre de la marca" : "Personal best label"} disabled={saving} className="input min-h-11 text-sm" placeholder={es ? "Prueba, carrera o estación (ej. 5K)" : "Test, race or station (e.g. 5K)"} value={label} onChange={(e) => setLabel(e.target.value)} />
          <label className="text-xs">{metric==="time"?(es?"Tiempo total · m:ss o h:mm:ss":"Total time · m:ss or h:mm:ss"):metric==="pace"?(es?"Ritmo · m:ss":"Pace · m:ss"):metric==="power"?(es?"Potencia media (W)":"Average power (W)"):metric==="speed"?(es?"Velocidad":"Speed"):metric==="load"?(es?"Carga":"Load"):metric==="reps"?(es?"Repeticiones":"Repetitions"):(es?"Distancia":"Distance")}<input aria-label={es ? "Resultado" : "Result"} disabled={saving} className="input text-sm" type="text" inputMode={metric==="time"||metric==="pace"?"text":"decimal"} placeholder={metric==="time"?"24:30":metric==="pace"?"5:00":metric==="power"?"240":"30"} value={value} onChange={(e) => setValue(e.target.value)} /></label>
          {["pace","speed","load"].includes(metric)&&<label className="text-xs">{es?"Unidades del resultado":"Result units"}<select aria-label={es?"Unidades":"Units"} className="input" disabled={saving} value={unit} onChange={e=>setUnit(e.target.value)}>{(metric==="pace"?["min/km","min/mi","min/100m","min/100yd"]:metric==="speed"?["km/h","mph"]:["kg","lb"]).map(u=><option key={u}>{u}</option>)}</select></label>}
          {metric!=="distance"&&<label className="text-xs">{es?"Distancia del resultado (opcional)":"Result distance (optional)"}<input aria-label="Record distance" className="input" inputMode="decimal" value={distance} disabled={saving} onChange={e=>setDistance(e.target.value)}/></label>}
          <label className="text-xs">{es?"Unidades de distancia":"Distance units"}<select aria-label="Distance units" className="input" value={distanceUnit} disabled={saving} onChange={e=>setDistanceUnit(e.target.value)}>{["km","mi","m"].map(u=><option key={u}>{u}</option>)}</select></label>
          <label className="text-xs">{es?"Fecha del resultado":"Result date"}<input aria-label={es ? "Fecha real" : "Actual date"} disabled={saving} className="input text-sm" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        <button
          className="btn-secondary min-h-11 w-full justify-center text-sm"
          disabled={saving || !data || data.manualReviewRequired || !label.trim() || !value}
          onClick={async () => {
            const draft = {sport,metric,label,result:value,distance,distanceUnit,date,units:unit};
            let record;
            try { record = personalRecordEntry(draft,dateKey(new Date(),timezone)); }
            catch(error){setErr((error as Error).message);return;}
            if(manual.some(m=>m.label===record.label&&m.date===record.date&&m.value===record.value&&m.unit===record.unit)){setErr(es?"Este resultado ya está guardado.":"This result is already saved.");return;}
            if (await save([...manual, record],draft)) {
              setLabel(""); setValue(""); setDate("");
            }
          }}
        >
          <Plus className="w-3.5 h-3.5" /> {es ? "Añadir marca" : "Add PR"}
        </button>
      </details>
      <details className="mt-3 text-sm" onToggle={event=>{if(event.currentTarget.open)void loadHyrox();}}><summary className="min-h-11 cursor-pointer">{es?"Resultados HYROX":"HYROX results"}</summary><p>{es?"Registra los ocho tramos de carrera, las ocho estaciones y Roxzone por separado. El registro actual admite Singles Open/Pro. Un entrenamiento del reloj no confirma los parciales ni la división oficial. Los resultados incompletos siguen incompletos.":"Log the eight runs, eight stations and Roxzone separately. The current result log supports Singles Open/Pro. A watch workout does not establish station splits or an official division. Partial results stay incomplete."}</p>
        {hyroxError&&<p role="alert">{hyroxError} <button className="underline min-h-11" onClick={()=>void loadHyrox()}>{es?"Reintentar":"Retry"}</button></p>}
        {!hyrox&&!hyroxError&&<p role="status">{es?"Abre esta sección para cargar tus resultados guardados.":"Open this section to load your saved results."}</p>}
        {hyrox&&<div className="space-y-2 mt-2"><p>{hyrox.results.length} {es?"resultados guardados · fuente: atleta":"saved results · source: athlete report"}</p>{hyrox.unreadableResults>0&&<p role="alert">{es?"Algunos registros necesitan revisión; no se muestran como vacíos.":"Some records need review; they have not been treated as empty."}</p>}{hyrox.results.slice(0,3).map(row=><div key={row.id} className="rounded-lg border p-2"><strong>{row.input.eventName||"HYROX"}</strong> · {row.input.observedDate} · {row.input.pro?"Pro":"Open"}<p>{row.completeness.loggedSegments}/16 {es?"parciales registrados":"segments recorded"} · {es?"Tiempo total":"Finish time"}: {typeof row.completeness.actualFinishSeconds==="number"?personalRecordText(row.completeness.actualFinishSeconds,"sec"):(es?"— incompleto":"— incomplete")}</p></div>)}</div>}
        <a href="/hyrox" className="underline min-h-11 inline-flex items-center">{es?"Revisar o añadir parciales HYROX":"Review or add HYROX splits"}</a></details>
    </div>
  );
}
