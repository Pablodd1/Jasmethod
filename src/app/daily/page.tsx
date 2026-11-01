"use client";
import "@/components/daily-training/universal-workout-card.css";
// /daily — the developer-kit daily training screen fed by /api/v1/training/today.
// Distinct visual format (dark, card-numbered guidance) living alongside Today;
// both read the same plan. This page handles loading/empty/error states.
import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/auth";
import { unitsOf } from "@/lib/units";
import { DailyEnvironmentCard } from "@/components/daily-training/DailyEnvironmentCard";
import { DailyTrainingScreen } from "@/components/daily-training/DailyTrainingScreen";
import { readTrainingJson, TrainingReadError } from "@/components/daily-training/training-read";
import { isDailyTraining } from "@/components/daily-training/training-contract";
import type { DailyTraining } from "@/components/daily-training/training-contract";
import "@/components/daily-training/daily-training.css";

type State =
  | { kind: "loading" }
  | { kind: "ready"; plan: DailyTraining }
  | { kind: "empty" | "unauthorized" | "error"; message: string };

async function postEvent(path: string, session: DailyTraining["session"], body: object) {
  const eventId = crypto.randomUUID();
  const response = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Idempotency-Key": eventId },
    body: JSON.stringify({ planRevision: session.revision, expectedRevision: session.sourceRevision, eventId, ...body }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok !== true) throw new Error(data.error || `Save could not be verified (${response.status})`);
}

function DailyTrainingPageContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestSequence = useRef(0);
  const loadController = useRef<AbortController | null>(null);
  const [state, setState] = useState<State>({ kind: "loading" });
  // The URL owns selection across Link navigation, reload and browser history.
  // A useState initializer can retain an earlier /daily record in the router.
  const selected = searchParams.get("sessionId");
  const feedbackFirst = searchParams.get("feedback") === "1";
  function selectSession(id: string) {
    const url = new URL(window.location.href); url.searchParams.set("sessionId", id);
    router.push(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
  }
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const { signal } = controller;
    const sequence = ++requestSequence.current;
    const setCurrentState = (next: State) => { if (sequence === requestSequence.current && !signal.aborted) setState(next); };
    setCurrentState({ kind: "loading" });
    try {
      const json = await readTrainingJson<DailyTraining | null>(`/api/v1/training/today${selected ? `?sessionId=${encodeURIComponent(selected)}` : ""}`, {
        signal,
        label: "Daily training",
        validate: (value): value is DailyTraining | null => isDailyTraining(value) && (!selected || value.session.id === selected),
        emptyValue: null,
      });
      if (json === null) {
        setCurrentState({ kind: "empty", message: "No session is planned for today." });
        return;
      }
      setCurrentState({ kind: "ready", plan: json });
    } catch (e) {
      if (signal.aborted || (e instanceof DOMException && e.name === "AbortError")) return;
      if (e instanceof TrainingReadError && e.status === 401) {
        setCurrentState({ kind: "unauthorized", message: "Sign in to see your training." });
        return;
      }
      setCurrentState({ kind: "error", message: e instanceof Error ? e.message : "Could not load the training plan. Please retry." });
    }
  }, [selected]);
  useEffect(() => {
    void load();
    return () => loadController.current?.abort();
  }, [load]);

  if (state.kind === "ready" && selected && state.plan.session.id !== selected)
    return <main className="jmm-screen" role="status"><p>Loading selected workout… / Cargando la sesión seleccionada…</p></main>;

  const es = state.kind === "ready" ? state.plan.language === "es" : user?.language === "es";
  const displayNavigation = <nav aria-label={es ? "Vista del entrenamiento de hoy" : "Today's training display"} className="mx-auto max-w-[540px] px-4 py-3 flex flex-wrap gap-4 items-center text-sm">
    <Link className="underline font-semibold" href={selected ? `/today?sessionId=${encodeURIComponent(selected)}` : "/today"}>{es ? "Hoy: vista completa" : "Today: full view"}</Link>
    <span aria-current="page">{feedbackFirst ? (es ? "Registrar resultado" : "Log result") : (es ? "Tarjeta del entrenamiento" : "Workout card view")}</span>
    <Link className="underline" href="/coach">J Koach</Link>
    <Link className="underline" href="/calendar">{es ? "Plan y calendario" : "Plan & Calendar"}</Link>
  </nav>;

  if (state.kind !== "ready")
    return (
      <main className="jmm-screen" role={state.kind === "error" ? "alert" : "status"}>
        {displayNavigation}
        <div className="jmm-state">
          <h1>{es ? "Entrenamiento diario" : "Daily training"}</h1>
          <p>
            {state.kind === "loading"
              ? (es ? "Cargando tu plan…" : "Loading your plan…")
              : state.message}
          </p>
          {(state.kind === "error" || state.kind === "empty") && (
            <div className="flex gap-2">
              <button className="jmm-button" onClick={() => void load()}>
                {es ? "Actualizar" : "Refresh"}
              </button>
              <a className="jmm-button" style={{ textDecoration: "none" }} href="/today">
                {es ? "Abrir Hoy" : "Open Today"}
              </a>
            </div>
          )}
          {state.kind === "unauthorized" && (
            <a className="jmm-button" style={{ textDecoration: "none" }} href="/login">
              {es ? "Iniciar sesión" : "Sign in"}
            </a>
          )}
        </div>
      </main>
    );
  const session = state.plan.session;
  return (
    <>
    {displayNavigation}
    {state.plan.sessions && state.plan.sessions.length > 1 && <nav aria-label={es ? "Sesiones de hoy" : "Today's sessions"} className="jmm-screen jmm-session-switcher"><label>{es ? "Elige la sesión de hoy " : "Select today's session "}<select value={session.id} onChange={e => selectSession(e.target.value)}>{state.plan.sessions.map(s => <option key={s.id} value={s.id}>{s.startTime ? `${s.startTime} · ` : ""}{s.title} · {s.sport}</option>)}</select></label></nav>}
    {!feedbackFirst && <div className="mx-auto max-w-[540px] px-4 py-3"><DailyEnvironmentCard key={`environment-${session.id}-${session.sourceRevision}`} sessionId={session.id} dateLocal={session.dateLocal} timezone={session.timezone} startTime={state.plan.sessions?.find(s => s.id === session.id)?.startTime} environment={state.plan.environment} units={unitsOf(user?.profile?.units,user?.language)} es={state.plan.language === "es"} onSaved={() => load()} /></div>}
    <DailyTrainingScreen
      key={`${session.id}-${session.revision}`}
      plan={state.plan}
      feedbackFirst={feedbackFirst}
      onSaved={() => load()}
      onFocusReady={(ready) =>
        postEvent(
          `/api/v1/training/sessions/${encodeURIComponent(session.id)}/focus`,
          session,
          { ready },
        )
      }
      onCompletion={async (actual) => {
        await postEvent(
          `/api/v1/training/sessions/${encodeURIComponent(session.id)}/completion`,
          session,
          { actual },
        );
        await load();
      }}
    />
    </>
  );
}

export default function DailyTrainingPage() {
  return <Suspense fallback={<main className="jmm-screen" role="status"><p>Loading training… / Cargando entrenamiento…</p></main>}><DailyTrainingPageContent /></Suspense>;
}
