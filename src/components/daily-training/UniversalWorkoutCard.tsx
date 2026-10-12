"use client";
import React, { useEffect, useRef, useState } from "react";
import {
  endpointText,
  isUniversalWorkoutCard,
  stepColor,
  type UniversalWorkoutCard as Card,
} from "@/lib/universal-workout-card";
import type { CanonicalStep } from "@/lib/canonical-session";
import { FitDownloadActions } from "./FitDownloadActions";
import { WorkoutEditor } from "./WorkoutEditor";
import { StructuredSportEditor } from "@/components/StructuredSportEditor";

type Mode = "zone" | "RPE" | "heartRate" | "pace" | "power";
const n = (s: CanonicalStep, mode: Mode): number | null =>
  mode === "zone"
    ? Number(s.zone.slice(1))
    : mode === "RPE"
      ? Number(/RPE (\d+)\/10/.exec(s.target.label)?.[1] || 0) || null
      : s.target.type === mode
        ? (s.target.high ?? null)
        : null;

export function WorkoutHeader({ card }: { card: Card }) {
  const s = card.session,
    es = card.language === "es";
  return (
    <header className="uwc-header">
      <div>
        <p>
          {s.sport.toUpperCase()} · {s.dateLocal} · {s.timezone}
        </p>
        <h1>{s.title}</h1>
        <p>{s.reason}</p>
      </div>
      <div className="uwc-stats">
        <b>
          {s.exactTimeSeconds === null ? "~" : ""}
          {Number(
            (s.exactTimeSeconds === null
              ? s.durationMin
              : s.exactTimeSeconds / 60
            ).toFixed(2),
          )}
          <small>MIN</small>
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
  const [mode, setMode] = useState<Mode>("zone"),
    [selected, setSelected] = useState(0),
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
    : selected;
  const values = s.steps.map((st) => n(st, mode)),
    max = Math.max(1, ...values.filter((v): v is number => v !== null));
  const width = 900,
    height = 170,
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
  const step = s.steps[selected];
  if (!s.steps.length) return <p role="status">{s.reason}</p>;
  return (
    <section className="uwc-section">
      <h2>
        <span>01</span>
        {es ? "LA SECUENCIA" : "THE FLOW"}
      </h2>
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
      <p className="uwc-muted">
        {timed
          ? es
            ? "Anchura proporcional al tiempo real prescrito."
            : "Widths proportional to actual prescribed duration."
          : es
            ? "Pasos de anchura igual: no representan tiempo estimado."
            : "Equal-width steps: no estimated time is presented as exact."}{" "}
        {es
          ? "Altura: objetivo del plan, no medición en vivo."
          : "Height: planning target, not a live measurement."}
      </p>
      <div className="uwc-chart-scroll">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: `${zoom * 100}%`, minWidth: 550 }}
          role="group"
          aria-label={es ? "Pasos del entrenamiento" : "Workout steps"}
        >
          {bars.map(({ st, i, x, w, h, value }) => (
            <g
              key={i}
              role="button"
              tabIndex={0}
              aria-label={`${i + 1}. ${st.name}: ${endpointText(st)}, ${st.target.label}`}
              aria-pressed={selected === i}
              onClick={() => setSelected(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelected(i);
                }
              }}
            >
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
              {w >= 20 && <text
                x={x + w / 2}
                y={163}
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
            {selected + 1}. {step.name} · {endpointText(step)}
          </b>
          <p>{card.content.steps[selected] || step.target.label}</p>
          {values[selected] === null && (
            <p>
              {es
                ? "Este paso no tiene ese objetivo."
                : "This step has no target for this view."}
            </p>
          )}
        </div>
      )}
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
              setSelected((i) => Math.min(s.steps.length - 1, i + 1))
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
    </section>
  );
}

