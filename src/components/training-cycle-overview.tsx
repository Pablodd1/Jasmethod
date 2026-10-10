"use client";
import Link from "next/link";
import { dateKey } from "@/lib/dates";
import { savedCycleSummary } from "@/lib/training-cycle";

function themeLabel(theme: string, es: boolean) {
  if (!es) return theme;
  return theme.replace("Event preparation · reduced load", "Preparación del evento · carga reducida")
    .replace("Post-event recovery · review before resuming", "Recuperación tras el evento · revisar antes de retomar")
    .replace("Event preparation and recovery · reduced load", "Preparación y recuperación de eventos · carga reducida")
    .replace("Recovery and training review", "Recuperación y revisión del entrenamiento")
    .replace("Recovery and reassessment", "Recuperación y reevaluación")
    .replace("Baseline assessment and easy foundation", "Evaluación inicial y base suave")
    .replace("Foundation", "Base").replace("Progressive practice", "Práctica progresiva").replace("Block", "Bloque");
}
export function TrainingCycleOverview({ plan, cycle, timezone, selectedMonth, onMonthChange, es = false }: { plan: any; cycle: any; timezone: string; selectedMonth: string; onMonthChange: (month: string) => void; es?: boolean }) {
  const t = (en: string, spanish: string) => es ? spanish : en;
  const summary = savedCycleSummary(plan, timezone);
  const months = Array.from(new Set<string>(plan.days.map((day: any) => dateKey(new Date(day.date), timezone).slice(0, 7)))).sort();
  const monthDays = plan.days.filter((day: any) => dateKey(new Date(day.date), timezone).startsWith(selectedMonth));
  const sessions = monthDays.flatMap((day: any) => day.sessions);
  const completed = sessions.filter((session: any) => session.completed).length;
  const eventDates = new Set<string>(cycle?.events?.events?.map((event:any)=>event.dateKey) ?? []);
  const weekNumbers = new Set(monthDays.map((day: any) => day.week));
  return <section className="card space-y-4 border-ocean-200" aria-label={t("Saved training cycle", "Ciclo de entrenamiento guardado")}>
    <div>
      <p className="text-xs font-semibold uppercase text-ocean-700">{t("Saved training cycle", "Ciclo de entrenamiento guardado")}</p>
      <h2 className="font-display text-xl font-bold">{cycle?.goal || plan.name}</h2>
      <p className="text-sm mt-1">{summary.start} – {summary.end} · {summary.weeks} {t("weeks", "semanas")}{summary.currentWeek ? ` · ${t("Week", "Semana")} ${summary.currentWeek}` : summary.status === "upcoming" ? t(" · Starts soon", " · Próximo inicio") : t(" · Cycle ended", " · Ciclo finalizado")}</p>
      <p className="text-sm">{summary.raceDate ? `${t("Primary saved event date", "Fecha del evento principal")}: ${summary.raceDate}. ${t("Event participation is not recorded as completed training.", "Participar en el evento no se registra como entrenamiento completado.")}` : t("No event date supplied. This cycle supports your saved goal without inventing a race.", "Sin fecha de evento. El ciclo sigue tu objetivo guardado sin inventar una competición.")}</p>
    </div>
    <div className="flex flex-wrap gap-2">
      <Link href="/today" className="btn-primary min-h-12">{t("Today’s workout", "Entrenamiento de hoy")}</Link>
      <Link href="/calendar" className="btn-secondary min-h-12">{t("Calendar", "Calendario")}</Link>
      <Link href="/onboard?redo=1&advanced=1&return=training" className="btn-secondary min-h-12">{t("Update goals or availability", "Actualizar objetivos u horarios")}</Link>
    </div>
    <p className="text-sm">{t("Your cycle stays saved when you leave or update your profile. Future sessions are provisional; daily check-ins adapt training to your actual work and recovery. Review and confirm a replacement when your goals or availability change. Completed training remains in your history.", "Tu ciclo sigue guardado al salir o actualizar tu perfil. Las sesiones futuras son provisionales; el chequeo diario adapta el entrenamiento a lo realizado y a tu recuperación. Revisa y confirma un plan actualizado si cambian tus objetivos u horarios. El entrenamiento completado permanece en tu historial.")}</p>
    <div>
      <label htmlFor="cycle-month" className="label">{t("View saved month", "Ver mes guardado")}</label>
      <select id="cycle-month" className="input max-w-xs" value={selectedMonth} onChange={event => onMonthChange(event.target.value)}>{months.map(month => <option key={month} value={month}>{new Date(`${month}-15T12:00:00Z`).toLocaleDateString(es ? "es" : "en", { month:"long", year:"numeric", timeZone:"UTC" })}</option>)}</select>
      <p className="text-sm mt-2">{sessions.length} {t("saved sessions", "sesiones guardadas")} · {completed} {t("marked completed", "marcadas como completadas")} · {monthDays.filter((day: any) => day.dayOff && !eventDates.has(dateKey(new Date(day.date),timezone))).length} {t("planned rest days. Planned rest is not a report of completed rest.", "días de descanso planificados. Un descanso planificado no confirma que se haya realizado.")}</p>
    </div>
    {cycle?.weeks && <ul className="grid gap-2 sm:grid-cols-2">{cycle.weeks.filter((week: any) => weekNumbers.has(week.week)).map((week: any) => <li key={week.week} className="rounded-lg border border-sand-200 p-3"><strong className="text-sm">{t("Week", "Semana")} {week.week} · {themeLabel(week.theme, es)}</strong><p className="text-sm">{week.totalMinutes} min {t("originally planned", "planificados originalmente")}</p></li>)}</ul>}
    {cycle && <details className="text-sm">
      <summary className="cursor-pointer underline">{t("Planning basis, assessment and evidence", "Base del plan, evaluación y evidencia")}</summary>
      <div className="mt-2 space-y-2">
        {cycle.events?.events?.length > 0 && <div><strong>{t("Protected event dates", "Fechas de evento protegidas")}</strong><ul>{cycle.events.events.map((event:any)=><li key={event.id}>{event.dateKey} · {event.name} · {event.priority}</li>)}</ul><p>{t("No added workout on event days. Neither participation nor completed rest is assumed. Priorities guide preparation; actual recovery may require longer.", "No se añade entrenamiento en los días de evento. No se presume participación ni descanso completado. Las prioridades orientan la preparación; la recuperación real puede requerir más tiempo.")}</p></div>}
        {cycle.baselineReviews?.length > 0 && <ul>{cycle.baselineReviews.map((review:any)=><li key={review.sport}>{review.sport}: {t("evidence dated", "referencia del")} {review.observedAt || "—"}; {t("review due", "revisión prevista")} {review.reviewDueAt || "—"}; {t("expires", "caduca")} {review.expiresAt || "—"}. {t("Reviews use existing session time and never renew measured anchors.", "Las revisiones usan el tiempo de sesiones existentes y nunca renuevan las referencias medidas.")}</li>)}</ul>}
        <p>{t("Recent tolerated baseline", "Entrenamiento reciente tolerado")}: {cycle.baseline.weeklyMinutes} {t("min/week", "min/semana")}, {cycle.baseline.source === "coach_set" ? t("coach set", "indicado por el entrenador") : t("athlete reported", "declarado por el atleta")}, {t("observed", "observado")} {cycle.baseline.observedAt}.</p>
        <p>{es ? "La evaluación usa referencias disponibles y observaciones cómodas, nunca una prueba máxima obligatoria. No se inventan valores de umbral, VO2max o rendimiento. Revisa esfuerzo, síntomas y recuperación antes de progresar; la técnica de sprint y de las estaciones requiere revisión específica." : cycle.assessment}</p>
        <p>{t(cycle.evidenceNote, "Los objetivos son aspiraciones. El entrenamiento declarado, las pruebas medidas y las estimaciones conservan su origen. Las zonas de las sesiones son etiquetas de esfuerzo; no se crean estimaciones fisiológicas nuevas.")}</p>
        <ul>{cycle.baselineEvidence?.map((reference: any) => <li key={reference.label}>{es ? ({"Cycling power":"Potencia de ciclismo", "Running threshold pace":"Ritmo umbral de carrera", "Swimming threshold pace":"Referencia de ritmo de natación", "Swimming CSS reference":"Referencia CSS de natación"} as Record<string,string>)[reference.label] || reference.label : reference.label}: {reference.source === "swim_field_test_reference" ? t("field-test pace reference, not a measured lactate threshold", "referencia de ritmo de una prueba de campo, no un umbral de lactato medido") : reference.source === "measured_test" ? t("measured test reference", "referencia de una prueba medida") : reference.source === "estimated_from_5k_test" ? t("estimate derived from a measured 5 km result, not a measured threshold", "estimación derivada de un resultado de 5 km, no un umbral medido") : reference.source === "unavailable" ? t("— no reference supplied", "— sin referencia") : t("saved profile reference, not verified for exact targets", "referencia guardada, sin verificar para objetivos exactos")}.</li>)}</ul>
        <p>{cycle.activity.reportedSessions} {t("recorded performed sessions", "sesiones realizadas registradas")} · {cycle.activity.reportedMinutes ?? "—"} {t("recorded actual minutes", "minutos reales registrados")}{cycle.activity.unknownDurationSessions ? ` · ${cycle.activity.unknownDurationSessions} ${t("durations unknown", "duraciones desconocidas")}` : ""}. {t(cycle.activity.note, "Los datos no declarados no cuentan como cero. Completar una sesión no demuestra recuperación ni mayor capacidad.")}</p>
        <p>{t("Future progression is a conservative coaching template within your tolerated ceiling, not a guarantee of improvement. Review effort, symptoms and recovery before increasing.", "La progresión es una plantilla conservadora dentro de tu carga tolerada, sin garantía de mejora. Revisa esfuerzo, síntomas y recuperación antes de aumentar.")}</p>
        <Link href="/settings" className="underline">{t("Review profile and measured test results", "Revisar perfil y resultados medidos")}</Link>
      </div>
    </details>}
  </section>;
}
