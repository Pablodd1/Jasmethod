"use client";
import React, { useState } from "react";
import type { UniversalWorkoutCard } from "@/lib/universal-workout-card";
import { AthleteMetricInput } from "@/components/AthleteMetricInput";
export function WorkoutEditor({
  card,
  onSaved,
}: {
  card: UniversalWorkoutCard;
  onSaved: () => void | Promise<void>;
}) {
  const es = card.language === "es",
    s = card.session;
  const imperial = card.units === "imperial";
  const [steps, setSteps] = useState(
    s.steps.map((st) => ({
      name: st.name,
      phase: st.phase,
      zone: st.zone,
      seconds: st.seconds,
      group: st.group,
      note: st.note,
      targetWasExplicit: st.target.source === "explicit",
      targetEdited: false,
      target:
        st.target.type === "open"
          ? {
              type: "open",
              low: undefined as number | undefined,
              high: undefined as number | undefined,
            }
          : { type: st.target.type, low: st.target.low, high: st.target.high },
    })),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const timed = s.steps.every((st) => st.endpoint.type === "time");
  if (!["run", "bike"].includes(s.sport) || !timed) return null;
  return (
    <details>
      <summary>
        {es ? "Editar pasos y objetivos" : "Edit steps & targets"}
      </summary>
      <p>
        {es
          ? "Guardar recalcula el tiempo, genera una revisión nueva y elimina la aprobación anterior. Siguen vigentes los límites del check-in."
          : "Saving recalculates time, creates a new revision and clears previous approval. Current check-in limits still apply."}
      </p>
      <p>
        {es ? "Total" : "Total"}:{" "}
        {Number(
          (steps.reduce((sum, st) => sum + st.seconds, 0) / 60).toFixed(2),
        )}{" "}
        min
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const r = await fetch(`/api/workout/card?athleteId=${encodeURIComponent(s.athleteId)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: s.id,
                expectedRevision: s.revision,
                action: "restore",
              }),
            });
            const d = await r.json();
            if (!r.ok) throw Error(d.error || "Restore failed");
            await onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {es
          ? "Restaurar pasos antes de la última edición"
          : "Restore steps before last edit"}
      </button>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy) return;
          setBusy(true);
          setError("");
          try {
            const r = await fetch(`/api/workout/card?athleteId=${encodeURIComponent(s.athleteId)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: s.id,
                expectedRevision: s.revision,
                steps: steps.map(
                  ({ targetWasExplicit, targetEdited, target, ...step }) => ({
                    ...step,
                    ...(targetWasExplicit || targetEdited ? { target } : {}),
                  }),
                ),
              }),
            });
            const d = await r.json();
            if (!r.ok) throw Error(d.error || "Save failed");
            await onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {steps.map((st, i) => (
          <fieldset key={i}>
            <legend>
              {i + 1}. {st.name}
            </legend>
            <label>
              {es ? "Duración (min o m:ss)" : "Duration (min or m:ss)"}
              <AthleteMetricInput
                es={es} min={1} max={86400}
                required
                value={st.seconds}
                onChange={(value) =>
                  setSteps((all) =>
                    all.map((v, j) =>
                      j === i ? { ...v, seconds: value === "" ? NaN : Number(value) } : v,
                    ),
                  )
                }
              />
            </label>
            <label>
              {es ? "Zona" : "Zone"}
              <select
                value={st.zone}
                onChange={(e) =>
                  setSteps((all) =>
                    all.map((v, j) =>
                      j === i ? { ...v, zone: e.target.value } : v,
                    ),
                  )
                }
              >
                {Array.from({ length: 7 }, (_, j) => (
                  <option key={j}>z{j + 1}</option>
                ))}
              </select>
            </label>
            <label>
              {es ? "Objetivo y unidad" : "Target & unit"}
              <select
                value={st.target.type}
                onChange={(e) =>
                  setSteps((all) =>
                    all.map((v, j) =>
                      j === i
                        ? {
                            ...v,
                            targetEdited: true,
                            target: {
                              type: e.target.value,
                              low: undefined,
                              high: undefined,
                            },
                          }
                        : v,
                    ),
                  )
                }
              >
                <option value="open">
                  {es ? "Esfuerzo libre" : "Open effort"}
                </option>
                <option value="pace">min:sec/{imperial ? "mi" : "km"}</option>
                <option value="power">W</option>
                <option value="heartRate">bpm</option>
                <option value="speed">{imperial ? "mph" : "km/h"}</option>
              </select>
            </label>
            {st.target.type !== "open" &&
              (["low", "high"] as const).map((bound) => (
                <label key={bound}>
                  {st.target.type === "pace" ? (bound === "low" ? es ? "Ritmo más rápido" : "Faster pace" : es ? "Ritmo más lento" : "Slower pace") : bound === "low"
                    ? es
                      ? "Mínimo"
                      : "Minimum"
                    : es
                      ? "Máximo"
                      : "Maximum"}
                  <AthleteMetricInput
                    es={es} clock={st.target.type === "pace"} min={0.001} max={st.target.type === "pace" ? 3600 : 2000}
                    factor={st.target.type === "pace" ? (imperial ? 1.609344 : 1) : st.target.type === "speed" ? (imperial ? 2.2369362921 : 3.6) : 1}
                    required
                    value={st.target[bound] ?? ""}
                    onChange={(value) =>
                      setSteps((all) =>
                        all.map((v, j) =>
                          j === i
                            ? {
                                ...v,
                                targetEdited: true,
                                target: {
                                  ...v.target,
                                  [bound]:
                                    value === ""
                                      ? undefined
                                      : Number(value),
                                },
                              }
                            : v,
                        ),
                      )
                    }
                  />
                </label>
              ))}
            <button
              type="button"
              disabled={steps.length >= 50 || busy}
              onClick={() =>
                setSteps((all) => [
                  ...all.slice(0, i + 1),
                  { ...st, target: { ...st.target } },
                  ...all.slice(i + 1),
                ])
              }
            >
              {es ? "Duplicar paso" : "Duplicate step"}
            </button>
            <button
              type="button"
              disabled={steps.length <= 1 || busy}
              onClick={() => setSteps((all) => all.filter((_, j) => j !== i))}
            >
              {es ? "Eliminar paso" : "Remove step"}
            </button>
          </fieldset>
        ))}
        {error && <p role="alert">{error}</p>}
        <button disabled={busy || s.verdict !== "ready"}>
          {busy
            ? es
              ? "Guardando…"
              : "Saving…"
            : es
              ? "Guardar revisión"
              : "Save revision"}
        </button>
      </form>
      <a href="/training">
        {es
          ? "Cambiar horario y duración del plan"
          : "Change schedule & plan duration"}
      </a>
      <a href="/nutrition">
        {es
          ? "Revisar alimentación y tolerancia"
          : "Review fueling & tolerance"}
      </a>
    </details>
  );
}
