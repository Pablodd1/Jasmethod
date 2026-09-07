"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "./auth";
import { ProtectedPage } from "./gate";
import {
  TRAINING_PROTOCOLS,
  PROTOCOL_SOURCES,
  PROTOCOL_RULES,
  PROTOCOL_VERSION,
} from "@/lib/protocols";

export default function ProtocolWorkspace({
  athleteId,
}: {
  athleteId?: string;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [protocolId, setProtocolId] = useState("aerobic-base");
  const [sessionId, setSessionId] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const path = `/api/protocols${athleteId ? `?athleteId=${encodeURIComponent(athleteId)}` : ""}`;
  const protocol = TRAINING_PROTOCOLS.find((p) => p.id === protocolId)!;
  const compatible = (data?.sessions || []).filter((s: any) =>
    protocol.sports.includes(s.sport),
  );

  async function load() {
    const r = await fetch(path, { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw Error(d.error || "Could not load training protocols.");
    setData(d);
  }
  useEffect(() => {
    setData(null);
    setPreview(null);
    setSessionId("");
    setError("");
    if (user) load().catch((e) => setError(e.message));
  }, [user, path]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(mode: "preview" | "apply") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          protocolId,
          sessionId,
          previewToken: preview?.previewToken,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error || "Could not prepare this protocol.");
      if (mode === "preview") setPreview(d);
      else {
        setPreview(null);
        setMessage(d.message);
        await load();
      }
    } catch (e: any) {
      setError(e.message);
      if (mode === "apply") setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  function downloadReference() {
    const content = {
      version: PROTOCOL_VERSION,
      reviewedOn: PROTOCOL_VERSION,
      scope:
        "JMM starting prescriptions for healthy adults. Research-informed coaching rules; not individual medical care or a model fine-tuning dataset.",
      protocols: TRAINING_PROTOCOLS,
      rules: PROTOCOL_RULES,
      sources: PROTOCOL_SOURCES,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(content, null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `jmm-training-protocols-${PROTOCOL_VERSION}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <ProtectedPage>
      <div className="space-y-6 max-w-6xl mx-auto">
        <Link
          href={
            athleteId
              ? `/admin/athletes/${encodeURIComponent(athleteId)}`
              : "/training"
          }
          className="text-ocean-700 text-sm"
        >
          ← Back to training
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-ocean-600">
              Coaching library · reviewed {PROTOCOL_VERSION}
            </p>
            <h1 className="font-display text-3xl font-bold mt-2">
              Training protocols
            </h1>
            <p className="text-slate-600 mt-2 max-w-2xl">
              Choose the adaptation, review its dose, then fit it into an
              upcoming session.
            </p>
          </div>
          <button className="btn-secondary" onClick={downloadReference}>
            Download coaching reference
          </button>
        </div>
        {error && (
          <p role="alert" className="card border-red-200 text-red-700">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="card border-green-200 text-green-800">
            {message}{" "}
            <Link
              href={
                athleteId
                  ? `/admin/athletes/${encodeURIComponent(athleteId)}`
                  : "/training"
              }
              className="underline"
            >
              View training
            </Link>
          </p>
        )}
        {data ? (
          <div className="card bg-ocean-50 border-ocean-200">
            <p className="font-semibold">Training for {data.athlete.name}</p>
            <p className="text-sm text-slate-600">
              {data.athlete.experience} · Goal: {data.athlete.goal || "not set"}{" "}
              · {data.athlete.timezone}
            </p>
            {data.athlete.injured && (
              <p className="text-red-700 mt-2">
                Injury flag active: review recovery before assigning training.
              </p>
            )}
          </div>
        ) : (
          !error && <p>Loading athlete and upcoming sessions…</p>
        )}
        <div className="grid lg:grid-cols-[240px_1fr] gap-5">
          <nav
            aria-label="Protocol types"
            className="grid grid-cols-2 lg:flex lg:flex-col gap-2 content-start"
          >
            {TRAINING_PROTOCOLS.map((p) => (
              <button
                key={p.id}
                aria-pressed={p.id === protocolId}
                className={`${p.id === protocolId ? "bg-ocean-700 text-white" : "bg-white border border-slate-200 text-slate-700"} rounded-xl px-4 py-3 text-left text-sm font-semibold disabled:opacity-50`}
                disabled={busy}
                onClick={() => {
                  setProtocolId(p.id);
                  setPreview(null);
                  setSessionId("");
                  setError("");
                }}
              >
                {p.title}
              </button>
            ))}
          </nav>
          <div className="space-y-5">
            <article className="card space-y-4">
              <div>
                <h2 className="font-display text-2xl font-bold">
                  {protocol.title}
                </h2>
                <p className="text-slate-600 mt-1">{protocol.purpose}</p>
              </div>
              <p className="rounded-xl bg-ocean-50 p-4 font-medium">
                {protocol.dose}
              </p>
              <dl className="grid sm:grid-cols-2 gap-4 text-sm">
                {[
                  ["Frequency", protocol.frequency],
                  ["Progression", protocol.progression],
                  ["When to stop or reduce", protocol.stop],
                  ["What to measure", protocol.measure],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="font-semibold text-ocean-800">{label}</dt>
                    <dd className="mt-1 text-slate-600">{value}</dd>
                  </div>
                ))}
              </dl>
              <details>
                <summary className="cursor-pointer text-sm font-semibold">
                  Evidence and limitations
                </summary>
                <p className="text-xs text-slate-500 mt-3">
                  These are JMM starting templates for healthy adults, adapted
                  from research and Galpin's teaching. The exact combined dose
                  is a coaching choice, not a universally validated optimum.
                </p>
                <ul className="mt-3 space-y-2 text-sm">
                  {protocol.sources.map((id) => (
                    <li key={id}>
                      <a
                        className="text-ocean-700 underline"
                        href={PROTOCOL_SOURCES[id].url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {PROTOCOL_SOURCES[id].title}
                      </a>
                      <span className="text-xs text-slate-500 block">
                        {PROTOCOL_SOURCES[id].kind}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </article>
            <section
              className="card space-y-4"
              aria-labelledby="apply-protocol-heading"
            >
              <div>
                <h2
                  id="apply-protocol-heading"
                  className="font-display text-xl font-bold"
                >
                  Fit this into the plan
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Select the workout to replace. The preview fits complete sets
                  and recovery into its existing time budget. Logged results
                  remain in history.
                </p>
              </div>
              <label className="block text-sm font-medium">
                Upcoming {protocol.sports.join(" / ")} session
                <select
                  className="input mt-2"
                  aria-label="Upcoming session"
                  value={sessionId}
                  disabled={busy || !data}
                  onChange={(e) => {
                    setSessionId(e.target.value);
                    setPreview(null);
                    setError("");
                  }}
                >
                  <option value="">Select a session</option>
                  {compatible.map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.date} · {s.title} · {s.durationMin} min
                    </option>
                  ))}
                </select>
              </label>
              {data && !compatible.length && (
                <p className="text-sm text-slate-600">
                  No compatible unfinished session in the next 8 weeks. Set up
                  or edit the athlete's plan first.
                </p>
              )}
              <button
                className="btn-primary"
                disabled={busy || !sessionId || data?.athlete.injured}
                onClick={() => submit("preview")}
              >
                {busy ? "Preparing…" : "Preview protocol"}
              </button>
              {preview && (
                <div className="border-t border-slate-200 pt-4 space-y-4">
                  <p className="font-semibold">
                    {preview.athlete.name} · {preview.session.date} ·{" "}
                    {preview.preview.durationMin} min
                  </p>
                  <p className="text-sm">
                    Replaces “{preview.session.title}” (
                    {preview.session.minutes} min).{" "}
                    {preview.preview.scaled.reason}
                  </p>
                  <p className="text-sm text-ocean-800">
                    {preview.preview.targets.effort}
                  </p>
                  <ol className="space-y-2 text-sm">
                    {preview.preview.steps.map((s: any, i: number) => (
                      <li
                        key={i}
                        className="flex justify-between gap-3 bg-slate-50 rounded-lg p-3"
                      >
                        <span>
                          {i + 1}. {s.name}
                        </span>
                        <strong className="shrink-0">
                          {s.reps
                            ? `${s.reps} reps`
                            : `${Math.floor(s.seconds / 60)}:${String(s.seconds % 60).padStart(2, "0")}`}
                        </strong>
                      </li>
                    ))}
                  </ol>
                  {preview.warnings.map((w: string) => (
                    <p
                      key={w}
                      className="text-sm text-amber-800 bg-amber-50 p-3 rounded-lg"
                    >
                      {w}
                    </p>
                  ))}
                  {preview.blocks.map((b: string) => (
                    <p key={b} role="alert" className="text-sm text-red-700">
                      {b}
                    </p>
                  ))}
                  <button
                    className="btn-primary"
                    disabled={busy || preview.blocks.length > 0}
                    onClick={() => submit("apply")}
                  >
                    Apply to this session
                  </button>
                </div>
              )}
            </section>
          </div>
        </div>
        <details className="card">
          <summary className="cursor-pointer font-semibold">
            How to combine the protocols
          </summary>
          <ul className="list-disc pl-5 mt-4 space-y-3 text-sm text-slate-600">
            {PROTOCOL_RULES.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
          <p className="text-xs mt-4">
            Additional evidence:{" "}
            {["concurrent", "taper", "hrv", "hydration"].map((key) => {
              const source =
                PROTOCOL_SOURCES[key as keyof typeof PROTOCOL_SOURCES];
              return (
                <a
                  key={key}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-ocean-700 mr-3"
                >
                  {source.title}
                </a>
              );
            })}
          </p>
        </details>
      </div>
    </ProtectedPage>
  );
}
