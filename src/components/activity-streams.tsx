"use client";
import React, { useCallback, useEffect, useState } from "react";

type Lang = "en" | "es";
export interface StreamStatus { enabled: boolean; retentionDays: number | null; workoutIds: string[]; unavailable?: boolean }

/** Whether second-by-second storage is switched on for this deployment, and which of MY activities have stored data. */
export function useStreamStatus() {
  const [status, setStatus] = useState<StreamStatus>({ enabled: false, retentionDays: null, workoutIds: [] });
  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/activity-streams", { cache: "no-store" });
      if (response.ok) setStatus(await response.json());
    } catch { /* optional feature: stay hidden when unreachable */ }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { status, reload };
}

/** Opt-in at upload time. Unchecked by default; nothing second-by-second is kept unless this is ticked for that upload. */
export function StreamConsentCheckbox({ lang, retentionDays, checked, onChange }: { lang: Lang; retentionDays: number | null; checked: boolean; onChange: (value: boolean) => void }) {
  const es = lang === "es";
  return (
    <label className="flex items-start gap-2 text-xs text-slate-600">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="mt-0.5" />
      <span>
        {es
          ? `Guardar los datos segundo a segundo de esta actividad (frecuencia cardíaca, potencia, cadencia, velocidad, altitud) para analizarla. No se guarda GPS. Se borran a los ${retentionDays ?? 180} días y puedes borrarlos antes. No se guardan actividades de origen Strava.`
          : `Keep this activity's second-by-second data (heart rate, power, cadence, speed, altitude) so it can be analysed. No GPS is stored. It is deleted after ${retentionDays ?? 180} days and you can delete it sooner. Strava-origin activities are never stored.`}
      </span>
    </label>
  );
}

interface Analysis {
  ok: boolean; reason?: string; message?: string; durationS?: number;
  power?: { avgW: number; npW: number | null; vi: number | null; intensityFactor: number | null; tss: number | null; best: { seconds: number; avgW: number }[] } | null;
  hr?: { avgBpm: number; maxBpm: number; secondsInZone: number[] | null } | null;
  decoupling?: { percent: number; basis: "power" | "speed" } | null;
  efforts?: { startS: number; durationS: number; channel: "power" | "hr"; avg: number; avgHrBpm: number | null; zone: number | null }[];
  notes?: string[];
  workout?: { title: string };
  anchors?: { ftpW: number | null };
}
const dash = (value: number | null | undefined, unit = "") => (value === null || value === undefined ? "—" : `${value}${unit}`);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const REFUSALS: Record<string, { en: string; es: string }> = {
  strava_restricted: { en: "This activity came from Strava, so it is kept out of JMM's analysis.", es: "Esta actividad viene de Strava, por lo que no entra en el análisis de JMM." },
  unknown_provenance: { en: "This activity's origin is not recorded, so it is not analysed.", es: "No se registra el origen de esta actividad, por lo que no se analiza." },
  no_streams: { en: "No second-by-second data is stored for this activity.", es: "No hay datos segundo a segundo guardados para esta actividad." },
  too_short: { en: "The recording is too short to analyse.", es: "La grabación es demasiado corta para analizarla." },
  storage_disabled: { en: "Second-by-second storage is not enabled.", es: "El almacenamiento segundo a segundo no está habilitado." },
};

