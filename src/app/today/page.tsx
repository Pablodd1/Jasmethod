"use client";
import { CoachingConversation } from "@/components/coaching-conversation";
import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Watch } from "lucide-react";
import { FuelTimeline } from "@/components/fuel-timeline";
import { EstimateBanner } from "@/components/estimate-banner";
import { WorkoutSparkline } from "@/components/workout-sparkline";
import { fmtVolumeDual } from "@/lib/units";
import { fmtDistance } from "@/lib/units";
import { dayOffProtocol } from "@/lib/day-off";
import { allDeliveryGuides } from "@/lib/device-delivery";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
export default function TodayPage() {
  const { user } = useAuth();
  const es = user?.language === "es";
  const [stepsView, setStepsView] = useState<"list" | "cards">("list");
  useEffect(() => {
    try {
      const v = localStorage.getItem("jmm_steps_view");
      if (v === "cards" || v === "list") setStepsView(v);
    } catch {}
  }, []);
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [offline, setOffline] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState(false),
    [message, setMessage] = useState(""),
    [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState("");
  const [externalConsent, setExternalConsent] = useState(false);
  const [assistantMode, setAssistantMode] = useState("");
  const [assistantProposal, setAssistantProposal] = useState<{command:string;value:number|null;sport:string|null;editorUrl:string}|null>(null);
  const load = useCallback(async () => {
    if (!user) return;
    try {
      const r = await fetch("/api/today");
      if (!r.ok) throw Error("Could not load today's training");
      const d = await r.json();
      setData(d);
      setOffline(false);
      setError("");
      try {
        localStorage.setItem(`jmm_today_${user.id}`, JSON.stringify(d));
      } catch {}
    } catch (e: any) {
      setError(e.message);
      try {
        const saved = localStorage.getItem(`jmm_today_${user.id}`);
        if (saved) {
          setData(JSON.parse(saved));
          setOffline(true);
        }
      } catch {}
    }
  }, [user]);
  // Mount-load: without this the page never fetches — /api/today answers,
  // but nothing ever asks it (regression from an earlier page rewrite).
  useEffect(() => {
    if (user) load();
  }, [user, load]);
  // Background auto-sync: if devices are connected and data is stale (>12h),
  // silently sync on page load. The athlete never has to press anything.
  const [autoSynced, setAutoSynced] = useState(false);
  useEffect(() => {
    if (!user || !data || autoSynced) return;
    const cs = data.connectors;
    if (!cs?.length) return;
    const connected = cs.filter((c: any) => c.status === "connected");
    if (!connected.length) return;
    const stale = connected.some(
      (c: any) => !c.lastSyncAt || Date.now() - new Date(c.lastSyncAt).getTime() > 12 * 3600000,
    );
    if (!stale) return;
    setAutoSynced(true);
    fetch("/api/connectors/sync", { method: "POST" })
      .then(() => load())
      .catch(() => {});
  }, [user, data, autoSynced, load]);
  const session =
    data?.sessions.find((s: any) => s.id === selected) ||
    data?.sessions.find(
      (s: any) => !s.completed && s.feedbackStatus !== "skipped",
    ) ||
    data?.sessions[0];
  async function action(url: string, body: any, method = "POST") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Request failed");
      setMessage(d.message || (es ? "Guardado" : "Saved"));
      setFeedback(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function download(approve = false) {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/workout/approve?sessionId=${session.id}`, {
        method: approve ? "POST" : "GET",
      });
      if (!r.ok) throw Error((await r.json().catch(() => ({}))).error);
      // Approve also emails the .FIT with import steps — tell the athlete.
      if (approve && r.headers.get("X-Delivered-Email") === "1")
        setMessage(
          es
            ? "Aprobado ✓ — el archivo FIT se envió por correo. La recepción en el reloj no está confirmada."
            : "Approved ✓ — the FIT file was emailed. Watch receipt is not confirmed."
        );
      await saveBlob(r, "jasmethod-workout.fit");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveBlob(r: Response, name: string) {
    const blob = await r.blob(),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // SEND TO WATCH — the phone-only direct path: fetch the approved .FIT and
  // open the native share sheet with the file attached. The athlete picks
  // a receiving app from the share sheet; compatibility is unverified. Browsers
  // (no file-share support) fall back to the download.
  async function sendToWatch() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/workout/approve?sessionId=${session.id}`, {
        method: "POST",
      });
      if (!r.ok) throw Error((await r.json().catch(() => ({}))).error);
      // Read the body ONCE — a Response body can only be consumed a single
      // time; the share + download fallback paths both reuse this buffer.
      const buf = await r.arrayBuffer();
      const file = new File(
        [buf],
        "jasmethod-workout.fit",
        { type: "application/octet-stream" },
      );
      const shareable =
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });
      let shared = false;
      if (shareable) {
        try {
          // Chrome requires share() inside the user-activation window; the FIT
          // fetch can outlive it on slow connections, and the OS may deny the
          // permission (NotAllowedError → "Permission denied"). Any share
          // failure degrades to a plain download instead of an error banner.
          await navigator.share({
            files: [file],
            title: session.title,
            text: es
              ? "Archivo de entrenamiento JMM; comprueba compatibilidad antes de importar."
              : "JMM workout file; check compatibility before importing.",
          });
          shared = true;
          setMessage(
            es
              ? "Compartido ✓ — la hoja de compartir terminó. JMM no puede confirmar recepción en el reloj."
              : "Shared ✓ — the share sheet completed. JMM cannot confirm watch receipt."
          );
        } catch (shareErr: any) {
          if (shareErr?.name === "AbortError") {
            setBusy(false);
            return; // user closed the sheet — nothing to do
          }
          console.warn("Web Share unavailable (" + (shareErr?.name || "?") + ") — falling back to download");
        }
      }
      if (!shared) {
        // Reuse the already-read buffer — calling r.blob() again would throw
        // "body stream already read" (the exact bug reported on desktop).
        await saveBlob(new Response(buf), "jasmethod-workout.fit");
        setMessage(
          es
            ? "Archivo descargado. Comprueba compatibilidad con tu app y reloj antes de importarlo."
            : "File downloaded. Check your app and watch compatibility before importing."
        );
      }
      await load();
    } catch (e: any) {
      if (e?.name !== "AbortError") setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <ProtectedPage>
      <div className="space-y-5 max-w-4xl mx-auto">
        <div>
          <p className="text-sm text-slate-500">{data?.date}</p>
          <h1 className="font-display text-3xl font-bold">
            {es ? "Entrenamiento de hoy" : "Today's training"}
          </h1>
          {data?.race && (
            <p className="text-sm text-ocean-700">
              {data.race.name} · {data.race.daysAway} {es ? "días" : "days"}
            </p>
          )}
          {data?.needsTesting && (data.needsTesting.vo2max || data.needsTesting.lthr) && (
            <div className="mt-2">
              <EstimateBanner
                compact
                vo2maxMissing={data.needsTesting.vo2max}
                lthrMissing={data.needsTesting.lthr}
                vo2maxSource={data.vo2maxSource}
              />
            </div>
          )}
        </div>
        {offline && (
          <div role="status" className="card bg-amber-50 text-amber-900">
            {es ? "Copia sin conexión" : "Offline copy"} · {data?.date} ·{" "}
            {es ? "Actualizada" : "Updated"}{" "}
            {new Date(data.updatedAt).toLocaleString()}.{" "}
            {es
              ? "Conéctate para guardar cambios o recibir una nueva adaptación."
              : "Reconnect before saving changes or relying on a new adaptation."}
          </div>
        )}
        {error && (
          <div role="alert" className="card text-red-700">
            {error}
            <button className="btn-secondary ml-3" onClick={load}>
              {es ? "Reintentar" : "Retry"}
            </button>
          </div>
        )}
        {message && (
          <p role="status" className="card text-green-800">
            {message}
          </p>
        )}
        {/* Watch-delivery nudge — structured session exists but Intervals.icu
            (the automatic watch bridge) isn't connected yet. */}
        {data?.sessions?.some((s: any) => s.durationMin > 0) &&
          !data?.connectors?.some((c: any) => c.provider === "intervals" && c.status === "connected") && (
          <div className="card border-lime-300 bg-lime-50 flex flex-wrap items-center gap-3 p-4">
            <Watch className="w-5 h-5 text-lime-700 shrink-0" />
            <p className="text-sm flex-1 text-lime-900 font-medium">
              {es
                ? "¿Quieres este entrenamiento en tu reloj automáticamente? Conecta Intervals.icu gratis (2 min) y llegará a tu Garmin/COROS sin descargar nada."
                : "Want this workout on your watch automatically? Connect Intervals.icu free (2 min) and it reaches your Garmin/COROS with no downloads."}
            </p>
            <Link href="/connectors" className="btn-primary text-sm shrink-0">
              {es ? "Conectar" : "Connect"}
            </Link>
          </div>
        )}
        {/* Connect devices banner — only when 0 devices connected */}
        {data?.deviceSummary && data.deviceSummary.connected === 0 && (
          <div className="card border-ocean-300 bg-ocean-50 flex flex-wrap items-center gap-3 p-4">
            <Watch className="w-5 h-5 text-ocean-600 shrink-0" />
            <p className="text-sm flex-1 text-ocean-900 font-medium">
              {es
                ? "Conecta un proveedor disponible o registra los datos manualmente. La conexión directa con Garmin/COROS aún no está implementada."
                : "Connect an available provider or enter data manually. Direct Garmin/COROS integration is not implemented yet."}
            </p>
            <Link href="/connectors" className="btn-primary text-sm shrink-0">
              {es ? "Conectar ahora" : "Connect now"}
            </Link>
          </div>
        )}



        {/* KCoach Activity Reports — post-activity narrative from device sync */}
        {!!data?.activityReports?.length && (
          <div className="card p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              📊 {es ? "Reporte de actividad" : "Activity report"}
            </h2>
            {data.activityReports.map(
              (rep: {
                id: string;
                date: string;
                title: string;
                sport: string;
                headline: string;
                body: string;
              }) => (
                <div key={rep.id}>
                  <p className="text-base font-semibold text-slate-900">
                    {rep.headline}
                  </p>
                  {rep.body && (
                    <p className="text-sm text-slate-600 mt-1 leading-relaxed">
                      {rep.body}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">
                    {rep.title} ·{" "}
                    {new Date(rep.date).toLocaleDateString(es ? "es" : "en", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
              ),
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Link href="/checkin" className="btn-primary">
            {es ? "Chequeo de hoy" : "Daily check-in"}
          </Link>
          <Link href="/calendar" className="btn-secondary">
            {es ? "Calendario" : "Calendar"}
          </Link>
          <button
            className="btn-secondary"
            disabled={busy || offline}
            onClick={() => action("/api/connectors/sync", {})}
          >
            {es ? "Sincronizar dispositivos" : "Sync devices"}
          </button>
        </div>
        {!data && !error && (
          <p role="status">{es ? "Cargando sesión…" : "Loading session…"}</p>
        )}
        {data && !data.sessions.length && (
          <div className="card">
            <h2 className="font-bold">
              {es ? "Sin sesiones programadas" : "No sessions planned"}
            </h2>
            <Link className="btn-primary mt-3" href="/training">
              {es ? "Crear plan" : "Create a plan"}
            </Link>
          </div>
        )}
        {data?.sessions.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {data.sessions.map((s: any) => (
              <button
                key={s.id}
                className={
                  s.id === session?.id ? "btn-primary" : "btn-secondary"
                }
                onClick={() => {
                  setSelected(s.id);
                  setFeedback(false);
                }}
              >
                {s.feedbackStatus === "partial" ? "◐ " : s.feedbackStatus === "skipped" ? "× " : s.completed ? "✓ " : ""}
                {s.title} · {s.durationMin} min
              </button>
            ))}
          </div>
        )}
        {session && (
          <>
            <div className="card !p-0 overflow-hidden">
              <div className="bg-ocean-800 text-white p-5">
                <p className="text-xs uppercase">
                  {session.feedbackStatus === "partial" ? (es ? "Parcial" : "Partially completed") : session.feedbackStatus === "skipped" ? (es ? "Omitido" : "Skipped") : session.completed
                    ? es
                      ? "Completado"
                      : "Completed"
                    : session.prescription.verdict}{" "}
                  · {session.startTime || ""}
                </p>
                <h2 className="font-display text-2xl font-bold">
                  {session.title}
                </h2>
                <p className="mt-2">
                  {session.durationMin} min · {session.intensity.toUpperCase()}
                  {session.prescription.targets.rpe
                    ? ` · RPE ${session.prescription.targets.rpe}/10`
                    : ""}
                </p>
                <p className="text-sm opacity-90 mt-1">
                  {Object.entries(session.prescription.targets)
                    .filter(([k]) => k !== "rpe")
                    .map(([, v]) => v)
                    .join(" · ")}
                </p>
              </div>
              <div className="p-5 space-y-4">
                {/* TrainingPeaks-style summary: load · intensity · distance */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: es ? "Carga est." : "TSS est.", value: session.tss ?? "—" },
                    { label: es ? "IF est." : "IF est.", value: session.if ?? "—" },
                    {
                      label: es ? "Distancia" : "Distance",
                      value:
                        session.distanceKm != null
                          ? fmtDistance(session.distanceKm, data?.units === "imperial" ? "imperial" : "metric")
                          : "—",
                    },
                  ].map((m) => (
                    <div key={m.label} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                      <div className="text-lg font-bold tabular-nums text-ink-900">{m.value}</div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{m.label}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  🍚 {es ? "COMBUSTIBLE PRE" : "PRE-WORKOUT FUEL"}: {session.fuel?.preSession?.carbsG > 0 ? (
                    <>
                      <strong>{session.fuel.preSession.carbsG} g {es ? "carbohidratos" : "carbs"} ({session.fuel.preSession.timingLabel})</strong> — {session.fuel.preSession.note}
                    </>
                  ) : (
                    es ? "sesión corta — comida normal 1-2 h antes basta." : "short session — a normal meal 1-2 h before is enough."
                  )}
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                  💧 {es ? "AGUA PRE: 400-600 ml en los 60 min previos (+ pizca de sal en calor)." : "WATER PRE: 400-600 ml in the last 60 min (+ pinch of salt in heat)."}
                </div>
                <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs text-fuchsia-900">
                  🧠 {es ? "VISUALIZACIÓN (2 min, sin teléfono)" : "VISUALIZATION (2 min, phone away)"} — {es
                    ? "cierra los ojos, véete ejecutando la secuencia de abajo: el lugar, el ritmo, la respiración en el esfuerzo. El scrolling roba las catecholaminas que el entreno necesita (Liu 2025)."
                    : "close your eyes, see yourself executing the sequence below: the place, the rhythm, your breathing at effort. Scrolling steals the catecholamines training needs (Liu 2025)."}
                </div>
                {session.prescription.steps.length > 2 && (
                  <WorkoutSparkline steps={session.prescription.steps} />
                )}
                {session.prescription.steps.length ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                        {es ? "Serie principal" : "Main set"}
                      </span>
                      <button
                        className="ml-auto text-[10px] font-semibold uppercase tracking-wide rounded-full px-2 py-0.5 border border-ocean-300 text-ocean-700 hover:bg-ocean-50"
                        onClick={() => {
                          const next = stepsView === "list" ? "cards" : "list";
                          setStepsView(next);
                          try { localStorage.setItem("jmm_steps_view", next); } catch {}
                        }}
                      >
                        {stepsView === "list"
                          ? es ? "▤ Tarjetas" : "▤ Cards"
                          : es ? "☰ Lista" : "☰ List"}
                      </button>
                    </div>
                    {stepsView === "cards" ? (
                      <div className="space-y-2">
                        {session.prescription.steps.map((s: any, i: number) => (
                          <div key={i}>
                            {/* Repeat-set header — the TrainingPeaks "Repeat N ×" line */}
                            {s.group && session.prescription.steps[i - 1]?.group !== s.group && (
                              <div className="mt-2 mb-1.5 first:mt-0 rounded-lg bg-ink-900 text-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
                                🔁 {s.group}
                              </div>
                            )}
                          <div
                            className={`rounded-xl border p-3 ${
                              s.phase === "active"
                                ? "border-ocean-300 bg-ocean-50 shadow-sm"
                                : s.phase === "recovery"
                                  ? "border-amber-200 bg-amber-50/60"
                                  : "border-slate-200 bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`flex-none w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${
                                  s.phase === "active"
                                    ? "bg-ocean-600 text-white"
                                    : "bg-slate-300 text-slate-700"
                                }`}
                              >
                                {i + 1}
                              </span>
                              <span className="font-semibold text-sm flex-1">{s.name}</span>
                              <span className="text-[10px] font-bold uppercase rounded-full px-2 py-0.5 bg-white border border-slate-200 text-slate-600">
                                {s.zone.toUpperCase()}
                              </span>
                            </div>
                            {/* The considered metric for THIS step — HR, pace or power */}
                            {(() => {
                              const t = s.targets;
                              const metric = t?.hr || t?.pace || t?.power;
                              return metric ? (
                                <div className="pl-9 text-[11px] font-semibold text-ocean-700 mt-1">
                                  {t?.hr && <span className="mr-2">❤️ {t.hr}</span>}
                                  {t?.power && <span className="mr-2">⚡ {t.power}</span>}
                                  {t?.pace && <span className="mr-2">🏃 {t.pace}</span>}
                                  <span className="text-slate-400 font-normal">RPE {t?.rpe}/10</span>
                                </div>
                              ) : null;
                            })()}
                            <div className="mt-1.5 pl-9 flex items-baseline gap-2">
                              <span className="text-lg font-bold tabular-nums">
                                {s.reps
                                  ? `${s.reps} ${es ? "reps" : "reps"}`
                                  : `${Math.floor(s.seconds / 60)}:${String(s.seconds % 60).padStart(2, "0")}`}
                              </span>
                              {!s.reps && (
                                <span className="text-[10px] uppercase tracking-wide text-slate-400">
                                  {es ? "min" : "min"}
                                </span>
                              )}
                            </div>
                            {s.note && (
                              <div className="pl-9 text-[11px] text-slate-600 mt-1 leading-snug">{s.note}</div>
                            )}
                          </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <ol className="space-y-2">
                        {session.prescription.steps.map((s: any, i: number) => (
                          <Fragment key={i}>
                            {s.group && session.prescription.steps[i - 1]?.group !== s.group && (
                              <div className="mt-2 mb-1.5 first:mt-0 rounded-lg bg-ink-900 text-paper px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
                                🔁 {s.group}
                              </div>
                            )}
                          <li
                            className={`rounded-lg p-3 ${s.phase === "active" ? "bg-ocean-50" : "bg-slate-50"}`}
                          >
                            <div className="flex justify-between gap-3">
                              <span>
                                {i + 1}. {s.name}
                              </span>
                              <strong>
                                {s.reps ? `${s.reps} reps` : `${Math.floor(s.seconds / 60)}:${String(s.seconds % 60).padStart(2, "0")}`}
                                {s.target?.type === "open" ? "" : ` · ${s.zone.toUpperCase()}`}
                              </strong>
                            </div>
                            {(() => {
                              const t = s.targets;
                              const metric = t?.hr || t?.pace || t?.power;
                              return metric ? (
                                <div className="text-[11px] font-semibold text-ocean-700 mt-1">
                                  {t?.hr && <span className="mr-2">❤️ {t.hr}</span>}
                                  {t?.power && <span className="mr-2">⚡ {t.power}</span>}
                                  {t?.pace && <span className="mr-2">🏃 {t.pace}</span>}
                                  <span className="text-slate-400 font-normal">RPE {t?.rpe}/10</span>
                                </div>
                              ) : null;
                            })()}
                            {s.note && (
                              <div className="text-[11px] text-slate-500 mt-1 leading-snug">{s.note}</div>
                            )}
                          </li>
                          </Fragment>
                        ))}
                      </ol>
                    )}
                  </div>
                ) : (
                  <div>
                    <p>{es ? "Descanso hoy." : "Rest today."}</p>
                    {/* The full day-off protocol: sleep/journal, fuel,
                        supplementation reminder, visualization routine. */}
                    <div className="mt-3 rounded-xl border border-ocean-200 bg-ocean-50/40 p-4 space-y-2">
                      {(() => {
                        const p = dayOffProtocol(es ? "es" : "en");
                        return (
                          <>
                            <div className="font-display font-bold text-ocean-900">{p.title}</div>
                            {p.essentials.map((e) => (
                              <div key={e.label} className="flex gap-2 text-sm">
                                <span className="text-lg leading-none">{e.icon}</span>
                                <div>
                                  <span className="font-semibold">{e.label}</span>
                                  <span className="text-slate-600"> — {e.detail}</span>
                                </div>
                              </div>
                            ))}
                            <div className="text-sm text-slate-700 border-t border-ocean-200 pt-2">
                              {p.visualizationShort}
                            </div>
                            <details>
                              <summary className="cursor-pointer text-xs font-semibold text-ocean-700">
                                {es ? "Protocolo completo de visualización (8 pasos)" : "Full visualization protocol (8 steps)"}
                              </summary>
                              <ol className="mt-2 space-y-2">
                                {p.visualizationFull.map((v) => (
                                  <li key={v.step} className="text-xs">
                                    <span className="font-bold">{v.step}</span>{" "}
                                    <span className="text-slate-600">{v.text}</span>
                                  </li>
                                ))}
                              </ol>
                            </details>
                            <div className="text-xs italic text-ocean-700 pt-1">{p.closing}</div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
                {session.durationMin > 0 && (
                  <details>
                    <summary className="cursor-pointer font-medium">
                      {es ? "Nutrición y recuperación" : "Fuel and recovery"}
                    </summary>
                    {/* Pre-session fuel — what to eat before you start */}
                    {session.fuel?.preSession?.carbsG > 0 && (
                      <p className="text-sm mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                        🍚 <strong>{es ? "Antes" : "Pre"} ({session.fuel.preSession.timingLabel}):</strong>{" "}
                        {session.fuel.preSession.carbsG} g {es ? "carbohidratos" : "carbs"} — {session.fuel.preSession.note}
                      </p>
                    )}
                    {session.fuel?.carbsPerHourG > 0 || session.fuel?.fluidMlPerHour ? (
                      <>
                        <p className="text-sm mt-3">
                          {session.fuel.carbsPerHourG} g carbs/h ·{" "}
                          {session.fuel.sodiumMgPerHour} mg sodium/h ·{" "}
                          {fmtVolumeDual(session.fuel.fluidMlPerHour, data?.units === "imperial" ? "imperial" : "metric")}/h
                          {session.fuel.fluidSource === "estimated" && (
                            <span className="text-[11px] text-slate-400"> ({es ? "estimado" : "estimated"})</span>
                          )}
                        </p>
                        {/* The scrollable sugar-vs-hours timeline */}
                        <div className="mt-3">
                          <FuelTimeline
                            segments={session.fuel.segments || []}
                            curve={session.fuelCurve || []}
                            carbsPerHourG={session.fuel.carbsPerHourG}
                            fluidMlPerHour={session.fuel.fluidMlPerHour}
                            lang={es ? "es" : "en"}
                          />
                        </div>
                        {session.fuel.segments?.length > 0 && (
                          <ol className="mt-2 space-y-0.5 text-xs text-slate-600">
                            {session.fuel.segments
                              .filter((_: any, i: number) => i % 2 === 0) // every other segment keeps the list readable
                              .map((s: any, i: number) => (
                                <li key={i} className="font-mono">
                                  {Math.floor(s.atMin / 60)}:{String(s.atMin % 60).padStart(2, "0")} — {s.label}
                                </li>
                              ))}
                          </ol>
                        )}
                        {session.fuel.gutNote && (
                          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5 mt-2">
                            🧪 {session.fuel.gutNote}
                          </p>
                        )}
                        <FuelCalculator
                          carbsPerH={session.fuel.carbsPerHourG}
                          sodiumPerH={session.fuel.sodiumMgPerHour}
                          fluidPerH={session.fuel.fluidMlPerHour}
                          es={es}
                        />
                      </>
                    ) : (
                      <p className="text-xs text-slate-400 mt-1">
                        {es
                          ? "Sesión ligera — no necesitas combustible durante el entreno. Hidrátate normalmente."
                          : "Light session — no mid-workout fuel needed. Hydrate normally."}
                      </p>
                    )}
                    {session.post && (
                      <>
                        <p className="text-sm mt-2">
                          <strong>{es ? "Después" : "Post"}:</strong> {session.post.carbsG} g carbs ·{" "}
                          {session.post.proteinG} g protein ({session.post.ratio})
                        </p>
                        {session.post.note && (
                          <p className="text-xs text-slate-500 mt-1">{session.post.note}</p>
                        )}
                        {session.post.examples && (
                          <p className="text-[11px] text-slate-400 mt-0.5">{session.post.examples}</p>
                        )}
                      </>
                    )}
                    <p className="text-sm mt-2">
                      {session.prescription.detail.breathing}
                    </p>
                  </details>
                )}
                <details>
                  <summary className="cursor-pointer font-medium">
                    {es ? "¿Por qué esta sesión?" : "Why this session?"}
                  </summary>
                  <p className="text-sm mt-2">
                    {session.prescription.scaled.reason} ·{" "}
                    {es ? "Plan original" : "Original plan"}:{" "}
                    {session.prescription.scaled.originalMin} min
                  </p>
                  {session.coachNotes && (
                    <p className="text-xs text-slate-500 mt-2">
                      {es
                        ? "Contexto del plan original (la secuencia de arriba es la actual)"
                        : "Original plan context (the sequence above is current)"}
                      : {session.coachNotes}
                    </p>
                  )}
                  {data.checkin && (
                    <button
                      className="btn-secondary mt-3"
                      disabled={busy || offline || session.completed}
                      onClick={() => action("/api/checkin", null, "DELETE")}
                    >
                      {es
                        ? "Deshacer adaptación de hoy"
                        : "Undo today's adaptation"}
                    </button>
                  )}
                </details>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-primary"
                    disabled={busy || offline || session.durationMin === 0}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        const r = await fetch(`/api/workout/garmin-json?sessionId=${session.id}`);
                        if (!r.ok) throw Error((await r.json().catch(() => ({}))).error || "Export failed");
                        await saveBlob(r, "jasmethod-garmin.json");
                        setMessage(
                          es
                            ? "✓ JSON de Garmin descargado — impórtalo en connect.garmin.com → Entrenamiento → Workouts → Importar, y envíalo al reloj. Se abre la guía."
                            : "✓ Garmin JSON downloaded — import at connect.garmin.com → Training → Workouts → Import Workout, then send to device. Opening the guide."
                        );
                        window.open("https://connect.garmin.com/modern/training/workouts", "_blank");
                        await load();
                      } catch (e: any) {
                        setError(e.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Watch className="w-4 h-4" /> {es ? "Enviar a Garmin" : "Send to Garmin"}
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={busy || offline || session.durationMin === 0}
                    onClick={async () => {
                      setBusy(true);
                      setError("");
                      try {
                        const r = await fetch("/api/workout/intervals-push", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ sessionId: session.id }),
                        });
                        const d = await r.json().catch(() => ({}));
                        if (!r.ok) throw Error(d.error || "Push failed");
                        setMessage(
                          d.structured
                            ? es
                              ? "✓ Entrenamiento estructurado publicado en Intervals.icu — se sincroniza a tu Garmin/COROS enlazado."
                              : "✓ Structured workout published to Intervals.icu — it syncs to your linked Garmin/COROS."
                            : es
                              ? "✓ Evento publicado en Intervals.icu con la lista de pasos y combustible (los pasos estructurados de carrera llegarán vía el adaptador de carrera). Verifica la conexión Garmin/COROS en Intervals.icu."
                              : "✓ Event published to Intervals.icu with the step list and fuel (structured running steps arrive via the run adapter). Check your Garmin/COROS link inside Intervals.icu."
                        );
                        await load();
                      } catch (e: any) {
                        setError(e.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {es ? "Enviar a Intervals.icu" : "Send to Intervals.icu"}
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={busy || offline || session.durationMin === 0}
                    onClick={() => sendToWatch()}
                  >
                    {es ? "Compartir .FIT" : "Share .FIT"}
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={busy || offline}
                    onClick={() => setFeedback(!feedback)}
                  >
                    {es ? "Registrar resultado" : "Log workout result"}
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={
                      busy ||
                      offline ||
                      session.completed ||
                      session.durationMin < 20 ||
                      !["run", "bike", "swim"].includes(session.sport) ||
                      session.regenCount >= 3
                    }
                    onClick={() =>
                      action("/api/workout/regenerate", {
                        id: session.id,
                        mode: "variant",
                      })
                    }
                  >
                    {es ? "Otra variante" : "Another variant"} (
                    {Math.max(0, 3 - session.regenCount)})
                  </button>
                </div>
                {/* Platform delivery guide — Garmin / Apple Watch / COROS */}
                <details className="mt-1">
                  <summary className="text-xs font-semibold text-ocean-700 cursor-pointer">
                    📲 {es ? "Exportación y compatibilidad (Garmin · Apple · COROS)" : "Export and compatibility (Garmin · Apple · COROS)"}
                  </summary>
                  <div className="grid sm:grid-cols-3 gap-2 mt-2">
                    {allDeliveryGuides(es ? "es" : "en").map((g) => (
                      <div key={g.platform} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="font-semibold text-sm mb-1.5">
                          {g.platform === "garmin" ? "⌚ Garmin" : g.platform === "apple" ? " Apple Watch" : "⏱ COROS"}
                        </div>
                        <ol className="list-decimal pl-4 space-y-1 text-[11px] text-slate-600">
                          {g.steps.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            </div>
            {feedback && (
              <form
                className="card space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  action(
                    "/api/plan",
                    { sessionId: session.id, ...Object.fromEntries(f) },
                    "PUT",
                  );
                }}
              >
                <h3 className="font-bold">
                  {es ? "¿Cómo fue?" : "How did it go?"}
                </h3>
                <div className="grid sm:grid-cols-3 gap-3">
                  <label>
                    {es ? "Resultado" : "Outcome"}
                    <select
                      name="feedbackStatus"
                      className="input"
                      defaultValue="completed"
                    >
                      <option value="completed">
                        {es ? "Completado" : "Completed"}
                      </option>
                      <option value="partial">
                        {es ? "Parcial" : "Partial"}
                      </option>
                      <option value="skipped">
                        {es ? "Omitido" : "Skipped"}
                      </option>
                    </select>
                  </label>
                  <label>
                    {es ? "Minutos reales" : "Actual minutes"}
                    <input
                      name="actualDurationMin"
                      className="input"
                      type="number"
                      min="0"
                      max="1440"
                      defaultValue={
                        session.actualDurationMin ?? session.durationMin
                      }
                    />
                  </label>
                  <label>
                    {es ? "Esfuerzo 1–10" : "Effort 1–10"}
                    <input
                      name="rpe"
                      className="input"
                      type="number"
                      min="1"
                      max="10"
                      defaultValue={session.rpe ?? ""}
                    />
                  </label>
                </div>
                <textarea
                  aria-label="Workout feedback"
                  name="feedbackNote"
                  className="input"
                  placeholder={
                    es
                      ? "Dificultad, molestias, falta de tiempo…"
                      : "Difficulty, discomfort, time constraints…"
                  }
                />
                <button disabled={busy} className="btn-primary">
                  {es ? "Guardar resultado" : "Save result"}
                </button>
              </form>
            )}
          </>
        )}
        {data?.connectors.length > 0 && (
          <div className="card">
            <Link href="/connectors" className="font-semibold text-ocean-700">
              {es ? "Estado de conexiones" : "Connection status"} →
            </Link>
            {data.connectors.map((c: any) => (
              <p key={c.provider} className="text-xs mt-2">
                {c.provider}: {c.lastError || c.status} ·{" "}
                {es ? "Última sincronización" : "Last sync"}:{" "}
                {c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString() : "—"}
                {c.lastSyncCount != null && c.lastSyncCount > 0 ? ` · ${c.lastSyncCount} records` : ""}
              </p>
            ))}
          </div>
        )}
        {(!data?.connectors || data.connectors.length === 0) && (
          <div className="card border-ocean-300 bg-ocean-50/60 p-4">
            <p className="text-sm font-medium text-ocean-900">
              ⌚ {es
                ? "Conecta un proveedor disponible o registra tus datos sin dispositivo."
                : "Connect an available provider or enter your data without a device."}
            </p>
            <Link href="/connectors" className="btn-primary text-sm mt-2 inline-flex">
              {es ? "Conectar dispositivo →" : "Connect device →"}
            </Link>
          </div>
        )}
        <span id="jasai" className="block scroll-mt-24" />
        <details className="card">
          <summary className="cursor-pointer font-semibold">
            {es ? "Preguntar a KCoach" : "Ask KCoach"}
          </summary>
          <form
            className="flex gap-2 mt-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const r = await fetch("/api/assistant", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ question, externalConsent }),
                });
                const d = await r.json();
                setAnswer(d.answer || d.error);
                setAssistantMode(d.mode || "");
                setAssistantProposal(d.proposal || null);
                setExternalConsent(false);
              } catch {
                setAnswer("Unable to reach the assistant.");
                setAssistantMode(""); setAssistantProposal(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              className="input flex-1"
              maxLength={1000}
              aria-label="Question for coach"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <button disabled={busy || offline} className="btn-primary">
              {es ? "Preguntar" : "Ask"}
            </button>
          </form>
          <label className="flex gap-2 mt-3 text-xs"><input type="checkbox" checked={externalConsent} onChange={e=>setExternalConsent(e.target.checked)}/>{es ? "Enviar solo esta pregunta a Google Gemini, si está habilitado. No incluiré datos importados de proveedores. El contexto guardado no se envía." : "Send only this question to Google Gemini, if enabled. I will not include imported provider data. Saved athlete context is not sent."}</label>
          {assistantMode && <p className="text-xs text-slate-500 mt-2">{assistantMode === "external_manual_question" ? (es ? "Respuesta de IA externa; no es una prescripción revisada." : "External AI response; not a reviewed prescription.") : (es ? "Ayuda local de JMM; no es una respuesta de IA." : "Local JMM guidance; not an AI response.")}</p>}
          {answer && <p className="text-sm mt-3">{answer}</p>}
          {assistantProposal && <div className="mt-3 border rounded-lg p-3 text-sm"><p>{es ? "Interpretación para revisar" : "Interpretation to review"}: {assistantProposal.command.replaceAll("_", " ")}{assistantProposal.value != null ? ` (${assistantProposal.value})` : ""}{assistantProposal.sport ? ` → ${assistantProposal.sport}` : ""}</p><p>{es ? "Ninguna sesión ha cambiado." : "No workout has changed."}</p><Link className="btn-secondary mt-2" href={assistantProposal.editorUrl}>{es ? "Abrir editor para revisar y confirmar" : "Open editor to review and confirm"}</Link></div>}
        </details>
      </div>
    {data?.motivation && <section className="card"><h2 className="font-bold">Your daily coaching cue</h2><p className="text-lg mt-2">{data.motivation.quote}</p><p className="text-sm mt-2">{data.motivation.message}</p><p className="text-xs text-slate-500 mt-2">{data.motivation.source}</p></section>}
      <CoachingConversation />
      </ProtectedPage>
  );
}
function FuelCalculator({ carbsPerH, sodiumPerH, fluidPerH, es }: { carbsPerH: number; sodiumPerH: number; fluidPerH: number; es: boolean }) {
  const h = 1; // default shown on render; DOM updates on change
  const totalCarbs = Math.round(carbsPerH * h);
  const totalSodium = Math.round(sodiumPerH * h);
  const totalFluid = Math.round(fluidPerH * h);
  const iceMl = h >= 1.5 ? 500 : 300;
  const gels = Math.ceil(totalCarbs / 25);
  const bottles = Math.ceil(totalFluid / 500);

  return (
    <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50/70 p-3" id="fuel-calc">
      <div className="text-xs font-semibold text-orange-800 mb-2">
        🔢 {es ? "Calculadora de combustible" : "Fuel calculator"}
      </div>
      <div className="flex items-center gap-2 mb-2">
        <label className="text-xs text-slate-600">{es ? "Horas:" : "Hours:"}</label>
        <input
          className="input !py-1 !px-2 text-sm w-20"
          type="number"
          min="0.5"
          max="12"
          step="0.5"
          defaultValue="1"
          onChange={(e: any) => {
            const v = Math.max(0.5, Math.min(12, parseFloat(e.target.value) || 1));
            const el = e.target.closest("[id=fuel-calc]");
            if (el) {
              const c = el.querySelector("[data-carbs]");
              const n = el.querySelector("[data-sodium]");
              const f = el.querySelector("[data-fluid]");
              const i = el.querySelector("[data-ice]");
              const g = el.querySelector("[data-gels]");
              const b = el.querySelector("[data-bottles]");
              if (c) c.textContent = `${Math.round(carbsPerH * v)}g`;
              if (n) n.textContent = `${Math.round(sodiumPerH * v)}mg`;
              if (f) f.textContent = `${((fluidPerH * v) / 1000).toFixed(1)}L`;
              if (i) i.textContent = `${v >= 1.5 ? 500 : 300}ml`;
              if (g) g.textContent = `${Math.ceil((carbsPerH * v) / 25)} ${es ? "geles" : "gels"}`;
              if (b) b.textContent = `${Math.ceil((fluidPerH * v) / 500)} × 500ml`;
            }
          }}
        />
      </div>
      <div className="grid grid-cols-4 gap-2 text-center">
        <div className="rounded-lg bg-white px-2 py-1.5">
          <div className="text-[10px] text-slate-400 uppercase">Carbs</div>
          <div className="font-bold text-orange-700" data-carbs>{Math.round(carbsPerH)}g</div>
          <div className="text-[9px] text-slate-400" data-gels>{gels} {es ? "geles" : "gels"}</div>
        </div>
        <div className="rounded-lg bg-white px-2 py-1.5">
          <div className="text-[10px] text-slate-400 uppercase">{es ? "Sodio" : "Sodium"}</div>
          <div className="font-bold text-orange-700" data-sodium>{Math.round(sodiumPerH)}mg</div>
          <div className="text-[9px] text-slate-400">{es ? "electrolitos" : "electrolytes"}</div>
        </div>
        <div className="rounded-lg bg-white px-2 py-1.5">
          <div className="text-[10px] text-slate-400 uppercase">{es ? "Líquido" : "Fluid"}</div>
          <div className="font-bold text-sky-700" data-fluid>{(fluidPerH / 1000).toFixed(1)}L</div>
          <div className="text-[9px] text-slate-400" data-bottles>{bottles} × 500ml</div>
        </div>
        <div className="rounded-lg bg-white px-2 py-1.5">
          <div className="text-[10px] text-slate-400 uppercase">{es ? "Hielo" : "Ice"}</div>
          <div className="font-bold text-cyan-700" data-ice>{iceMl}ml</div>
          <div className="text-[9px] text-slate-400">{es ? "pre-entreno" : "pre-workout"}</div>
        </div>
      </div>
      <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">
        🧊 {es
          ? "Bebida helada pre-entreno en calor: baja la temperatura central y retrasa la fatiga. Durante: bebe en intervalos de 15 min."
          : "Pre-workout ice slurry in heat: lowers core temp and delays fatigue. During: drink in 15-min intervals."}
      </p>
    </div>
  );
}
