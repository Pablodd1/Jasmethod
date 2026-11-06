import { addDaysKey } from "./dates";
import { clockText } from "./metric-entry";
import { readManualPersonalBests } from "./onboarding-evidence";
import { recordReportedAnchors } from "./reported-anchors";

export type CoachSwimObservation = {
  kind: "observation" | "reported_css";
  secondsPer100m: number;
  observedDate: string;
};

export type CoachSwimReport =
  | ({ status: "ready" } & CoachSwimObservation)
  | { status: "clarify"; missing: "type" | "date" }
  | { status: "invalid" };

const observationLabel = "Reported swim training pace";
export const COACH_SWIM_PACE_UNIT = "sec/100m";
const pace = /(?:^|[^\d:])([0-9]{1,2}):([0-5]\d)\s*(?:\/|per\s+|por\s+|cada\s+)\s*100\s*(m|meters?|metres?|metros?|yds?|yards?|yardas?)\b/g;
const athleteReport = /^(?:(?:today|yesterday|hoy|ayer|\d{4}-\d{2}-\d{2}),?\s+)?(?:my\s+(?:(?:swim(?:ming)?|pool)\s+(?:(?:training|threshold)\s+)?pace|training\s+swim\s+pace|(?:swim\s+)?css|threshold\s+pace\s+(?:for\s+swimming|in\s+the\s+pool))|mi\s+(?:ritmo\s+(?:de\s+entrenamiento\s+)?(?:de\s+)?natacion|ritmo\s+de\s+entrenamiento\s+en\s+natacion|css(?:\s+de\s+natacion)?|ritmo\s+umbral\s+de\s+natacion))\s*(?:is\b|was\b|es\b|fue\b|:)/;
const knownDevice = /\b(?:garmin|strava|coros|apple watch|whoop|oura|intervals(?:\.icu)?|imported|importado|device|dispositivo|export(?:ed|acion))\b/;
const uncertain = /\b(?:maybe|probably|about|roughly|approximately|think|guess|target|goal|want|aim|quizas|tal vez|aproximadamente|creo|objetivo|meta|espero)\b/;

function validDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const validPace = (value: number) => Number.isFinite(value) && value >= 30 && value <= 600;

/** A narrow athlete-authored input, not a device report or a threshold test. */
export function parseCoachSwimReport(message: string, localToday: string): CoachSwimReport | null {
  const input = message.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const match = athleteReport.exec(input);
  if (!match) return null;
  if (input.length > 500 || /[\n\r;?!]/.test(input) || uncertain.test(input) || knownDevice.test(input) || !validDay(localToday)) return { status: "invalid" };
  const matches = [...input.matchAll(pace)];
  if (matches.length !== 1) return { status: "invalid" };
  const [, minutes, seconds, distanceUnit] = matches[0];
  const remainder = input.slice(match[0].length).replace(pace, "").trim();
  // Only allow an explicit date after the pace. This rejects a mixed or
  // conflicting request instead of accepting a substring as the whole input.
  if (remainder && !/^(?:(?:on|from|el|del)\s+)?(?:today|yesterday|hoy|ayer|\d{4}-\d{2}-\d{2})\.?$|^\.$/.test(remainder)) return { status: "invalid" };
  const dates = input.match(/\b(?:\d{4}-\d{2}-\d{2}|today|yesterday|hoy|ayer)\b/g) ?? [];
  if (dates.length > 1) return { status: "invalid" };
  const date = dates[0];
  const observedDate = date === "today" || date === "hoy" ? localToday
    : date === "yesterday" || date === "ayer" ? addDaysKey(localToday, -1) : date;
  if (observedDate && (!validDay(observedDate) || observedDate > localToday)) return { status: "invalid" };
  const suppliedSeconds = Number(minutes) * 60 + Number(seconds);
  const secondsPer100m = /^m/.test(distanceUnit) ? suppliedSeconds
    : Math.round(suppliedSeconds * (100 / 91.44) * 1000) / 1000;
  if (!validPace(secondsPer100m)) return { status: "invalid" };
  const isCss = /\b(?:css|threshold|umbral)\b/.test(match[0]);
  const isObservation = /\b(?:training|entrenamiento)\b/.test(match[0]);
  if (!isCss && !isObservation) return { status: "clarify", missing: "type" };
  if (!observedDate) return { status: "clarify", missing: "date" };
  return { status: "ready", kind: isCss ? "reported_css" : "observation", secondsPer100m, observedDate };
}

