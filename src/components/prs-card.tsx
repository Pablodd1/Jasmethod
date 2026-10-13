"use client";

import { useEffect, useRef, useState } from "react";
import { Trophy, Plus, Trash2 } from "lucide-react";

// Personal Records card for Profile & Zones:
//  — computed PRs (read-only, derived from every synced device workout)
//  — manual PRs (user-editable: track PBs, gym marks, hand-timed field tests)
export function PrsCard({ lang = "en" }: { lang?: "en" | "es" }) {
  const [data, setData] = useState<any>(null);
  const [manual, setManual] = useState<any[]>([]);
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("sec");
  const [date, setDate] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const es = lang === "es";

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

  async function save(next: any[]) {
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
        body: JSON.stringify({ manual: next, expectedRevision: data.revision }),
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
          ? "Calculados de tus dispositivos (solo lectura) + tus marcas manuales (editables)."
          : "Computed from your devices (read-only) + your own marks (editable)."}
      </p>

      {saving && <p role="status" className="text-sm">{es ? "Guardando…" : "Saving…"}</p>}
      {err && <div role="alert" className="text-xs text-red-600 mb-2">{err}</div>}

      {data?.manualReviewRequired && <p role="alert" className="text-sm text-amber-900 mb-3">{es ? "Las marcas guardadas necesitan revisión. Añadir o borrar está desactivado para conservar los registros originales." : "Your saved personal bests need review. Adding or removing records is disabled to preserve the original data."}</p>}

      {/* Computed PRs from devices */}
      {data?.prs?.length > 0 && (
        <div className="space-y-1.5 mb-4">
          {data.prs.slice(0, 6).map((p: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate">
                {p.label}
                <span className="text-slate-400 text-xs"> · {p.title}</span>
              </span>
              <span className="font-semibold tabular-nums">
                {p.watts
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
              {m.value} {m.unit}
            </span>
            <span className="text-[10px] text-slate-400">{m.date}</span>
            <button
              className="p-1 rounded hover:bg-red-50 text-red-500"
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
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5 space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          <input aria-label={es ? "Nombre de la marca" : "Personal best label"} disabled={saving} className="input !py-1 text-xs" placeholder={es ? "Marca (ej. 5k TT)" : "Label (e.g. 5k TT)"} value={label} onChange={(e) => setLabel(e.target.value)} />
          <input aria-label={es ? "Resultado" : "Result"} disabled={saving} className="input !py-1 text-xs" type="number" step="0.01" placeholder={es ? "Valor" : "Value"} value={value} onChange={(e) => setValue(e.target.value)} />
          <select aria-label={es ? "Unidades" : "Units"} disabled={saving} className="input !py-1 text-xs" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="sec">sec</option>
            <option value="min">min</option>
            <option value="km">km</option>
            <option value="mi">mi</option>
            <option value="m">m</option>
            <option value="W">W</option>
            <option value="bpm">bpm</option>
            <option value="kg">kg</option>
            <option value="reps">reps</option>
          </select>
          <input aria-label={es ? "Fecha real (opcional)" : "Actual date (optional)"} disabled={saving} className="input !py-1 text-xs" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button
          className="btn-secondary w-full justify-center !py-1 text-xs"
          disabled={saving || !data || data.manualReviewRequired || !label.trim() || !value}
          onClick={async () => {
            if (await save([...manual, { label: label.trim(), value: Number(value), unit, date }])) {
              setLabel(""); setValue(""); setDate("");
            }
          }}
        >
          <Plus className="w-3.5 h-3.5" /> {es ? "Añadir marca" : "Add PR"}
        </button>
      </div>
    </div>
  );
}
