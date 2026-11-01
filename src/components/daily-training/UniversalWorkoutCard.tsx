"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  endpointText,
  isUniversalWorkoutCard,
  stepColor,
  type UniversalWorkoutCard as Card,
} from "@/lib/universal-workout-card";
import { readTrainingJson } from "./training-read";
import { readinessReasonText } from "./readiness-copy";
import type { CanonicalStep } from "@/lib/canonical-session";
import { FitDownloadActions } from "./FitDownloadActions";
import { WorkoutEditor } from "./WorkoutEditor";
import { IntervalCoachEditor } from "./IntervalCoachEditor";
import { StructuredSportEditor } from "@/components/StructuredSportEditor";
import { additionalStepInstruction, stepExecutionGuide } from "@/lib/workout-execution-guide";
import { plannedWorkLabel, targetSpeedLabel, targetReferenceSource } from "@/lib/session-metrics";

type Mode = "zone" | "RPE" | "heartRate" | "pace" | "power";
const n = (s: CanonicalStep, mode: Mode): number | null =>
  mode === "zone"
    ? Number(s.zone.slice(1))
    : mode === "RPE"
      ? Number(/RPE (\d+)\/10/.exec(s.target.label)?.[1] || [0, 2, 3, 5, 7, 8, 9, 10][Number(s.zone.slice(1))]) || null
      : s.target.type === mode
        ? (s.target.high ?? null)
        : null;

export function WorkoutHeader({ card, compactReadiness = false }: { card: Card; compactReadiness?: boolean }) {
  const s = card.session,
    es = card.language === "es";
  return (
    <header className={`uwc-header ${s.verdict === "ready" ? "uwc-header-ready" : ""}`}>
      <div>
        <p>
          {s.sport.toUpperCase()} · {s.dateLocal} · {s.timezone}
        </p>
        <h1>{s.title}</h1>
        {compactReadiness && s.verdict === "blocked" ? <details className="text-sm"><summary>{es ? "Adaptación diaria sin revisar" : "Daily adaptation not reviewed"}</summary><p>{readinessReasonText(s.reason, es)}</p></details> : <p>{s.verdict === "ready" ? card.content.summary : readinessReasonText(s.reason, es)}</p>}
      </div>
      <div className="uwc-stats">
        <b>
          {s.verdict === "blocked" ? "—" : <>
            {s.exactTimeSeconds === null && s.durationMin > 0 ? "~" : ""}
            {endpointText({ endpoint: { type: "time", seconds: s.exactTimeSeconds ?? s.durationMin * 60 } }, card.language)}
          </>}
          <small>{s.verdict === "blocked" ? (es ? "DURACIÓN · EN ESPERA" : "DURATION · ON HOLD") : (es ? "DURACIÓN" : "DURATION")}</small>
        </b>
        <b>
          {s.verdict === "ready"
            ? es
              ? "LISTO"
              : "READY"
            : s.verdict === "rest"
              ? es
                ? "DESCANSO"
                : "REST"
              : es
                ? "REVISAR"
                : "REVIEW"}
          <small>{es ? "ESTADO" : "STATUS"}</small>
        </b>
      </div>
    </header>
  );
}