/** Deterministic analysis of one stored activity. Unknown values show "—", never 0. */
export function ActivityAnalysisCard({ workoutId, lang }: { workoutId: string; lang: Lang }) {
  const es = lang === "es";
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setData(null); setError("");
    fetch(`/api/activity-analysis?workoutId=${encodeURIComponent(workoutId)}`, { cache: "no-store" })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Failed"); if (live) setData(body); })
      .catch(e => live && setError((e as Error).message));
    return () => { live = false; };
  }, [workoutId]);
  if (error) return <p role="alert" className="text-xs text-red-600">{error}</p>;
  if (!data) return <p role="status" className="text-xs text-slate-500">{es ? "Analizando…" : "Analysing…"}</p>;
  if (!data.ok) return <p role="status" className="text-xs text-slate-600">{(data.reason && REFUSALS[data.reason]?.[lang]) || data.message}</p>;
  const zones = data.hr?.secondsInZone;
  return (
    <section aria-label={es ? "Análisis de la actividad" : "Activity analysis"} className="rounded-lg border border-slate-200 p-3 text-xs space-y-2" data-testid="activity-analysis">
      <h3 className="font-semibold">{data.workout?.title ?? (es ? "Actividad" : "Activity")} · {data.durationS ? mmss(data.durationS) : "—"}</h3>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
        <div><dt className="text-slate-500">{es ? "Potencia media" : "Avg power"}</dt><dd>{dash(data.power?.avgW, " W")}</dd></div>
        <div><dt className="text-slate-500">NP</dt><dd>{dash(data.power?.npW, " W")}</dd></div>
        <div><dt className="text-slate-500">IF</dt><dd>{dash(data.power?.intensityFactor)}</dd></div>
        <div><dt className="text-slate-500">TSS</dt><dd>{dash(data.power?.tss)}</dd></div>
        <div><dt className="text-slate-500">{es ? "FC media" : "Avg HR"}</dt><dd>{dash(data.hr?.avgBpm, " bpm")}</dd></div>
        <div><dt className="text-slate-500">{es ? "FC máx." : "Max HR"}</dt><dd>{dash(data.hr?.maxBpm, " bpm")}</dd></div>
        <div><dt className="text-slate-500">{es ? "Desacople aeróbico" : "Aerobic decoupling"}</dt><dd>{dash(data.decoupling?.percent, " %")}</dd></div>
        <div><dt className="text-slate-500">FTP</dt><dd>{dash(data.anchors?.ftpW, " W")}</dd></div>
      </dl>
      {zones && <p>{es ? "Tiempo por zona de FC" : "Time in HR zones"}: {zones.map((s, i) => `Z${i + 1} ${mmss(s)}`).join(" · ")}</p>}
      {!!data.efforts?.length && (
        <div>
          <p className="font-medium">{es ? "Esfuerzos duros detectados" : "Hard efforts detected"}</p>
          <ol className="list-decimal pl-5">
            {data.efforts.map((e, i) => <li key={i}>{mmss(e.startS)} · {mmss(e.durationS)} · {e.avg} {e.channel === "power" ? "W" : "bpm"}{e.zone ? ` · Z${e.zone}` : ""}</li>)}
          </ol>
        </div>
      )}
      {!!data.notes?.length && <ul className="text-slate-500 list-disc pl-5">{data.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
    </section>
  );
}

/** Deletion controls and recent analyses. Visible only when storage is enabled. */
export function StoredStreamsPanel({ lang, status, reload, recentIds }: { lang: Lang; status: StreamStatus; reload: () => void | Promise<void>; recentIds: string[] }) {
  const es = lang === "es";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (!status.enabled) return null;
  async function remove(query: string) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/activity-streams?${query}`, { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Failed");
      setMessage(es ? `Se borraron ${body.deleted} actividades.` : `Deleted data for ${body.deleted} ${body.deleted === 1 ? "activity" : "activities"}.`);
      await reload();
    } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <section className="space-y-2" aria-label={es ? "Datos segundo a segundo" : "Second-by-second data"} data-testid="stored-streams">
      <h3 className="text-sm font-semibold">{es ? "Datos segundo a segundo" : "Second-by-second data"}</h3>
      <p className="text-xs text-slate-500">
        {es ? `Guardados: ${status.workoutIds.length} actividades (se borran a los ${status.retentionDays ?? 180} días).` : `Stored for ${status.workoutIds.length} ${status.workoutIds.length === 1 ? "activity" : "activities"} (deleted after ${status.retentionDays ?? 180} days).`}
      </p>
      {status.workoutIds.length > 0 && (
        <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={() => remove("all=1")}>
          {es ? "Borrar todos mis datos segundo a segundo" : "Delete all my second-by-second data"}
        </button>
      )}
      {message && <p role="status" className="text-xs text-slate-600">{message}</p>}
      {recentIds.slice(0, 3).map(id => (
        <div key={id} className="space-y-1">
          <ActivityAnalysisCard workoutId={id} lang={lang} />
          <button type="button" className="text-xs underline text-slate-500" disabled={busy} onClick={() => remove(`workoutId=${encodeURIComponent(id)}`)}>
            {es ? "Borrar los datos de esta actividad" : "Delete this activity's data"}
          </button>
        </div>
      ))}
    </section>
  );
}
