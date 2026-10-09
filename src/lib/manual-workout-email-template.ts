export type ManualWorkoutEmailLanguage = "en" | "es";
export type ManualWorkoutEmailKind = "ready" | "revised" | "held" | "cancelled";

export interface ManualWorkoutEmailReadyPlan {
  summary: string;
  steps: string[];
  before: string[];
  during: string[];
  after: string[];
  preparation: string[];
  limitations: string[];
  graphicCid?: string;
  graphicAlt?: string;
}

export interface ManualWorkoutEmailInput {
  language: ManualWorkoutEmailLanguage;
  kind: ManualWorkoutEmailKind;
  dateLabel: string;
  revision: string;
  /** Caller must validate both links against the configured, trusted app origin. */
  workoutUrl: string;
  settingsUrl: string;
  /** Only verified canonical content, with consent for instructions/targets/nutrition in email. */
  readyPlan?: ManualWorkoutEmailReadyPlan;
}

export interface ManualWorkoutEmailContent {
  subject: string;
  html: string;
  text: string;
}

export const MANUAL_GARMIN_FILE_HELP = "https://support.garmin.com/en-GB/?faq=AXV7LuWgc73v21nq6nbDa6";
export const MANUAL_GARMIN_MAC_HELP = "https://support.garmin.com/en-MY/?faq=4NnyLlu0o5ASH4BVZ6QWPA";

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]!);

// Header values must stay on one line, even when a display label is malformed.
const singleLine = (value: string): string => value.replace(/[\r\n\u2028\u2029]+/g, " ").trim();

function appLinks(workoutUrl: string, settingsUrl: string): { workout: string; settings: string } {
  const workout = new URL(workoutUrl);
  const settings = new URL(settingsUrl);
  for (const url of [workout, settings]) {
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("Manual workout email requires HTTP(S) app links without credentials.");
    }
  }
  if (workout.origin !== settings.origin) {
    throw new Error("Manual workout email links must share the trusted app origin.");
  }
  return { workout: workout.href, settings: settings.href };
}

/**
 * Pure content renderer. Do not pass workout titles, names or health symptoms.
 * The sender owns consent, freshness, safety checks and attachment creation:
 * ready/revised require the current FIT; held/cancelled must attach no FIT.
 * Rendering or sending this message never establishes device receipt.
 */