/** Build a revision-protected profile patch in the caller's existing transaction. */
export function applyCoachSwimReport(rawManualPrs: unknown, report: CoachSwimObservation, localToday: string): {
  manualPrs: string;
  swimPaceBase?: number;
} {
  if (!validDay(localToday) || !validDay(report.observedDate) || report.observedDate > localToday ||
      !validPace(report.secondsPer100m) || !["observation", "reported_css"].includes(report.kind)) {
    throw Error("Review the swim pace, units and actual observation date.");
  }
  if (report.kind === "reported_css") {
    const rows = readManualPersonalBests(rawManualPrs);
    if (!rows) throw Error("Review saved personal records before changing CSS.");
    if (report.observedDate < addDaysKey(localToday, -90) ||
        rows.some(row => row.label === "JMM manual CSS reference" && row.unit === COACH_SWIM_PACE_UNIT && row.date > report.observedDate)) {
      throw Error("This CSS observation is older than the current reference window or a newer saved reference. Review your training references before changing CSS.");
    }
    const profile = { swimPaceBase: report.secondsPer100m };
    return { ...profile, manualPrs: recordReportedAnchors(rawManualPrs, profile, report.observedDate, localToday) };
  }
  const rows = readManualPersonalBests(rawManualPrs);
  if (!rows) throw Error("Review saved personal records before adding a swim observation.");
  if (rows.some(row => row.label === observationLabel && row.unit === COACH_SWIM_PACE_UNIT &&
      row.value === report.secondsPer100m && row.date === report.observedDate)) return { manualPrs: JSON.stringify(rows) };
  if (rows.length >= 50) throw Error("Review the saved record limit before adding a swim observation.");
  return { manualPrs: JSON.stringify([...rows, { label: observationLabel, value: report.secondsPer100m, unit: COACH_SWIM_PACE_UNIT, date: report.observedDate }]) };
}

export function coachSwimReply(report: CoachSwimReport, es: boolean): string {
  if (report.status === "clarify") {
    if (report.missing === "type") return es
      ? "¿Fue tu ritmo de entrenamiento de natación o una referencia CSS? Vuelve a indicar el ritmo, qué tipo fue y cuándo lo observaste para preparar una revisión."
      : "Was that your swim training pace or a CSS reference? Send the pace again with its type and observation date so I can prepare it for review.";
    return es
      ? "¿En qué fecha observaste ese ritmo? Vuelve a indicar el ritmo y la fecha para preparar una revisión."
      : "When did you observe that pace? Send the pace and its date so I can prepare it for review.";
  }
  if (report.status === "invalid") return es
    ? "Para preparar una revisión, indica un solo ritmo propio de natación en min:seg por 100 m o yardas y la fecha real. Los datos importados o de dispositivos requieren su propio flujo de revisión."
    : "For a review, give one swim pace you observed in min:sec per 100 m or yards and the actual date. Imported or device data need their own review flow.";
  const value = clockText(report.secondsPer100m) + "/100 m";
  if (report.kind === "reported_css") return es
    ? `Revisa ${value} del ${report.observedDate} como referencia CSS declarada. No es una prueba verificada. Aún no se ha guardado.`
    : `Review ${value} on ${report.observedDate} as an athlete-reported CSS reference. It is not a verified test. Nothing has been saved yet.`;
  return es
    ? `Revisa ${value} del ${report.observedDate} como observación de entrenamiento. No cambia tu CSS. Aún no se ha guardado.`
    : `Review ${value} on ${report.observedDate} as a training observation. It does not change your CSS. Nothing has been saved yet.`;
}