export function WorkoutIntensityTimeline({ card }: { card: Card }) {
  const { session: s } = card,
    es = card.language === "es";
  const [mode, setMode] = useState<Mode>(() => {
    const target = s.steps.find(st => ["power", "heartRate", "pace"].includes(st.target.type))?.target.type;
    return target === "power" || target === "heartRate" || target === "pace" ? target : "RPE";
  }),
    [selected, setSelected] = useState<number | null>(0),
    [zoom, setZoom] = useState(1);
  const [elapsed, setElapsed] = useState(0),
    [running, setRunning] = useState(false);
  const started = useRef(0),
    offset = useRef(0);
  const timed =
    !!s.exactTimeSeconds && s.steps.every((st) => st.endpoint.type === "time");
  useEffect(() => {
    if (!running) return;
    started.current = Date.now();
    const id = setInterval(
      () => setElapsed(offset.current + (Date.now() - started.current) / 1000),
      250,
    );
    return () => clearInterval(id);
  }, [running]);
  useEffect(() => {
    if (timed && elapsed >= s.exactTimeSeconds!) {
      offset.current = s.exactTimeSeconds!;
      setRunning(false);
    }
  }, [elapsed, timed, s.exactTimeSeconds]);
  let cursor = 0;
  const active = timed
    ? s.steps.findIndex((st) => {
        const from = cursor;
        cursor += st.seconds;
        return elapsed >= from && elapsed < cursor;
      })
    : selected ?? 0;
  const values = s.steps.map((st) => n(st, mode)),
    max = Math.max(1, ...values.filter((v): v is number => v !== null));
  const width = 900,
    height = 190,
    total = s.exactTimeSeconds || s.steps.length;
  let x = 0;
  const bars = s.steps.map((st, i) => {
    const w = (width * (timed ? st.seconds : 1)) / total,
      value = values[i];
    const h =
      value === null
        ? 20
        : mode === "pace"
          ? Math.max(24, 130 * (1 - value / (max * 1.15)))
          : 24 + (106 * value) / max;
    const left = x;
    x += w;
    return { st, i, x: left, w, h, value };
  });
  const step = selected === null ? undefined : s.steps[selected];
  if (!s.steps.length) return null;
  return (
    <section className="uwc-section">
      <h2>
        <span>01</span>
        {es ? "LA SECUENCIA" : "THE FLOW"}
      </h2>
      <p className="uwc-muted">
        {timed
          ? es
            ? "Anchura = tiempo prescrito."
            : "Width = prescribed time."
          : es
            ? "Pasos de anchura igual: no representan tiempo estimado."
            : "Equal-width steps: no estimated time is presented as exact."}{" "}
        {es
          ? "Altura = objetivo; no medición."
          : "Height = target; not measured."}
      </p>
      <div className="uwc-chart-scroll">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: `${zoom * 100}%`, minWidth: 280 }}
          role="group"
          aria-label={es ? "Pasos del entrenamiento" : "Workout steps"}
        >
          {bars.map(({ st, i, x, w, h, value }) => (
            <g
              key={i}
              role="button"
              tabIndex={0}
              aria-label={`${i + 1}. ${st.name}: ${endpointText(st, card.language)}, ${st.target.label}`}
              aria-pressed={selected === i}
              onClick={() => setSelected(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(i);
                }
              }}
            >
              <title>{`${st.name} · ${endpointText(st, card.language)} · ${st.target.label}`}</title>
              <rect
                x={x}
                y={140 - h}
                width={w}
                height={h}
                fill={value === null ? "#56636b" : stepColor(st)}
                stroke={
                  i === active && (running || elapsed > 0)
                    ? "#fff"
                    : selected === i
                      ? "#f7c84a"
                      : "#080f13"
                }
                strokeWidth={selected === i ? 3 : 1}
              />
              {w >= 85 && <text x={x + w / 2} y={160} textAnchor="middle" fill="#ecf3f5" fontSize="12">{mode === "zone" ? st.zone.toUpperCase() : mode === "RPE" ? `RPE ${value ?? "—"}` : value === null ? "—" : st.target.label.split(" (")[0].slice(0, 24)}</text>}
              {w >= 20 && <text
                x={x + w / 2}
                y={182}
                textAnchor="middle"
                fill="#ecf3f5"
                fontSize="13"
              >
                {i + 1}
              </text>}
            </g>
          ))}
        </svg>
      </div>
      {step && (
        <div className="uwc-selected" aria-live="polite">
          <b>
            {(selected ?? 0) + 1}. {step.componentSport ? `${step.componentSport.toUpperCase()} · ` : ""}{step.name} · {endpointText(step, card.language)}
          </b>
          <p>{step.target.label}</p>
          <p>{step.target.label.includes("RPE") ? step.zone.toUpperCase() : `${stepExecutionGuide(step, s.sport, es).effort} · ${step.zone.toUpperCase()}`}</p>
          <p>{stepExecutionGuide(step, s.sport, es).phase}</p>
          {additionalStepInstruction(card.content.steps[selected ?? 0] || "") && <p>{additionalStepInstruction(card.content.steps[selected ?? 0] || "")}</p>}
          {step.note && <p>{step.note}</p>}
          {values[selected ?? 0] === null && (
            <p>
              {es
                ? "Este paso no tiene ese objetivo."
                : "This step has no target for this view."}
            </p>
          )}
        </div>
      )}
      <details className="uwc-guide uwc-no-print"><summary>{es ? "Seguir entrenamiento · guía local" : "Follow workout · local guide"}</summary>
      <details className="uwc-chart-options"><summary>{es ? "Objetivos y ampliar" : "Targets & zoom"}</summary>
      <div
        className="uwc-controls"
        role="group"
        aria-label={es ? "Vista de intensidad" : "Intensity view"}
      >
        {(["zone", "RPE", "heartRate", "pace", "power"] as Mode[]).map((v) => (
          <button
            key={v}
            disabled={v !== "zone" && !s.steps.some((st) => n(st, v) !== null)}
            aria-pressed={mode === v}
            onClick={() => setMode(v)}
          >
            {
              {
                zone: es ? "Zona" : "Zone",
                heartRate: es ? "FC" : "HR",
                pace: es ? "Ritmo" : "Pace",
                power: es ? "Potencia" : "Power",
                RPE: "RPE",
              }[v]
            }
          </button>
        ))}
        <label>
          {es ? "Ampliar" : "Zoom"}
          <input
            aria-label={es ? "Ampliar gráfico" : "Chart zoom"}
            type="range"
            min="1"
            max="4"
            step=".5"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
      </div>
      </details>

      <div className="uwc-controls">
        <button
          disabled={s.verdict !== "ready"}
          onClick={() => {
            if (running) {
              offset.current = elapsed;
              setRunning(false);
            } else {
              if (elapsed >= total && timed) {
                offset.current = 0;
                setElapsed(0);
              }
              setRunning(true);
            }
          }}
        >
          {running
            ? es
              ? "Pausar"
              : "Pause"
            : es
              ? "Iniciar guía local"
              : "Start local guide"}
        </button>
        <button
          onClick={() => {
            setRunning(false);
            offset.current = 0;
            setElapsed(0);
          }}
        >
          {es ? "Reiniciar" : "Reset"}
        </button>
        <output>
          {timed
            ? `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, "0")} · ${es ? "paso" : "step"} ${Math.max(1, active + 1)}/${s.steps.length}`
            : es
              ? "Avanza los pasos manualmente"
              : "Advance steps manually"}
        </output>
        {!timed && (
          <button
            onClick={() =>
              setSelected((i) => Math.min(s.steps.length - 1, (i ?? -1) + 1))
            }
          >
            {es ? "Siguiente paso" : "Next step"}
          </button>
        )}
      </div>
      <small>
        {es
          ? "Guía local solamente; no registra ejecución ni confirma recepción en el reloj."
          : "Local guide only; does not log execution or confirm watch receipt."}
      </small>
      </details>
    </section>
  );
}