export function manualWorkoutEmail(input: ManualWorkoutEmailInput): ManualWorkoutEmailContent {
  const { language, kind } = input;
  const es = language === "es";
  const date = singleLine(input.dateLabel);
  const revision = singleLine(input.revision);
  const links = appLinks(input.workoutUrl, input.settingsUrl);
  const actionable = kind === "ready" || kind === "revised";
  const subjects: Record<ManualWorkoutEmailKind, string> = es ? {
    ready: "Tu archivo de entrenamiento está listo",
    revised: "Tu entrenamiento tiene una nueva versión",
    held: "Tu entrenamiento está en pausa",
    cancelled: "Tu entrenamiento se ha cancelado",
  } : {
    ready: "Your workout file is ready",
    revised: "Your workout has a new version",
    held: "Your workout is on hold",
    cancelled: "Your workout has been cancelled",
  };
  const introductions: Record<ManualWorkoutEmailKind, string> = es ? {
    ready: `Adjuntamos el archivo FIT de tu entrenamiento del ${date}.`,
    revised: `El entrenamiento del ${date} ha cambiado. Adjuntamos el nuevo archivo FIT.`,
    held: `El entrenamiento del ${date} está en pausa. No adjuntamos ningún archivo de entrenamiento.`,
    cancelled: `El entrenamiento del ${date} se ha cancelado. No adjuntamos ningún archivo de entrenamiento.`,
  } : {
    ready: `Your workout FIT file for ${date} is attached.`,
    revised: `Your workout for ${date} has changed. The updated FIT file is attached.`,
    held: `Your workout for ${date} is on hold. No workout file is attached.`,
    cancelled: `Your workout for ${date} has been cancelled. No workout file is attached.`,
  };
  const greeting = es ? "¡Hola!" : "Hi!";
  const intro = introductions[kind];
  const revisionLine = `${es ? "Revisión" : "Revision"}: ${revision}.`;
  const status = actionable
    ? es ? "Descarga lista. La transferencia a tu Garmin no está verificada." : "Download ready. Transfer to your Garmin has not been verified."
    : es ? "No hay un archivo FIT disponible para este aviso." : "No FIT file is available with this update.";
  const reviewLabel = actionable
    ? es ? "Abre el plan completo para consultar el gráfico del entrenamiento, los objetivos disponibles, la preparación y la guía de alimentación."
      : "Open the full plan for your workout graphic, available targets, preparation and fueling guidance."
    : es ? "Consulta el plan actual antes de entrenar." : "View the current plan before training.";
  const notice = kind === "revised"
    ? es ? "Los adjuntos de correos anteriores no se actualizan. Usa esta revisión tras consultar el plan actual. Si ya transferiste la versión anterior, puede que tengas que eliminarla manualmente del Garmin según tu modelo; JMM no la elimina."
      : "Older email attachments do not update. Use this revision after checking the current plan. If you already transferred the previous workout, you may need to delete it manually from your Garmin following your model’s instructions; JMM does not remove it."
    : !actionable
      ? es ? "No uses archivos anteriores de este entrenamiento. Revisa el plan actual para saber cómo continuar. Los archivos ya transferidos no se eliminan automáticamente del Garmin."
        : "Do not use older files for this workout. Check the current plan for what to do next. Files already transferred are not automatically removed from your Garmin."
      : "";
  const preparation = es
    ? "Antes de salir, revisa el material, la ruta y las condiciones locales; si hace calor, lleva líquidos adecuados y lo necesario para refrescarte. El tiempo local no se ha verificado para este correo. Si te apetece, dedica un minuto tranquilo a respirar o meditar para concentrarte."
    : "Before heading out, check your gear, route and local conditions; bring appropriate fluids and cooling supplies when it is hot. Local weather has not been verified for this email. If you like, take a quiet minute to breathe or meditate to focus.";
  const steps = es ? [
    "Guarda el FIT adjunto en tu ordenador. Comprueba que tu modelo Garmin admite archivos de entrenamiento y transferencia por USB.",
    "Conéctalo con un cable USB de datos. Sigue las instrucciones de tu modelo para copiar el archivo, normalmente a Garmin/NewFiles, y desconéctalo de forma segura.",
    "Busca el entrenamiento en tu Garmin y comprueba cada paso con el plan actual antes de empezar.",
  ] : [
    "Save the attached FIT file to your computer. Check that your Garmin model supports workout files and USB transfer.",
    "Connect it with a data-capable USB cable. Follow your model’s instructions to copy the file, usually to Garmin/NewFiles, then safely disconnect.",
    "Find the workout on your Garmin and check every step against the current plan before starting.",
  ];
  const caveat = es
    ? "Los pasos dependen del modelo y del sistema operativo. Algunos Garmin MTP no aparecen en el Finder de Mac y pueden requerir Windows. JMM no ha verificado la compatibilidad con tu modelo y firmware."
    : "Transfer steps depend on your model and operating system. Some MTP Garmin devices are not accessible in Mac Finder and may require Windows. JMM has not verified compatibility with your model and firmware.";
  const helpLabel = es ? "Guía de archivos de Garmin" : "Garmin file-transfer guide";
  const macLabel = es ? "Guía para Mac" : "Mac guidance";
  const settingsLabel = es ? "Gestiona o pausa estos correos" : "Manage or pause these emails";

  const paragraph = (value: string): string => `<p>${escapeHtml(value)}</p>`;
  const anchor = (label: string, url: string): string => `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>`;
  const planHtml: string[] = [];
  const planText: string[] = [];
  // Held/cancelled notices must never retain the prior workout or its graphic.
  const plan = actionable ? input.readyPlan : undefined;
  if (plan) {
    const section = (label: string, values: string[], ordered = false): void => {
      if (!values.length) return;
      const tag = ordered ? "ol" : "ul";
      planHtml.push(`<h2 style="font-size:18px">${escapeHtml(label)}</h2><${tag}>${values.map(value => `<li>${escapeHtml(value)}</li>`).join("")}</${tag}>`);
      planText.push(`${label}\n${values.map((value, index) => `${ordered ? `${index + 1}.` : "-"} ${value}`).join("\n")}`);
    };
    if (plan.summary) {
      planHtml.push(paragraph(plan.summary));
      planText.push(plan.summary);
    }
    if (plan.graphicCid) {
      if (!/^[A-Za-z0-9._@-]{1,200}$/.test(plan.graphicCid)) {
        throw new Error("Manual workout graphic requires a valid attachment content ID.");
      }
      const alt = plan.graphicAlt || (es ? "Gráfico del entrenamiento; los pasos se detallan abajo." : "Workout graphic; the steps are listed below.");
      planHtml.push(`<p><img src="cid:${escapeHtml(plan.graphicCid)}" alt="${escapeHtml(alt)}" style="display:block;width:100%;max-width:552px;height:auto"></p>`);
      planText.push(es ? "El gráfico está incluido en la versión HTML del correo. Los pasos se detallan a continuación." : "The workout graphic is included in the HTML email. The steps are listed below.");
    }
    section(es ? "Entrenamiento y objetivos" : "Workout and targets", plan.steps, true);
    section(es ? "Preparación" : "Preparation", plan.preparation);
    section(es ? "Antes: alimentación e hidratación" : "Before: fueling and hydration", plan.before);
    section(es ? "Durante: alimentación e hidratación" : "During: fueling and hydration", plan.during);
    section(es ? "Después: alimentación e hidratación" : "After: fueling and hydration", plan.after);
    section(es ? "Qué debes tener en cuenta" : "What to keep in mind", plan.limitations);
  }
  const html = [
    `<!doctype html><html lang="${es ? "es" : "en"}"><head><meta charset="utf-8"></head><body><main style="font-family:Arial,sans-serif;line-height:1.6;max-width:600px;margin:0 auto;color:#17202a;padding:24px">`,
    paragraph(greeting), paragraph(intro), paragraph(revisionLine), paragraph(status),
    `<p>${anchor(reviewLabel, links.workout)}</p>`,
    ...(notice ? [paragraph(notice)] : []),
    ...(actionable ? [
      ...planHtml,
      paragraph(preparation),
      `<ol>${steps.map(step => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`,
      paragraph(caveat),
      `<p>${anchor(helpLabel, MANUAL_GARMIN_FILE_HELP)} · ${anchor(macLabel, MANUAL_GARMIN_MAC_HELP)}</p>`,
    ] : []),
    `<p>${anchor(settingsLabel, links.settings)}</p>`, paragraph("JasMiamiMethod"),
    "</main></body></html>",
  ].join("\n");
  const text = [
    greeting, intro, revisionLine, status, `${reviewLabel}\n${links.workout}`,
    ...(notice ? [notice] : []),
    ...(actionable ? [...planText, preparation, steps.map((step, index) => `${index + 1}. ${step}`).join("\n"), caveat,
      `${helpLabel}: ${MANUAL_GARMIN_FILE_HELP}\n${macLabel}: ${MANUAL_GARMIN_MAC_HELP}`] : []),
    `${settingsLabel}: ${links.settings}`, "JasMiamiMethod",
  ].join("\n\n");
  return { subject: `${subjects[kind]} · ${date}`, html, text };
}
