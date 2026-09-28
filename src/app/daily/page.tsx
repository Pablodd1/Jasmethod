"use client";
// /daily — the developer-kit daily training screen fed by /api/v1/training/today.
// Distinct visual format (dark, card-numbered guidance) living alongside Today;
// both read the same plan. This page handles loading/empty/error states.
import { useEffect, useState, useCallback } from "react";
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
    body: JSON.stringify({ planRevision: session.revision, eventId, ...body }),
  });
  if (!response.ok) throw new Error(`Save failed (${response.status})`);
}

export default function DailyTrainingPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ kind: "loading" });
    try {
      const r = await fetch("/api/v1/training/today", {
        credentials: "include",
        cache: "no-store",
        signal,
      });
      if (r.status === 401) {
        setState({ kind: "unauthorized", message: "Sign in to see your training." });
        return;
      }
      if (r.status === 204 || r.status === 404) {
        setState({ kind: "empty", message: "No session is planned for today." });
        return;
      }
      if (!r.ok) throw new Error(`Load failed (${r.status})`);
      const json: unknown = await r.json();
      if (!isDailyTraining(json)) throw new Error("Unsupported or incomplete plan response");
      setState({ kind: "ready", plan: json });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setState({ kind: "error", message: "Could not load the training plan. Please retry." });
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  if (state.kind !== "ready")
    return (
      <main className="jmm-screen" role="status">
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
  );
}