export function WorkoutIntervalDetails({ card }: { card: Card }) {
  const es = card.language === "es";
  const work = plannedWorkLabel(card.session.steps, card.session.sport, es);
  const groups: { title: string; start: number; steps: CanonicalStep[] }[] = [];
  card.session.steps.forEach((step, index) => {
    const title = step.group || step.name;
    const previous = groups.at(-1);
    if (previous?.title === title && step.group && previous.steps.at(-1)?.componentSport === step.componentSport) previous.steps.push(step);
    else groups.push({ title, start: index, steps: [step] });
  });
  return (
    <section className="uwc-section">
      <h2>
        <span>02</span>
        {es ? "LOS DETALLES" : "THE DETAILS"}
      </h2>
      {work && <p className="uwc-mechanical-work"><strong>{work}</strong><br /><small>{es ? "Rango calculado con potencia y tiempo previstos; no es trabajo medido ni calorías de alimentación." : "Calculated from planned power and time; not measured work or fueling calories."}</small></p>}
      {[...new Set(card.session.steps.map(step => stepExecutionGuide(step, card.session.sport, es).technique))].map(text => <p key={text} className="uwc-execution-overview">{text}</p>)}
      <div className="uwc-step-grid">
        {groups.map((group, i) => {
          const timed = group.steps.every((st) => st.endpoint.type === "time");
          const workSteps = group.steps.filter(st => st.phase === "active");
          const recoverySteps = group.steps.filter(st => st.phase === "recovery");
          const repeatLabel = (steps: CanonicalStep[], fallback: string) => steps.length && steps.every(st => endpointText(st, card.language) === endpointText(steps[0], card.language) && st.zone === steps[0].zone && st.target.label === steps[0].target.label)
            ? `${steps.length} × ${endpointText(steps[0], card.language)} · ${steps[0].zone.toUpperCase()}`
            : `${steps.length} ${fallback}`;
          const detail = group.steps.map((step, index) => (
            <div key={index}>
              <b>
                {endpointText(step, card.language)} · {step.name}
              </b>
              <p>
                {step.target.label}
              </p>
              {additionalStepInstruction(card.content.steps[group.start + index] || "") && <p>{additionalStepInstruction(card.content.steps[group.start + index] || "")}</p>}
              {step.note && <p>{step.note}</p>}
            </div>
          ));
          const first = group.steps[0];
          const guide = stepExecutionGuide(first, card.session.sport, es);
          return (
            <article
              key={i}
              style={{ borderTopColor: stepColor(group.steps[0]) }}
            >
              <small>{String(i + 1).padStart(2, "0")}</small>
              <h3>{first.componentSport ? `${first.componentSport.toUpperCase()} · ` : ""}{group.title}</h3>
              <b>
                {timed && group.steps.length > 1
                  ? endpointText({ endpoint: { type: "time", seconds: group.steps.reduce((sum, st) => sum + st.seconds, 0) } }, card.language)
                  : endpointText(group.steps[0], card.language)}
              </b>
              <p className="uwc-execution-target"><strong>{guide.target}</strong><br />{guide.target.includes("RPE") ? first.zone.toUpperCase() : `${guide.effort} · ${first.zone.toUpperCase()}`}</p>
              {targetSpeedLabel(first.target, card.units) && <p>{targetSpeedLabel(first.target, card.units)}</p>}
              {first.target.reference && <small>{targetReferenceSource(first.target.reference.source, es)} · {first.target.reference.observedAt.slice(0, 10)}</small>}
              <p>{guide.phase}</p>
              {first.target.missingReason && <p className="uwc-muted">{es ? "Referencia pendiente: " : ""}{first.target.missingReason}</p>}
              {group.steps.length > 1 ? (
                <>
                  <p>
                    {repeatLabel(workSteps, es ? "esfuerzos" : "efforts")}<br />
                    {repeatLabel(recoverySteps, es ? "recuperaciones" : "recoveries")} {es ? "recuperación" : "recovery"}
                  </p>
                  {recoverySteps.length > 0 && <p><strong>{es ? "Recuperación" : "Recovery"}:</strong> {recoverySteps[0].target.label}{!recoverySteps[0].target.label.includes("RPE") && ` · ${stepExecutionGuide(recoverySteps[0], card.session.sport, es).effort}`}</p>}
                  <details>
                    <summary>
                      {es ? "Ver todos los pasos" : "View every step"}
                    </summary>
                    {detail}
                  </details>
                </>
              ) : (
                <div className="uwc-execution-instructions">{additionalStepInstruction(card.content.steps[group.start] || "") && <p>{additionalStepInstruction(card.content.steps[group.start] || "")}</p>}{first.note && <p>{first.note}</p>}</div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function TrainingTargetSelector({ card }: { card: Card }) {
  const es = card.language === "es";
  return (
    <section className="uwc-section">
      <h2>
        <span>03</span>
        {es ? "OBJETIVOS POR PASO" : "STEP TARGETS"}
      </h2>
      <div className="uwc-step-grid">
        {(["pace", "power", "heartRate", "RPE"] as const).map((type) => {
          const labels = [
            ...new Set(
              card.session.steps
                .filter((step) =>
                  type === "RPE"
                    ? true
                    : step.target.type === type,
                )
                .map((step) =>
                  type === "RPE"
                    ? stepExecutionGuide(step, step.componentSport || card.session.sport, es).effort
                    : `${type === 'power' ? `${step.componentSport || card.session.sport} · ` : ''}${step.target.label}`,
                ),
            ),
          ];
          return (
            <article key={type}>
              <h3>
                {
                  {
                    pace: es ? "RITMO" : "PACE",
                    power: es ? "POTENCIA" : "POWER",
                    heartRate: es ? "FRECUENCIA CARDÍACA" : "HEART RATE",
                    RPE: "RPE",
                  }[type]
                }
              </h3>
              <p>{labels.length ? labels.join(" · ") : "—"}</p>
              <small>
                {labels.length
                  ? es
                    ? "Referencias por paso; consulta la secuencia."
                    : "Step-specific references; inspect the sequence."
                  : es
                    ? "No se ha indicado un objetivo numérico."
                    : "No numerical target supplied."}
              </small>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Fuel({ title, items }: { title: string; items: string[] }) {
  return (
    <article>
      <h3>{title}</h3>
      {items.map((v, i) => (
        <p key={i}>{v}</p>
      ))}
    </article>
  );
}
export function PreWorkoutFueling({ card }: { card: Card }) {
  return (
    <Fuel
      title={card.language === "es" ? "ANTES" : "PRE-WORKOUT"}
      items={card.content.before}
    />
  );
}
export function DuringWorkoutFueling({ card }: { card: Card }) {
  return (
    <Fuel
      title={card.language === "es" ? "DURANTE" : "DURING"}
      items={card.content.during}
    />
  );
}
export function PostWorkoutRecovery({ card }: { card: Card }) {
  return (
    <Fuel
      title={card.language === "es" ? "DESPUÉS" : "POST-WORKOUT"}
      items={card.content.after}
    />
  );
}
export function ErgogenicAidDetails({ card }: { card: Card }) {
  const es = card.language === "es";
  return (
    <details>
      <summary>
        {es
          ? "Suplementos, evidencia y límites"
          : "Supplements, evidence & limits"}
      </summary>
      <p>
        {es
          ? "No se añade una dosis de suplementos por el diseño de esta tarjeta. Consulta el plan individual y la revisión profesional."
          : "This card does not add supplement doses. Review individual suitability and the existing supplementation plan."}
      </p>
      <a href="/nutrition">
        {es ? "Revisar suplementos" : "Review supplements"}
      </a>
      {card.content.limitations.map((v, i) => (
        <p key={i}>{readinessReasonText(v, card.language === "es")}</p>
      ))}
    </details>
  );
}

export function BreathingRecovery({ card }: { card: Card }) {
  const es = card.language === "es",
    [duration, setDuration] = useState(120),
    [remaining, setRemaining] = useState<number | null>(null),
    [voice, setVoice] = useState(false);
  const end = useRef(0);
  const breathingActive = remaining !== null && remaining > 0;
  useEffect(() => {
    if (!breathingActive) return;
    const tick = () =>
      setRemaining(Math.max(0, Math.ceil((end.current - Date.now()) / 1000)));
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [breathingActive]);
  const phase =
    remaining === null || remaining === 0
      ? null
      : (duration - remaining) % 10 < 4
        ? "inhale"
        : "exhale";
  useEffect(() => {
    if (!voice || !phase || typeof speechSynthesis === "undefined") return;
    const u = new SpeechSynthesisUtterance(
      phase === "inhale"
        ? es
          ? "Inspira"
          : "Inhale"
        : es
          ? "Espira"
          : "Exhale",
    );
    u.lang = es ? "es-ES" : "en-US";
    speechSynthesis.speak(u);
    return () => speechSynthesis.cancel();
  }, [phase, voice, es]);
  return (
    <section className="uwc-section">
      <h2>
        <span>05</span>
        {es ? "RESPIRA Y RECUPERA" : "BREATHE & RECOVER"}
      </h2>
      <p>{card.breathing.instructions}</p>
      <div className="uwc-controls">
        <label>
          {es ? "Rutina" : "Routine"}
          <select
            value={duration}
            onChange={(e) => {
              setDuration(Number(e.target.value));
              setRemaining(null);
            }}
          >
            <option value="120">
              {es ? "Antes · 2 min" : "Before · 2 min"}
            </option>
            <option value="300">
              {es ? "Después · 5 min" : "After · 5 min"}
            </option>
          </select>
        </label>
        <button
          onClick={() => {
            if (remaining !== null && remaining > 0) {
              setRemaining(null);
              return;
            }
            end.current = Date.now() + duration * 1000;
            setRemaining(duration);
          }}
        >
          {remaining !== null && remaining > 0
            ? es
              ? "Detener"
              : "Stop"
            : es
              ? "Iniciar opcional"
              : "Start optional"}
        </button>
        <label>
          <input
            type="checkbox"
            checked={voice}
            onChange={(e) => setVoice(e.target.checked)}
          />
          {es ? "Voz opcional" : "Optional voice"}
        </label>
        <div className={`uwc-breath ${phase || ""}`} aria-live="polite">
          {remaining === null
            ? es
              ? "Respira cómodo"
              : "Breathe comfortably"
            : remaining === 0
              ? es
                ? "Finalizado"
                : "Done"
              : `${phase === "inhale" ? (es ? "Inspira" : "Inhale") : es ? "Espira" : "Exhale"} · ${remaining}s`}
        </div>
      </div>
      <p className="uwc-muted">{card.breathing.limitation}</p>
      <a href="https://pubmed.ncbi.nlm.nih.gov/30245619/">
        {es ? "Revisión de la evidencia" : "Evidence review"}
      </a>
    </section>
  );
}

export function DeviceExportMenu({ card }: { card: Card }) {
  const s = card.session;
  return (
    <FitDownloadActions
      sessionId={s.id}
      revision={s.revision}
      title={s.title}
      capability={s.capability}
      es={card.language === "es"}
    />
  );
}
export function ShareWorkout({ card }: { card: Card }) {
  const [message, setMessage] = useState(""),
    es = card.language === "es",
    s = card.session;
  return (
    <div className="uwc-controls uwc-no-print">
      <button onClick={() => window.print()}>
        {es ? "Imprimir / PDF" : "Print / PDF"}
      </button>
      <a
        href={`/api/workout/card?id=${encodeURIComponent(s.id)}&athleteId=${encodeURIComponent(s.athleteId)}&revision=${s.revision}&format=png`}
      >
        {es ? "Descargar tarjeta PNG" : "Download PNG card"}
      </a>
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              `${location.origin}/daily?sessionId=${encodeURIComponent(s.id)}`,
            );
            setMessage(
              es
                ? "Enlace copiado; requiere acceso autorizado."
                : "Link copied; authorized access required.",
            );
          } catch {
            setMessage(
              es ? "No se pudo copiar el enlace." : "Could not copy link.",
            );
          }
        }}
      >
        {es ? "Copiar enlace" : "Copy link"}
      </button>
      <a href="/workout-email/settings">
        {es ? "Correo y horarios" : "Email & timing"}
      </a>
      <a href="/reminders">Telegram</a>
      <p role="status">{message}</p>
    </div>
  );
}
export function CoachNotes({ card }: { card: Card }) {
  return (
    <details>
      <summary>
        {card.language === "es"
          ? "Preparación y notas del entrenador"
          : "Preparation & coach notes"}
      </summary>
      {card.content.preparation.map((v, i) => (
        <p key={i}>{readinessReasonText(v, card.language === "es")}</p>
      ))}
      <a href="/coach">JMM Coach</a>
    </details>
  );
}

export function UniversalWorkoutCard({
  card,
  onSaved,
  heldPreview,
  compactReadiness = false,
}: {
  card: Card;
  onSaved?: () => void | Promise<void>;
  heldPreview?: React.ReactNode;
  compactReadiness?: boolean;
}) {
  const es = card.language === "es";
  return (
    <div className="uwc" data-revision={card.session.revision}>
      <WorkoutHeader card={card} compactReadiness={compactReadiness} />
      {card.session.verdict !== "ready" && !compactReadiness && (
        <div role="status" className="uwc-controls">
          <a href="/checkin">
            {es ? "Revisar check-in de hoy" : "Review today's check-in"}
          </a>
          <a href="/onboard?redo=1&advanced=1">
            {es ? "Revisar datos del atleta" : "Review athlete setup"}
          </a>
        </div>
      )}
      {card.session.verdict !== "ready" && (!compactReadiness || card.session.verdict === "blocked") && heldPreview && <section aria-label={es ? "Plan guardado durante la revisión" : "Saved plan during readiness review"}>
        {!compactReadiness && <p role="status">{es ? "La sesión de hoy aún no está autorizada para entrenar. Puedes consultar el plan guardado abajo; sus pasos no eliminan la pausa ni autorizan la ejecución." : "Today's workout is not cleared to train. You can still view the saved plan below; its steps do not remove the hold or authorize execution."}</p>}
        {heldPreview}
      </section>}
      {card.session.verdict === "ready" && <>
        <WorkoutIntensityTimeline card={card} />
        <WorkoutIntervalDetails card={card} />
        <details className="uwc-extra"><summary>{es ? "Ritmo, potencia y frecuencia cardíaca" : "Pace, power & heart rate"}</summary><TrainingTargetSelector card={card} /></details>
      </>}
      <details className="uwc-extra"><summary>{es ? "Alimentación antes, durante y después" : "Fuel before, during & after"}</summary>
      <section className="uwc-section">
        <h2>
          <span>04</span>
          {es ? "ALIMENTACIÓN Y APOYO" : "FUEL & SUPPORT"}
        </h2>
        <div className="uwc-fuel">
          <PreWorkoutFueling card={card} />
          <DuringWorkoutFueling card={card} />
          <PostWorkoutRecovery card={card} />
        </div>
        <ErgogenicAidDetails card={card} />
      </section>
      </details>
      <details className="uwc-extra"><summary>{es ? "Respiración y recuperación" : "Breathing & recovery"}</summary><BreathingRecovery card={card} /></details>
      <CoachNotes card={card} />
      <details className="uwc-no-print"><summary>{es ? "Compartir, dispositivo y editar" : "Share, device & edit"}</summary>
      <div>
        <ShareWorkout card={card} />
        <DeviceExportMenu card={card} />
        {onSaved && <IntervalCoachEditor card={card} onSaved={onSaved} />}
        {onSaved && <WorkoutEditor card={card} onSaved={onSaved} />}
        {onSaved && (card.session.verdict !== "ready" || !["run", "bike"].includes(card.session.sport)) && (
          <StructuredSportEditor
            sessionId={card.session.id}
            sport={card.session.sport}
            es={es}
            onSaved={onSaved}
          />
        )}
      </div>
      </details>
      <footer>
        {es ? "Revisión" : "Revision"}: {card.session.revision.slice(0, 12)} ·{" "}
        {card.schemaVersion}
      </footer>
    </div>
  );
}

type WorkoutCardLoaderProps = {
  sessionId: string;
  es?: boolean;
  onSaved?: () => void | Promise<void>;
  heldPreview?: React.ReactNode;
  compactReadiness?: boolean;
};

export function UniversalWorkoutCardLoader(props: WorkoutCardLoaderProps) {
  // Reset before rendering a newly selected session, not after effect cleanup.
  return <WorkoutCardLoader key={props.sessionId} {...props} />;
}

function WorkoutCardLoader({ sessionId, es = false, onSaved, heldPreview, compactReadiness }: WorkoutCardLoaderProps) {
  const [card, setCard] = useState<Card | null>(null),
    [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setCard(null);
    setError("");
    readTrainingJson(`/api/workout/card?id=${encodeURIComponent(sessionId)}`, {
      signal: abort.signal,
      label: "Workout card",
      validate: (value): value is Card => isUniversalWorkoutCard(value) && value.session.id === sessionId,
    })
      .then(value => { if (!abort.signal.aborted) setCard(value); })
      .catch(error => { if (!abort.signal.aborted) setError(error instanceof Error ? error.message : "Could not load workout. Please retry."); });
    return () => abort.abort();
  }, [sessionId, retry]);
  return card ? (
    <UniversalWorkoutCard
      key={card.session.revision}
      card={card}
      heldPreview={heldPreview}
      compactReadiness={compactReadiness}
      onSaved={async () => {
        setRetry((v) => v + 1);
        await onSaved?.();
      }}
    />
  ) : (
    <div role={error ? "alert" : "status"}>
      {error || (es ? "Cargando tarjeta…" : "Loading workout card…")}
      {error && <>
        <button type="button" className="btn-secondary ml-2" onClick={() => setRetry((v) => v + 1)}>{es ? "Reintentar" : "Retry"}</button>
        <p>{es ? "No se pudo verificar la autorización para entrenar. La vista guardada sigue siendo solo de lectura." : "Readiness could not be verified. The saved preview remains read-only."}</p>
        {heldPreview}
      </>}
    </div>
  );
}
