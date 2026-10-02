"use client";
// /daily — the developer-kit daily training screen fed by /api/v1/training/today.
// Distinct visual format (dark, card-numbered guidance) living alongside Today;
// both read the same plan. This page handles loading/empty/error states.
import { useEffect, useState, useCallback, useRef } from "react";
import { DailyTrainingScreen } from "@/components/daily-training/DailyTrainingScreen";
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
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `Save failed (${response.status})`); }
}

export default function DailyTrainingPage() {
  const requestSequence = useRef(0);
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("sessionId"));
  useEffect(() => {
    const onHistory = () => setSelected(new URLSearchParams(window.location.search).get("sessionId"));
    window.addEventListener("popstate", onHistory);
    return () => window.removeEventListener("popstate", onHistory);
  }, []);
  function selectSession(id: string) {
    const url = new URL(window.location.href); url.searchParams.set("sessionId", id);
    window.history.pushState({}, "", url); setSelected(id);
  }
  const load = useCallback(async (signal?: AbortSignal) => {
    const sequence = ++requestSequence.current;
    const setCurrentState = (next: State) => { if (sequence === requestSequence.current && !signal?.aborted) setState(next); };
    setCurrentState({ kind: "loading" });
    try {
      const r = await fetch(`/api/v1/training/today${selected ? `?sessionId=${encodeURIComponent(selected)}` : ""}`, {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      if (r.status === 401) {
        setCurrentState({ kind: "unauthorized", message: "Sign in to see your training." });
        return;
      }
      if (r.status === 204) {
        setCurrentState({ kind: "empty", message: "No session is planned for today." });
        return;
      }
      if (!r.ok) { const data = await r.json().catch(() => ({})); throw new Error(data.error || `Load failed (${r.status})`); }
      const json: unknown = await r.json();
      if (!isDailyTraining(json)) throw new Error("Unsupported or incomplete plan response");
      setCurrentState({ kind: "ready", plan: json });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setCurrentState({ kind: "error", message: e instanceof Error ? e.message : "Could not load the training plan. Please retry." });
    }
  }, [selected]);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (state.kind !== "ready")
    return (
      <main className="jmm-screen" role={state.kind === "error" ? "alert" : "status"}>
        <div className="jmm-state">
          <h1>Daily training</h1>
          <p>
            {state.kind === "loading"
              ? "Loading your plan…"
              : state.message}
          </p>
          {(state.kind === "error" || state.kind === "empty") && (
            <div className="flex gap-2">
              <button className="jmm-button" onClick={() => void load()}>
                Refresh
              </button>
              <a className="jmm-button" style={{ textDecoration: "none" }} href="/today">
                Open Today
              </a>
            </div>
          )}
          {state.kind === "unauthorized" && (
            <a className="jmm-button" style={{ textDecoration: "none" }} href="/login">
              Sign in
            </a>
          )}
        </div>
      </main>
    );
  const session = state.plan.session;
  return (
    <>
    {state.plan.sessions && state.plan.sessions.length > 1 && <nav aria-label="Today's sessions" className="jmm-screen jmm-session-switcher"><label>Select today&apos;s session <select value={session.id} onChange={e => selectSession(e.target.value)}>{state.plan.sessions.map(s => <option key={s.id} value={s.id}>{s.startTime ? `${s.startTime} · ` : ""}{s.title} · {s.sport}</option>)}</select></label></nav>}
    <DailyTrainingScreen
      key={`${session.id}-${session.revision}`}
      plan={state.plan}
      onFocusReady={(ready) =>
        postEvent(
          `/api/v1/training/sessions/${encodeURIComponent(session.id)}/focus`,
          session,
          { ready },
        )
      }
      onCompletion={(actual) =>
        postEvent(
          `/api/v1/training/sessions/${encodeURIComponent(session.id)}/completion`,
          session,
          { actual },
        )
      }
    />
    </>
  );
}
