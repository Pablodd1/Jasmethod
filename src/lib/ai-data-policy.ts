/** Fail closed at every image boundary. Consent does not grant provider data rights. */
export const SCREENSHOT_SOURCES = ["manual_note", "device", "imported", "unknown"] as const;
export type ScreenshotSource = typeof SCREENSHOT_SOURCES[number];
export const AI_DATA_POLICY_VERSION = "openai-generic-education-v3";
export function screenshotSourceAllowed(source: unknown): source is "manual_note" {
  return source === "manual_note";
}
export function assertScreenshotSource(source: unknown) {
  if (!screenshotSourceAllowed(source)) throw Error("Device-derived, imported and unknown-origin screenshots cannot be sent to OpenAI. Use local training review or manual entry instead.");
}
/** No profile, session, check-in, import, free text, summaries or memory can cross this boundary. */
export function genericExternalContext(language: unknown) {
  return { version: AI_DATA_POLICY_VERSION, language: language === "es" ? "es" as const : "en" as const };
}
export function historySafeLocalReply(answer: string, language: unknown, contextWasRead: boolean) {
  return contextWasRead ? language === "es"
    ? "Se revisó el contexto solo dentro de JMM. No se conserva un resumen de datos de entrenamiento o dispositivos en el chat. Revisa Hoy y tu plan para ver los registros originales."
    : "Context was reviewed only inside JMM. Training/device summaries are not retained in chat. Review Today and your plan for the original records." : answer;
}
