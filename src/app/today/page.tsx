"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ProtectedPage } from "@/components/gate";
import { useAuth } from "@/components/auth";
export default function TodayPage() {
  const { user } = useAuth();
  const es = user?.language === "es";
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [offline, setOffline] = useState(false),
    [selected, setSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState(false),
    [message, setMessage] = useState(""),
    [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState("");
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
  useEffect(() => {
    load();
  }, [load]);
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
  async function download() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/workout/approve?sessionId=${session.id}`, {
        method: "POST",
      });
      if (!r.ok) throw Error((await r.json()).error);
      const blob = await r.blob(),
        url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = "jasmethod-workout.fit";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      await load();
    } catch (e: any) {
      setError(e.message);
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
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                  💧 {es ? "AGUA PRE: 400-600 ml en los 60 min previos (+ pizca de sal en calor)." : "WATER PRE: 400-600 ml in the last 60 min (+ pinch of salt in heat)."}
                </div>
                <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-3 py-2 text-xs text-fuchsia-900">
                  🧠 {es ? "VISUALIZACIÓN (2 min, sin teléfono)" : "VISUALIZATION (2 min, phone away)"} — {es
                    ? "cierra los ojos, véete ejecutando la secuencia de abajo: el lugar, el ritmo, la respiración en el esfuerzo. El scrolling roba las catecholaminas que el entreno necesita (Liu 2025)."
                    : "close your eyes, see yourself executing the sequence below: the place, the rhythm, your breathing at effort. Scrolling steals the catecholamines training needs (Liu 2025)."}
                </div>
                {session.prescription.steps.length ? (
                  <ol className="space-y-2">
                    {session.prescription.steps.map((s: any, i: number) => (
                      <li
                        key={i}
                        className={`flex justify-between gap-3 rounded-lg p-3 ${s.phase === "active" ? "bg-ocean-50" : "bg-slate-50"}`}
                      >
                        <span>
                          {i + 1}. {s.name}
                        </span>
                        <strong>
                          {s.reps ? `${s.reps} reps` : `${Math.floor(s.seconds / 60)}:${String(s.seconds % 60).padStart(2, "0")}`}
                          {s.target?.type === "open" ? "" : ` · ${s.zone.toUpperCase()}`}
                        </strong>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>
                    {es
                      ? "Descanso hoy. No hay intervalos ni exportación al reloj."
                      : "Rest today. No intervals or watch workout are prescribed."}
                  </p>
                )}
                {session.durationMin > 0 && (
                  <details>
                    <summary className="cursor-pointer font-medium">
                      {es ? "Nutrición y recuperación" : "Fuel and recovery"}
                    </summary>
                    <p className="text-sm mt-3">
                      {session.fuel.carbsPerHourG} g carbs/h ·{" "}
                      {session.fuel.sodiumMgPerHour} mg sodium/h ·{" "}
                      {session.fuel.fluidMlPerHour} ml/h
                    </p>
                    <FuelCalculator
                      carbsPerH={session.fuel.carbsPerHourG}
                      sodiumPerH={session.fuel.sodiumMgPerHour}
                      fluidPerH={session.fuel.fluidMlPerHour}
                      es={es}
                    />
                    {session.post && (
                      <p className="text-sm mt-2">
                        Post: {session.post.carbsG} g carbs ·{" "}
                        {session.post.proteinG} g protein
                      </p>
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
                    onClick={download}
                  >
                    {es ? "Descargar FIT" : "Download FIT"}
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
                <p className="text-xs text-slate-500">
                  {es
                    ? "FIT descarga un archivo; impórtalo a un dispositivo compatible."
                    : "FIT downloads a file; import it into a compatible device. It does not send directly to your watch."}
                </p>
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
              </p>
            ))}
          </div>
        )}
        <details className="card">
          <summary className="cursor-pointer font-semibold">
            {es ? "Preguntar a JASAI" : "Ask JASAI"}
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
                  body: JSON.stringify({ question }),
                });
                const d = await r.json();
                setAnswer(d.answer || d.error);
              } catch {
                setAnswer("Unable to reach the assistant.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              className="input flex-1"
              aria-label="Question for coach"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
            <button disabled={busy || offline} className="btn-primary">
              {es ? "Preguntar" : "Ask"}
            </button>
          </form>
          {answer && <p className="text-sm mt-3">{answer}</p>}
        </details>
      </div>
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