export function WorkoutIntervalDetails({ card }: { card: Card }) {
  const es = card.language === "es";
  const groups: { title: string; start: number; steps: CanonicalStep[] }[] = [];
  card.session.steps.forEach((step, index) => {
    const title = step.group || step.name;
    const previous = groups.at(-1);
    if (previous?.title === title && step.group) previous.steps.push(step);
    else groups.push({ title, start: index, steps: [step] });
  });
  return (
    <section className="uwc-section">
      <h2>
        <span>02</span>
        {es ? "LOS DETALLES" : "THE DETAILS"}
      </h2>
      <div className="uwc-step-grid">
        {groups.map((group, i) => {
          const timed = group.steps.every((st) => st.endpoint.type === "time");
          const work = group.steps.filter((st) => st.phase === "active").length;
          const recovery = group.steps.filter(
            (st) => st.phase === "recovery",
          ).length;
          const detail = group.steps.map((step, index) => (
            <div key={index}>
              <b>
                {endpointText(step)} · {step.name}
              </b>
              <p>
                {card.content.steps[group.start + index] || step.target.label}
              </p>
              {step.note && <p>{step.note}</p>}
            </div>
          ));
          return (
            <article
              key={i}
              style={{ borderTopColor: stepColor(group.steps[0]) }}
            >
              <small>{String(i + 1).padStart(2, "0")}</small>
              <h3>{group.title}</h3>
              <b>
                {timed
                  ? `${Number((group.steps.reduce((sum, st) => sum + st.seconds, 0) / 60).toFixed(2))} min`
                  : endpointText(group.steps[0])}
              </b>
              {group.steps.length > 1 ? (
                <>
                  <p>
                    {work} {es ? "esfuerzos" : "efforts"} · {recovery}{" "}
                    {es ? "recuperaciones" : "recoveries"}
                  </p>
                  <details>
                    <summary>
                      {es ? "Ver todos los pasos" : "View every step"}
                    </summary>
                    {detail}
                  </details>
                </>
              ) : (
                detail
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
                    ? /RPE \d+\/10/.test(step.target.label)
                    : step.target.type === type,
                )
                .map((step) =>
                  type === "RPE"
                    ? /RPE \d+\/10/.exec(step.target.label)![0]
                    : step.target.label,
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
        <p key={i}>{v}</p>
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
        <p key={i}>{v}</p>
      ))}
      <a href="/coach">J Koach</a>
    </details>
  );
}

export function UniversalWorkoutCard({
  card,
  onSaved,
}: {
  card: Card;
  onSaved?: () => void | Promise<void>;
}) {
  const es = card.language === "es";
  return (
    <div className="uwc" data-revision={card.session.revision}>
      <WorkoutHeader card={card} />
      {card.session.verdict !== "ready" && (
        <div role="status" className="uwc-controls">
          <a href="/checkin">
            {es ? "Revisar check-in de hoy" : "Review today's check-in"}
          </a>
          <a href="/onboard?redo=1&advanced=1">
            {es ? "Revisar datos del atleta" : "Review athlete setup"}
          </a>
        </div>
      )}
      <ShareWorkout card={card} />
      <WorkoutIntensityTimeline card={card} />
      <WorkoutIntervalDetails card={card} />
      <TrainingTargetSelector card={card} />
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
      <BreathingRecovery card={card} />
      <CoachNotes card={card} />
      <div className="uwc-no-print">
        <DeviceExportMenu card={card} />
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
      <footer>
        {es ? "Revisión" : "Revision"}: {card.session.revision.slice(0, 12)} ·{" "}
        {card.schemaVersion} · {card.session.capability.reason}
      </footer>
    </div>
  );
}

export function UniversalWorkoutCardLoader({
  sessionId,
  es = false,
  onSaved,
}: {
  sessionId: string;
  es?: boolean;
  onSaved?: () => void | Promise<void>;
}) {
  const [card, setCard] = useState<Card | null>(null),
    [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setCard(null);
    setError("");
    fetch(`/api/workout/card?id=${encodeURIComponent(sessionId)}`, {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error || "Could not load workout");
        if (
          !isUniversalWorkoutCard(d) ||
          d.session?.id !== sessionId ||
          !Array.isArray(d.session.steps)
        )
          throw Error("Unsupported workout card");
        if (!abort.signal.aborted) setCard(d);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [sessionId, retry]);
  return card ? (
    <UniversalWorkoutCard
      key={card.session.revision}
      card={card}
      onSaved={async () => {
        setRetry((v) => v + 1);
        await onSaved?.();
      }}
    />
  ) : (
    <div role={error ? "alert" : "status"}>
      {error || (es ? "Cargando tarjeta…" : "Loading workout card…")}
      {error && (
        <button onClick={() => setRetry((v) => v + 1)}>
          {es ? "Reintentar" : "Retry"}
        </button>
      )}
    </div>
  );
}
