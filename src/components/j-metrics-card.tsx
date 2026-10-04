"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

export type JMetrics = {
  version: "jstress-srpe-v1"; unit: "AU";
  totalJStress: number | null; eligibleSessions: number; totalSessions: number;
  coveragePct: number | null; missingDays: number; windowDays: number; note: string;
  confirmedRestDays: string[]; timezone: string; today: string;
  current: { jBase: number | null; jRecent: number | null; jBalance: number | null };
  series: Array<{ date: string; jStress: number | null; jBase: number | null; jRecent: number | null; jBalance: number | null }>;
};
const display = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : Math.round(value).toLocaleString();
const lines = [
  { key: "jBase", label: "J Base", color: "#0369a1", dash: undefined },
  { key: "jRecent", label: "J Recent", color: "#9a3412", dash: "6 3" },
  { key: "jBalance", label: "J Balance", color: "#6b21a8", dash: "2 3" },
] as const;

export function JMetricsCard({ metrics, refreshKey, es = false, allowRestEntry = true }: { metrics?: JMetrics | null; refreshKey?: unknown; es?: boolean; allowRestEntry?: boolean }) {
  const [loaded, setLoaded] = useState<JMetrics | null>(null);
  const [loading, setLoading] = useState(metrics === undefined);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [date, setDate] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (metrics !== undefined) return;
    const controller = new AbortController();
    setLoading(true); setError(false); setLoaded(null);
    fetch("/api/fitness", { signal: controller.signal, cache: "no-store" })
      .then(async r => { if (!r.ok) throw Error("metrics unavailable"); return r.json(); })
      .then(d => { setLoaded(d.jMetrics ?? null); setLoading(false); })
      .catch(() => { if (!controller.signal.aborted) { setError(true); setLoading(false); } });
    return () => controller.abort();
  }, [metrics, refreshKey, revision]);
  const data = metrics === undefined ? loaded : metrics;
  const earliest = data?.today && /^\d{4}-\d{2}-\d{2}$/.test(data.today) ? new Date(Date.parse(`${data.today}T12:00:00Z`) - 89 * 86400000).toISOString().slice(0, 10) : undefined;
  async function saveRest(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setStatus("");
    try {
      const response = await fetch("/api/j-metrics/rest-day", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, confirmed }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || (es ? "No se pudo guardar." : "Could not save."));
      setStatus(confirmed ? (es ? "Descanso confirmado. Actualizando métricas." : "Rest confirmed. Refreshing metrics.") : (es ? "Confirmación eliminada. Actualizando métricas." : "Confirmation removed. Refreshing metrics."));
      setRevision(value => value + 1);
    } catch (error) { setStatus(error instanceof Error ? error.message : (es ? "No se pudo guardar." : "Could not save.")); }
    finally { setSaving(false); }
  }
  const values = data?.series.flatMap(point => [point.jStress, ...lines.map(line => point[line.key])].filter((v): v is number => v != null && Number.isFinite(v))) ?? [];
  const low = Math.min(0, ...values), high = Math.max(1, ...values);
  const y = (v: number) => 125 - (v - low) / (high - low) * 110;
  const x = (i: number) => 48 + i / Math.max(1, (data?.series.length ?? 1) - 1) * 500;
  return <section className="card space-y-3" aria-label={es ? "Tus métricas JMM" : "Your JMM metrics"}>
    <div className="flex flex-wrap justify-between gap-2"><h2 className="font-display text-xl font-bold">J Metrics</h2><Link href="/metrics" className="underline text-ocean-700">{es ? "Método y límites" : "Method and limits"}</Link></div>
    <p className="text-sm">{es ? "JStress = minutos realizados × esfuerzo percibido de la sesión (RPE, 0–10). Unidades arbitrarias (AU); no requiere dispositivo." : "JStress = completed minutes × your session effort rating (RPE, 0–10). Arbitrary units (AU); no device required."}</p>
    {!data ? <p role="status" className="text-sm">{loading ? (es ? "Cargando…" : "Loading…") : error ? (es ? "No se pudieron cargar las métricas. Vuelve a cargar la página." : "Metrics could not be loaded. Reload the page to retry.") : (es ? "— No hay datos disponibles para esta vista." : "— No data available for this view.")}</p> : <>
      <p className="text-sm">{es ? "JStress registrado" : "Recorded JStress"}: <strong>{display(data.totalJStress)} AU</strong> · {data.windowDays} {es ? "días" : "days"}</p>
      <p className="text-sm">{es ? "Cobertura" : "Coverage"}: {data.eligibleSessions}/{data.totalSessions} {es ? "sesiones" : "sessions"} ({display(data.coveragePct)}{data.coveragePct == null ? "" : "%"}). {data.missingDays} {es ? "días sin datos completos; no equivalen a descanso confirmado." : "days without complete data; these are not confirmed rest days."}</p>
      <div className="grid grid-cols-3 gap-2">{lines.map(line => <div key={line.key} className="rounded-lg border p-2"><div className="text-xs font-bold">{line.label}</div><div className="text-lg font-semibold">{display(data.current[line.key])} <span className="text-xs">AU</span></div></div>)}</div>
      <p className="text-xs">{es ? "Resúmenes suavizados en escala de carga diaria (AU), no mediciones de condición física, fatiga ni preparación. Las lagunas se mantienen visibles." : "Smoothed summaries on a daily-load scale (AU), not measurements of fitness, fatigue or readiness. Missing values remain gaps."}</p>
      {values.length > 0 && <>
        <svg viewBox="0 0 560 150" className="w-full" role="img" aria-label={es ? "Tendencias de carga JMM; valores en la tabla desplegable" : "JMM load trends; values in the expandable table"}>
          <text x="0" y="20" fontSize="10">{display(high)}</text><text x="0" y="128" fontSize="10">{display(low)}</text>
          <line x1="48" x2="548" y1={y(0)} y2={y(0)} stroke="#94a3b8" />
          {data.series.map((point, i) => point.jStress == null || !Number.isFinite(point.jStress) ? null : point.jStress === 0
            ? <circle key={`daily-${point.date}`} data-daily-load="0" cx={x(i)} cy={y(0)} r="3" fill="white" stroke="#475569" />
            : <rect key={`daily-${point.date}`} data-daily-load={point.jStress} x={x(i) - Math.min(12, 400 / data.series.length) / 2} y={y(point.jStress)} width={Math.min(12, 400 / data.series.length)} height={y(0) - y(point.jStress)} fill="#475569" opacity="0.5" />)}
          {lines.map(line => <g key={line.key}>{data.series.map((point, i) => {
            const value = point[line.key], previous = data.series[i - 1]?.[line.key];
            if (value == null || !Number.isFinite(value)) return null;
            return <g key={point.date}>{i > 0 && previous != null && Number.isFinite(previous) && <line x1={x(i - 1)} y1={y(previous)} x2={x(i)} y2={y(value)} stroke={line.color} strokeWidth="2" strokeDasharray={line.dash} />}<circle cx={x(i)} cy={y(value)} r="2" fill={line.color} /></g>;
          })}</g>)}
          <text x="48" y="146" fontSize="10">{data.series[0]?.date}</text><text x="548" y="146" fontSize="10" textAnchor="end">{data.series.at(-1)?.date}</text>
        </svg>
        <div className="flex flex-wrap gap-4 text-xs"><span>▥ JStress · {es ? "barras diarias; ○ = cero confirmado" : "daily bars; ○ = confirmed zero"}</span>{lines.map(line => <span key={line.key}><svg width="25" height="10" className="inline mr-1" aria-hidden="true"><line x1="0" x2="25" y1="5" y2="5" stroke={line.color} strokeWidth="2" strokeDasharray={line.dash} /></svg>{line.label}</span>)}</div>
      </>}
      <p className="text-xs text-slate-600">{data.note}</p>
      {allowRestEntry && metrics === undefined && <form onSubmit={saveRest} className="border rounded-lg p-3 space-y-3 text-sm">
        <p>{es ? "Confirma solo días realmente sin entrenamiento. J Recent requiere 7 días consecutivos completos; J Base y J Balance requieren 42. Un día desconocido interrumpe la secuencia." : "Confirm only actual days without training. J Recent needs 7 consecutive complete days; J Base and J Balance need 42. An unknown day interrupts the sequence."}</p>
        <label className="block">{es ? "Fecha" : "Date"} ({data.timezone})<input className="input mt-1" type="date" required min={earliest} max={data.today} value={date} onChange={event => { setDate(event.target.value); setConfirmed(data.confirmedRestDays?.includes(event.target.value) ?? false); setStatus(""); }} /></label>
        <label className="flex gap-2 items-start"><input type="checkbox" checked={confirmed} onChange={event => { setConfirmed(event.target.checked); setStatus(""); }} /><span>{es ? "Confirmo que no entrené en esta fecha. Desmarca para eliminar una confirmación anterior." : "I confirm no training on this date. Uncheck to remove a previous confirmation."}</span></label>
        <button className="btn-secondary" type="submit" disabled={!date || saving}>{saving ? (es ? "Guardando…" : "Saving…") : (es ? "Guardar confirmación" : "Save confirmation")}</button>
      </form>}
      <details><summary className="cursor-pointer text-sm underline">{es ? "Ver valores diarios" : "View daily values"}</summary><div className="overflow-x-auto"><table className="w-full text-xs mt-2"><caption className="sr-only">JMM daily load, AU</caption><thead><tr>{[es ? "Fecha" : "Date", "JStress", "J Base", "J Recent", "J Balance"].map(label => <th key={label} scope="col" className="text-left p-2">{label}</th>)}</tr></thead><tbody>{data.series.map(point => <tr key={point.date}><th scope="row" className="text-left p-2 font-normal">{point.date}</th>{[point.jStress, point.jBase, point.jRecent, point.jBalance].map((value, i) => <td key={i} className="p-2">{display(value)}</td>)}</tr>)}</tbody></table></div></details>
    </>}
    {status && <p role="status" className="text-sm">{status}</p>}
  </section>;
}
