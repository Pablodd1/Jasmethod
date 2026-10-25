import Link from "next/link";
import type { DailyInputContext } from "@/lib/daily-input-context";
import type { TrainingWeekReview } from "@/lib/training-week-review";

interface Props {
  es: boolean; date: string; offline: boolean;
  cycle?: { currentWeek?: number | null; weeks: number; status?: string } | null;
  week?: TrainingWeekReview | null;
  context?: DailyInputContext | null;
  mode?: string | null;
  safetyStatus?: string | null;
  reviewedSessionId?: string | null;
  hasSession: boolean;
}
/** Status comes from the canonical daily resolver, never a second client score. */
export function DailyReadinessPath({ es, date, offline, cycle, week, context, mode, safetyStatus, reviewedSessionId, hasSession }: Props) {
  const t = (en: string, spanish: string) => es ? spanish : en;
  const currentMetrics = !offline && context?.dateLocal === date ? Object.values(context.metrics).filter(metric => metric.status === "usable" && metric.selected !== null).length : 0;
  const reviewed = !offline && ["training", "easy-day"].includes(mode ?? "") && (safetyStatus === "clear" || !!reviewedSessionId);
  const held = ["hold", "review-needed"].includes(mode ?? "");
  const past = week?.past.status === "available" ? `${week.past.minutes} min` : t("Not confirmed", "Sin confirmar");
  return <section className="rounded-2xl border border-sand-200 bg-white p-4 sm:p-5 space-y-4" aria-label={t("Your week and readiness", "Tu semana y preparación")}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-display text-lg font-bold">{t("Your week", "Tu semana")}</h2>
      <Link href="/training" className="inline-flex min-h-11 items-center text-sm font-semibold underline">{cycle?.currentWeek ? `${t("Cycle week", "Semana del ciclo")} ${cycle.currentWeek}/${cycle.weeks}` : t("Review cycle", "Revisar ciclo")}</Link>
    </div>
    <dl className="grid grid-cols-3 gap-3 text-sm">
      <div><dt className="text-slate-500">{t("Before today", "Antes de hoy")}</dt><dd className="mt-1 font-semibold">{past}</dd></div>
      <div><dt className="text-slate-500">{t("Today", "Hoy")}</dt><dd className="mt-1 font-semibold">{date}</dd></div>
      <div><dt className="text-slate-500">{t("Ahead", "Por venir")}</dt><dd className="mt-1 font-semibold">{week?.ahead.minutes != null ? `${week.ahead.minutes} min` : t("Not confirmed", "Sin confirmar")}</dd></div>
    </dl>
    <details className="border-b border-sand-200 pb-2 text-sm"><summary className="min-h-11 cursor-pointer content-center font-semibold">{t("Review this week's context", "Revisar el contexto semanal")}</summary>
      <p className="my-2 text-slate-600">{t("Only recorded work is shown before today. Ahead is the saved plan, not completed training. Missing activity never means rest. Recovery and reported effort still need review.", "Antes de hoy se muestra solo lo registrado. Lo que viene es el plan, no entrenamiento realizado. Datos ausentes no significan descanso. Aún hay que revisar recuperación y esfuerzo informado.")}</p>
      {week?.past.status === "restricted" && <p>{t("Past totals are withheld because source permissions are incomplete.", "No se muestran totales anteriores porque faltan permisos sobre su origen.")}</p>}
      {week?.past.status === "review" && <p>{t("Review incomplete or overlapping records before comparing load.", "Revisa registros incompletos o solapados antes de comparar carga.")}</p>}
      {week?.ahead.next?.map(item => <p key={item.id}>{item.date} · {item.title}{item.minutes != null ? ` · ${item.minutes} min` : ""}</p>)}
      <Link href="/calendar" className="inline-flex min-h-11 items-center underline">{t("Open calendar", "Abrir calendario")}</Link>
    </details>
    <div className="space-y-2">
      <h2 className="font-display text-lg font-bold">{t("Readiness today", "Cómo estás hoy")}</h2>
      <p role="status" className="text-sm font-semibold">{offline ? t("Offline copy — review when connected", "Copia sin conexión; revisa al conectar") : held ? t("Training held for review", "Entrenamiento pendiente de revisión") : mode === "planned-rest" ? t("Planned rest day", "Día de descanso previsto") : mode === "event-day" ? t("Event day — no added workout", "Día de carrera; sin sesión añadida") : reviewed ? t("Today's session reviewed", "Sesión de hoy revisada") : t("Your answers are still needed", "Faltan tus respuestas")}</p>
      <p className="text-sm text-slate-600">{currentMetrics ? t(`${currentMetrics} current measurements available. Add how you feel and your available time.`, `${currentMetrics} mediciones actuales disponibles. Añade cómo te sientes y tu tiempo disponible.`) : t("No current measurements needed to begin. Answer about sleep, energy, soreness, symptoms and available time.", "Puedes empezar sin mediciones actuales. Responde sobre sueño, energía, molestias, síntomas y tiempo disponible.")}</p>
      <div className="flex flex-wrap gap-2">
        <Link href="/checkin#daily-questions" className="btn-primary min-h-11">{reviewed ? t("Update how I feel", "Actualizar cómo me siento") : t("Answer check-in", "Responder check-in")}</Link>
        <a href={hasSession ? "#today-workout" : "/training"} className="btn-secondary min-h-11">{reviewed ? t("View session", "Ver sesión") : t("Skip for now", "Omitir por ahora")}</a>
      </div>
      {!reviewed && <p className="text-sm text-slate-600">{t("Skipping keeps unanswered data unknown. It does not unlock an adapted workout.", "Omitir deja los datos sin confirmar. No habilita una sesión adaptada.")}</p>}
      <details className="text-sm"><summary className="min-h-11 cursor-pointer content-center font-semibold">{t("Device or optional app test", "Dispositivo o prueba opcional")}</summary>
        <p className="text-slate-600">{t("A device is optional. Measurements do not replace current symptoms. The focus check does not measure physical readiness or clear you to train.", "El dispositivo es opcional. Las mediciones no sustituyen los síntomas. La prueba de atención no mide preparación física ni autoriza entrenar.")}</p>
        <div className="flex flex-wrap gap-4"><Link className="inline-flex min-h-11 items-center underline" href="/connectors">{t("Devices & imports", "Dispositivos e importaciones")}</Link><Link className="inline-flex min-h-11 items-center underline" href="/checkin#optional-focus-check">{t("Optional focus check", "Prueba opcional de atención")}</Link></div>
      </details>
    </div>
  </section>;
}
