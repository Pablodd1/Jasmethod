import { createHash } from "crypto";

/** Minimal scheduling copy, never personalized medical/training instructions. */
export function manualWorkoutCalendarPlaceholder(language: string, ready: boolean, appUrl: string) {
  const copy: Record<string, { ready: string; held: string; body: string }> = {
    en: { ready: "JMM training session", held: "JMM provisional session", body: "Minimal training placeholder; access follows your calendar sharing settings. Open the authenticated app for the current plan, preparation, before/during/after fueling, supported targets and workout graphic. Calendar entries do not confirm device transfer or readiness." },
    es: { ready: "Sesión de entrenamiento JMM", held: "Sesión provisional JMM", body: "Marcador de entrenamiento; el acceso depende de cómo compartas tu calendario. Consulta el plan actual, la preparación, la nutrición antes/durante/después, los objetivos y el gráfico en la aplicación. Esta entrada no confirma tu estado para entrenar ni la transferencia al dispositivo." },
    fr: { ready: "Séance JMM", held: "Séance provisoire JMM", body: "Les conseils détaillés dans le calendrier ne sont pas encore disponibles en français. Ouvrez la séance actuelle dans l’application après connexion. L’accès à cet événement dépend du partage de votre calendrier. Cet événement ne confirme ni votre aptitude à vous entraîner ni le transfert vers votre appareil." },
    ht: { ready: "Sesyon antrènman JMM", held: "Sesyon pwovizwa JMM", body: "Konsèy detaye nan kalandriye a poko disponib an kreyòl. Louvri sesyon aktyèl la nan aplikasyon an apre ou fin konekte. Aksè a evènman sa a depann de fason ou pataje kalandriye ou. Evènman sa a pa konfime si ou pare pou antrene ni si antrènman an rive sou aparèy ou." },
    ru: { ready: "Тренировка JMM", held: "Предварительная тренировка JMM", body: "Подробные рекомендации в календаре пока недоступны на русском. Откройте актуальную тренировку в приложении после входа. Доступ к событию зависит от настроек общего доступа к календарю. Событие не подтверждает готовность к тренировке или передачу на устройство." },
  };
  const held: Record<string, string> = {
    en: "PROVISIONAL / ON HOLD. No exercise is cleared by this entry. Review the current session in the app (sign-in required). ",
    es: "PROVISIONAL / EN PAUSA. Esta entrada no autoriza el ejercicio. Revisa la sesión actual en la aplicación (requiere iniciar sesión). ",
    fr: "PROVISOIRE / EN ATTENTE. Cette entrée ne valide aucun exercice. Consultez la séance actuelle dans l’application après connexion. ",
    ht: "PWOVIZWA / AN POZ. Antre sa a pa otorize egzèsis. Revize sesyon aktyèl la nan aplikasyon an apre ou fin konekte. ",
    ru: "ПРЕДВАРИТЕЛЬНО / ПРИОСТАНОВЛЕНО. Эта запись не разрешает выполнять упражнения. Проверьте актуальную тренировку в приложении после входа. ",
  };
  const selected = copy[language] || copy.en;
  return { summary: ready ? selected.ready : selected.held, description: `${copy[language] ? "" : "English fallback: your saved language is not yet supported for calendar text. "}${ready ? "" : held[language] || held.en}${selected.body}\n${appUrl}` };
}

/** Calendar snapshot identity includes scheduling fields, even for unresolved plans. */
export function manualWorkoutCalendarRevision(input: {
  workoutId: string; date: string; startTime: string | null; durationMin: number;
  canonicalRevision: string | null; ready: boolean; description: string;
}) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

/** Keep historical entries, but remove invalid plans and stale moved placeholders. */
export function retireWorkoutCalendarLink(
  workout: { planned: boolean; durationMin: number; date: Date; feedbackStatus: string | null; planDay?: { dayOff: boolean } | null } | null,
  linkedDate: Date, start: Date, end: Date,
) {
  if (!workout || !workout.planned || workout.durationMin <= 0 || workout.planDay?.dayOff || workout.feedbackStatus === "skipped") return true;
  const outsideWindow = workout.date < start || workout.date >= end;
  return outsideWindow && (workout.date.getTime() !== linkedDate.getTime() || linkedDate >= start);
}

export function calendarUnscheduledCopy(language: string) {
  const copy: Record<string, string> = {
    en: "Start time not set. This all-day placeholder does not mean an all-day workout.",
    es: "Hora de inicio sin definir. Este marcador de día completo no significa entrenar todo el día.",
    fr: "Heure de début non définie. Ce repère ne signifie pas un entraînement toute la journée.",
    ht: "Lè pou kòmanse a poko fikse. Makè tout jounen an pa vle di antrènman pandan tout jounen an.",
    ru: "Время начала не указано. Отметка на весь день не означает тренировку в течение всего дня.",
  };
  return copy[language] || copy.en;
}
