import React from "react";
import Link from "next/link";
import { dayOffProtocol } from "@/lib/day-off";
import { resolveCheckinSafety } from "@/lib/checkin-safety";

export interface DailyRecoveryView {
  mode: "hold" | "planned-rest" | "easy-day" | "training" | "unplanned";
  allowMovement: boolean;
  safetyStatus: "clear" | "unknown" | "hold" | "urgent";
  recoveryNeedsReview: boolean;
  noAdditionalTraining: boolean;
  optionalMovementMinutes: number | null;
}

export function DailyRecoveryCard({ recovery, es = false, offline = false }: { recovery?: DailyRecoveryView | null; es?: boolean; offline?: boolean }) {
  const mode = recovery?.mode ?? "unplanned";
  const unknown = !recovery || recovery.safetyStatus === "unknown" || offline;
  const held = mode === "hold" || recovery?.safetyStatus === "hold" || recovery?.safetyStatus === "urgent";
  const urgent = recovery?.safetyStatus === "urgent";
  // Server clearance, current connectivity and the correct day context must all agree.
  const allowMovement = !unknown && !held && mode === "planned-rest" && recovery?.allowMovement === true && recovery.safetyStatus === "clear" && !recovery.recoveryNeedsReview && recovery.optionalMovementMinutes === 20;
  const protocol = dayOffProtocol(es ? "es" : "en", { allowMovement });
  const title = held ? (es ? "Recuperación diaria · entrenamiento en pausa" : "Daily recovery · training on hold")
    : mode === "planned-rest" ? (es ? "Día de recuperación" : "Recovery day")
    : mode === "easy-day" ? (es ? "Recuperación diaria · día suave" : "Daily recovery · easy day")
    : (es ? "Tu recuperación diaria" : "Your daily recovery");
  return <section id="daily-recovery" className="card space-y-4 border-ocean-200" aria-labelledby="daily-recovery-title">
    <h2 id="daily-recovery-title" className="font-display text-xl font-bold">{title}</h2>
    <p className="text-sm">{es ? "La recuperación forma parte de todos los días, incluso sin una sesión. El descanso completo es válido; no necesitas compensar entrenamientos perdidos." : "Recovery belongs in every day, including days without a workout. Complete rest is valid; you do not need to make up missed training."}</p>
    {urgent && <p role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">{es ? "Detén el ejercicio. El malestar actual en el pecho, desmayo, falta de aire intensa sin explicación, confusión o colapso requieren evaluación médica urgente. Si los síntomas son intensos o continúan, contacta ahora con los servicios de emergencia locales. No se prescribe entrenamiento; esto no es un diagnóstico ni autorización para volver a entrenar." : resolveCheckinSafety({ urgentSymptoms: true }).message}</p>}
    {held ? <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{es ? "No se ofrece ejercicio. Sigue las indicaciones de seguridad de tu check-in y las restricciones de tu profesional; estas prácticas no autorizan volver a entrenar." : "No exercise is offered. Follow your check-in safety guidance and professional restrictions; these practices do not clear you to resume training."}</p>
      : mode === "training" || mode === "easy-day" ? <p className="text-sm font-medium">{es ? "Estas opciones no añaden ejercicio al entrenamiento revisado. No añadas otra sesión para mejorar una puntuación." : "These choices add no exercise to your reviewed training. Do not add another session to improve a score."}</p>
      : mode === "unplanned" ? <p className="text-sm">{es ? "No se prescribe ejercicio adicional aquí. Revisa tu plan y tu check-in antes de entrenar." : "No additional exercise is prescribed here. Review your plan and check-in before training."}</p> : null}
    {(unknown || recovery?.recoveryNeedsReview) && <p role="status" className="text-sm">{offline ? (es ? "Los datos guardados no confirman tu estado actual. Reconecta y actualiza el check-in." : "Saved data does not confirm your current condition. Reconnect and update your check-in.") : es ? "Revisa sueño, energía, molestias y estrés. No se ofrece movimiento opcional mientras falte información de seguridad o necesites revisar tu recuperación." : "Review sleep, energy, soreness and stress. Optional movement is not offered while safety information is missing or recovery needs review."} <Link href="/checkin" className="underline text-ocean-700">{es ? "Abrir check-in" : "Open check-in"}</Link></p>}
    <div className="grid sm:grid-cols-2 gap-4">{protocol.essentials.filter(item => mode === "planned-rest" || item.key !== "movement").map(item => <div key={item.key ?? item.label}>
      <h3 className="font-semibold text-sm"><span aria-hidden="true">{item.icon} </span>{item.label}</h3>
      <p className="text-sm text-slate-600 mt-1">{item.detail}</p>
    </div>)}</div>
    {allowMovement && <p className="text-sm rounded-lg bg-ocean-50 p-3">{es ? "Si eliges movimiento, registra únicamente lo que realizaste en Calendario, con tus minutos y esfuerzo. Ese día no es descanso sin entrenamiento para J Metrics. Elegir esta opción no crea una sesión ni marca actividad completada." : "If you choose movement, record only what you actually did in Calendar, with your minutes and effort. That day is not a no-training rest day for J Metrics. Choosing this option creates no workout and marks nothing completed."} <Link href="/calendar" className="underline text-ocean-700">{es ? "Registrar actividad realizada" : "Log actual activity"}</Link></p>}
    <div className="border-t pt-3 space-y-3">
      <p className="text-sm">{protocol.visualizationShort}</p>
      <details><summary className="cursor-pointer font-semibold text-sm">{es ? "Visualización opcional paso a paso" : "Optional visualization, step by step"}</summary><ol className="mt-3 space-y-2">{protocol.visualizationFull.map(step => <li key={step.step} className="text-sm"><strong>{step.step}</strong> — {step.text}</li>)}</ol></details>
      <p className="text-xs text-slate-600">{protocol.closing}</p>
    </div>
    <details><summary className="cursor-pointer text-sm font-semibold">{es ? "Evidencia y límites" : "Evidence and limits"}</summary>
      <p className="text-xs mt-3">{allowMovement && protocol.evidenceNote ? protocol.evidenceNote : es ? "Los consensos apoyan individualizar sueño, recuperación y demandas de la vida. Estas opciones no garantizan mejorar HRV, rendimiento ni recuperación; no reinician el sistema nervioso autónomo." : "Consensus guidance supports individualizing sleep, recovery and life demands. These options do not guarantee improved HRV, performance or recovery, and do not reset the autonomic nervous system."}</p>
      {!!protocol.sources?.length && <><ul className="list-disc pl-5 text-xs mt-3 space-y-2">{protocol.sources.map(source => <li key={source.url}><a href={source.url} className="underline text-ocean-700">{source.title}</a></li>)}</ul><Link href="/science" className="inline-block underline text-sm text-ocean-700 mt-3">{es ? "Guía de ciencia de JMM" : "JMM science guide"}</Link></>}
    </details>
  </section>;
}
