import { readinessFieldLabel, readinessReasonText } from "./readiness-copy";

/**
 * Display-only view of the adaptation shown after a check-in.
 *
 * It never changes the adaptation, the verdict, the safety status or any rule. It only decides how
 * three already-distinct situations are worded:
 *  - an unanswered question  (safetyStatus "unknown", rule ...:missing-input)  -> "Complete today's check-in"
 *  - a real answer of 0 min  (safetyStatus "clear",   rule ...:no-time)        -> a rest day the athlete chose
 *  - everything else (illness, pain, urgent symptoms, setup holds, ...)       -> unchanged, shown as before
 * An unanswered question is never converted into 0 minutes, and 0 minutes is never treated as unanswered.
 */

/** Rule ids produced by resolveCheckinSafety() and adaptSession() (src/lib/checkin-safety.ts, src/lib/adaptive.ts). */
export const CHECKIN_MISSING_INPUT_RULE = "checkin-safety-v1:missing-input";
export const CHECKIN_NO_TIME_RULE = "checkin-safety-v1:no-time";

/** Check-in questions in the order they appear on /checkin; the first unanswered one receives focus. */
const FORM_ORDER = ["sleep", "soreness", "motivation", "energy", "stress", "sick", "urgentSymptoms", "availableMin", "newPain"] as const;
export type CheckinQuestionKey = (typeof FORM_ORDER)[number];

/** DOM ids of the matching inputs on /checkin. */
export const CHECKIN_INPUT_IDS: Record<CheckinQuestionKey, string> = {
  sleep: "answer-sleep",
  soreness: "answer-soreness",
  motivation: "answer-motivation",
  energy: "answer-energy",
  stress: "answer-stress",
  sick: "answer-sick",
  urgentSymptoms: "answer-urgentSymptoms",
  availableMin: "answer-availableMinutes",
  newPain: "answer-newPain",
};

/** The subset of the stored adaptation this view reads. */
export interface AdaptationFields {
  safetyStatus?: string;
  ruleId?: string;
  missingFields?: unknown;
  message?: string;
}
export interface MissingAnswer { key: CheckinQuestionKey; label: string; inputId: string }
export type CheckinAdaptationView =
  | { kind: "incomplete"; heading: string; summary: string; explanation: string | null; missing: MissingAnswer[]; focusInputId: string | null }
  | { kind: "no-time"; heading: string; summary: string }
  | { kind: "standard" };

const COPY = {
  incompleteHeading: { en: "Complete today's check-in", es: "Completa el check-in de hoy" },
  genericHold: {
    en: "Training stays on hold until today's check-in is complete. Unknown or skipped answers do not confirm readiness to train.",
    es: "El entrenamiento sigue en pausa hasta completar el check-in de hoy. Las respuestas desconocidas u omitidas no confirman que estés listo para entrenar.",
  },
  minutesMissing: {
    en: "You haven't said how many minutes you can train today, so no workout is prescribed yet. We won't guess: enter the minutes you have, or 0 if you have no time today.",
    es: "Aún no indicas cuántos minutos puedes entrenar hoy, así que todavía no se prescribe ningún entrenamiento. No lo adivinamos: escribe los minutos que tienes, o 0 si hoy no tienes tiempo.",
  },
  noTimeHeading: { en: "No training time today", es: "Hoy no tienes tiempo para entrenar" },
  noTimeSummary: {
    en: "You reported 0 available minutes today. No workout is prescribed and no missed work is added later.",
    es: "Indicaste 0 minutos disponibles hoy. No se prescribe ningún entrenamiento y no se añade trabajo perdido después.",
  },
} as const;

/** Unanswered questions in on-screen order. Reads missingFields, or the standard message for older saved records. */
function unansweredKeys(adaptation: AdaptationFields): CheckinQuestionKey[] {
  const reported = Array.isArray(adaptation.missingFields)
    ? adaptation.missingFields.filter((key): key is string => typeof key === "string")
    : [];
  const fromMessage = reported.length
    ? []
    : (/Missing: ([^.]+)\./.exec(adaptation.message ?? "")?.[1] ?? "").split(", ");
  const keys = new Set([...reported, ...fromMessage]);
  return FORM_ORDER.filter((key) => keys.has(key));
}

export function checkinAdaptationView(adaptation: AdaptationFields | null | undefined, es: boolean): CheckinAdaptationView {
  if (!adaptation) return { kind: "standard" };
  const lang = es ? "es" : "en";
  if (adaptation.ruleId === CHECKIN_MISSING_INPUT_RULE && adaptation.safetyStatus === "unknown") {
    const keys = unansweredKeys(adaptation);
    const missing: MissingAnswer[] = keys.map((key) => ({ key, label: readinessFieldLabel(key, es) ?? key, inputId: CHECKIN_INPUT_IDS[key] }));
    const message = adaptation.message ?? "";
    const friendly = readinessReasonText(message, es);
    return {
      kind: "incomplete",
      heading: COPY.incompleteHeading[lang],
      summary: friendly !== message ? friendly : COPY.genericHold[lang],
      explanation: keys.includes("availableMin") ? COPY.minutesMissing[lang] : null,
      missing,
      focusInputId: missing[0]?.inputId ?? null,
    };
  }
  if (adaptation.ruleId === CHECKIN_NO_TIME_RULE && adaptation.safetyStatus === "clear") {
    return { kind: "no-time", heading: COPY.noTimeHeading[lang], summary: COPY.noTimeSummary[lang] };
  }
  return { kind: "standard" };
}
