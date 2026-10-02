"use client";

import { useEffect, useState } from "react";
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
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [err, setErr] = useState("");
  const es = lang === "es";

  async function load() {
    const r = await fetch("/api/prs");
    if (!r.ok) return;
    const d = await r.json();
    setData(d);
    setManual(d.manual || []);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(next: any[]) {
    setErr("");
    const r = await fetch("/api/prs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manual: next }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      setErr(d.error || "Save failed");
      return;
    }
    load();
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

      {err && <div className="text-xs text-red-600 mb-2">{err}</div>}

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
              title="Remove"
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
          <input className="input !py-1 text-xs" placeholder={es ? "Marca (ej. 5k TT)" : "Label (e.g. 5k TT)"} value={label} onChange={(e) => setLabel(e.target.value)} />
          <input className="input !py-1 text-xs" type="number" step="0.01" placeholder={es ? "Valor" : "Value"} value={value} onChange={(e) => setValue(e.target.value)} />
          <select className="input !py-1 text-xs" value={unit} onChange={(e) => setUnit(e.target.value)}>
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
          <input className="input !py-1 text-xs" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <button
          className="btn-secondary w-full justify-center !py-1 text-xs"
          disabled={!label.trim() || !value}
          onClick={() => {
            save([...manual, { label: label.trim(), value: Number(value), unit, date }]);
            setLabel(""); setValue("");
          }}
        >
          <Plus className="w-3.5 h-3.5" /> {es ? "Añadir marca" : "Add PR"}
        </button>
      </div>
    </div>
  );
}
