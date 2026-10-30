import React from "react";
import Link from "next/link";
import type { DailyInputContext } from "@/lib/daily-input-context";
import type { TrainingWeekReview } from "@/lib/training-week-review";

interface Props {
  es: boolean; date: string; offline: boolean;
  cycle?: { currentWeek?: number | null; weeks: number; status?: string; name?: string; start?: string; end?: string; raceDate?: string | null } | null;
  week?: TrainingWeekReview | null;
  context?: DailyInputContext | null;
  mode?: string | null;
  safetyStatus?: string | null;
  reviewedSessionId?: string | null;
  hasSession: boolean;
  skipped?: boolean; onSkip?: () => void;
}
/** Select a read-only initial view only. These readings never establish readiness. */
export function hasCurrentHealthReadings(context: DailyInputContext | null | undefined, date: string): boolean {
  if (!context || context.dateLocal !== date || context.readStatus !== "available" || context.bounded.observationsTruncated) return false;
  const usable = (key: keyof DailyInputContext["metrics"]) => {
    const metric = context.metrics[key];
    return metric.status === "usable" && metric.selected?.observedDay === date && metric.selected.freshness === "fresh";
  };
  return usable("sleepHours") && usable("restingHr") && (usable("hrvRmssd") || usable("hrvSdnn"));
}
/** Status comes from the canonical daily resolver, never a second client score. */
export function DailyReadinessPath({ es, date, offline, cycle, week, context, mode, safetyStatus, reviewedSessionId, hasSession, skipped = false, onSkip }: Props) {
  const t = (en: string, spanish: string) => es ? spanish : en;
  const observedDate = new Date(date);
  const dateLabel = Number.isFinite(observedDate.getTime()) ? new Intl.DateTimeFormat(es ? "es" : "en", { month: "short", day: "numeric", timeZone: "UTC" }).format(observedDate) : t("Unknown", "Sin confirmar");
  const measurements = !offline && context?.dateLocal === date ? Object.values(context.metrics).filter(metric => metric.status === "usable" && metric.selected !== null) : [];
  const currentMetrics = measurements.length;
  const names: Record<string, string> = {whoop:"WHOOP",oura:"Oura",apple:"Apple Health",apple_health:"Apple Health",garmin:"Garmin",garmin_direct:"Garmin",manual:t("Manual entries","Datos manuales"),app:"JMM",jmm:"JMM"};
  const sources = [...new Set(measurements.map(metric => metric.selected!.source))].map(source => names[source] || t("Saved measurements","Mediciones guardadas"));
  const reviewed = !offline && ["training", "easy-day"].includes(mode ?? "") && (safetyStatus === "clear" || !!reviewedSessionId);
  const held = ["hold", "review-needed"].includes(mode ?? "");
  const past = week?.past.status === "available" ? `${week.past.minutes} min` : t("Not confirmed", "Sin confirmar");
  return <section className="rounded-2xl border border-sand-200 bg-white p-4 sm:p-5 space-y-4" aria-label={t("Your week and readiness", "Tu semana y preparación")}>
    <div role="status" className="text-sm" data-testid="daily-health-status">
      <strong>{t("Health data", "Datos de salud")}</strong>
      <p>{currentMetrics ? t(`${sources.join(" · ")} · ${currentMetrics} current measurements · ${dateLabel}`, `${sources.join(" · ")} · ${currentMetrics} mediciones actuales · ${dateLabel}`) : offline ? t("Connect to verify today's measurements.","Conéctate para verificar las mediciones de hoy.") : t("No usable measurements for today. You can check in or view the planned workout.","Sin mediciones válidas de hoy. Puedes responder el check-in o ver la sesión prevista.")}</p>
    </div>
    <details><summary className="min-h-11 cursor-pointer content-center font-semibold">{t("Your week", "Tu semana")}{cycle?.currentWeek ? ` · ${cycle.currentWeek}/${cycle.weeks}` : ""}</summary>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-display text-lg font-bold">{t("Your week", "Tu semana")}</h2>
      <Link href="/training" className="inline-flex min-h-11 items-center text-sm font-semibold underline">{cycle?.currentWeek ? `${t("Cycle week", "Semana del ciclo")} ${cycle.currentWeek}/${cycle.weeks}` : t("Review cycle", "Revisar ciclo")}</Link>
    </div>
    {cycle?.name && <p className="text-sm font-semibold">{cycle.name}</p>}
    {cycle?.start && cycle.end && <p className="text-sm">{cycle.start} → {cycle.end}{cycle.raceDate ? ` · ${t("Race", "Carrera")}: ${cycle.raceDate}` : ""}</p>}
    <dl className="grid grid-cols-3 gap-3 text-sm">
      <div><dt className="text-slate-500">{t("Before today", "Antes de hoy")}</dt><dd className="mt-1 font-semibold">{past}</dd></div>
      <div><dt className="text-slate-500">{t("Today", "Hoy")}</dt><dd className="mt-1 font-semibold">{dateLabel}</dd></div>
      <div><dt className="text-slate-500">{t("Ahead", "Por venir")}</dt><dd className="mt-1 font-semibold">{week?.ahead.minutes != null ? `${week.ahead.minutes} min` : t("Not confirmed", "Sin confirmar")}</dd></div>
    </dl>
    <details className="border-b border-sand-200 pb-2 text-sm"><summary className="min-h-11 cursor-pointer content-center font-semibold">{t("Review this week's context", "Revisar el contexto semanal")}</summary>
      <p className="my-2 text-slate-600">{t("Only recorded work is shown before today. Ahead is the saved plan, not completed training. Missing activity never means rest. Recovery and reported effort still need review.", "Antes de hoy se muestra solo lo registrado. Lo que viene es el plan, no entrenamiento realizado. Datos ausentes no significan descanso. Aún hay que revisar recuperación y esfuerzo informado.")}</p>
      {week?.past.status === "restricted" && <p>{t("Past totals are withheld because source permissions are incomplete.", "No se muestran totales anteriores porque faltan permisos sobre su origen.")}</p>}
      {week?.past.status === "review" && <p>{t("Review incomplete or overlapping records before comparing load.", "Revisa registros incompletos o solapados antes de comparar carga.")}</p>}
      {week?.ahead.next?.map(item => <p key={item.id}>{item.date} · {item.title}{item.minutes != null ? ` · ${item.minutes} min` : ""}</p>)}
      <Link href="/calendar" className="inline-flex min-h-11 items-center underline">{t("Open calendar", "Abrir calendario")}</Link>
    </details>
    </details>
    {skipped && !["hold", "planned-rest", "event-day"].includes(mode ?? "") && !offline ? <div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p role="status">{t("Showing the planned workout", "Mostrando la sesión prevista")}</p><Link className="underline min-h-11 inline-flex items-center" href="/checkin#daily-questions">{t("Update check-in", "Actualizar check-in")}</Link></div> : <div className="space-y-2">
      <h2 className="font-display text-lg font-bold">{t("Readiness today", "Cómo estás hoy")}</h2>
      <p role="status" className="text-sm font-semibold">{offline ? t("Offline copy — review when connected", "Copia sin conexión; revisa al conectar") : held ? t("Training held for review", "Entrenamiento pendiente de revisión") : mode === "planned-rest" ? t("Planned rest day", "Día de descanso previsto") : mode === "event-day" ? t("Event day — no added workout", "Día de carrera; sin sesión añadida") : reviewed ? t("Today's session reviewed", "Sesión de hoy revisada") : skipped ? t("Showing the planned workout", "Mostrando la sesión prevista") : t("Daily adaptation not reviewed", "Adaptación diaria sin revisar")}</p>
      {!reviewed && !skipped && <p className="text-sm text-slate-600">{t("Check in to adapt to how you feel and your available time. Current measurements are reused.", "Responde para adaptar la sesión a cómo te sientes y tu tiempo disponible. Reutilizamos las mediciones actuales.")}</p>}
      <div className="flex flex-wrap gap-2">
        <Link href="/checkin#daily-questions" className="btn-primary min-h-11">{reviewed ? t("Update how I feel", "Actualizar cómo me siento") : t("Answer check-in", "Responder check-in")}</Link>
        {onSkip && hasSession && !reviewed && !["hold", "planned-rest", "event-day"].includes(mode ?? "") ? <button type="button" disabled={offline} onClick={onSkip} className="btn-secondary min-h-11">{t("Skip for now", "Omitir por ahora")}</button> : <a href={hasSession ? "#today-workout" : "/training"} className="btn-secondary min-h-11">{t("View session", "Ver sesión")}</a>}
      </div>
      {skipped && <p className="text-xs text-slate-600">{t("Planned view only; readiness is unconfirmed. No answers or approvals were saved.", "Solo vista prevista; preparación sin confirmar. No se guardaron respuestas ni aprobaciones.")}</p>}
    </div>}
  </section>;
}
