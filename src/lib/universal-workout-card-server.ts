import type { CanonicalSession } from "./canonical-session";
import type { SessionNutrition } from "./session-nutrition";
import type { UniversalWorkoutCard } from "./universal-workout-card";
import { manualWorkoutEmailContent } from "./manual-workout-email-content";

// Presentation projection, never a second prescription or a physiology engine.
export function buildUniversalWorkoutCard(
  session: CanonicalSession,
  nutrition: SessionNutrition,
  language: "en" | "es" = "en",
  startTime: string | null = null,
): UniversalWorkoutCard {
  const es = language === "es";
  const held = es
    ? "Sesión en pausa: consulta el check-in y el plan vigente."
    : "Session held: review the current check-in and plan.";
  const content =
    session.verdict === "ready"
      ? manualWorkoutEmailContent(
          session,
          nutrition,
          startTime,
          false,
          language,
        ).plan
      : {
          summary: held,
          steps: [],
          before: [held],
          during: [held],
          after: [
            es
              ? "Comidas habituales y líquidos según la sed."
              : "Ordinary meals and fluids according to thirst.",
          ],
          preparation: [session.reason],
          limitations: [session.reason],
        };
  return {
    schemaVersion: "jmm-workout-card-v1",
    language,
    session,
    nutrition: session.verdict === "ready" ? nutrition : null,
    content,
    breathing: {
      beforeSeconds: 120,
      afterSeconds: 300,
      inhaleSeconds: 4,
      exhaleSeconds: 6,
      instructions: es
        ? "Antes: pausa opcional de 2 min. Entre esfuerzos: respiración natural. Después: 4–5 min cómodos; inspira 4 s y espira 6 s si resulta cómodo. Sin retenciones; detente si hay mareo."
        : "Before: optional 2-minute pause. Between efforts: natural breathing. After: 4–5 comfortable minutes; inhale 4 seconds and exhale 6 seconds if comfortable. No breath holds; stop if dizzy.",
      limitation: es
        ? "Puede apoyar la relajación y la regulación autonómica a corto plazo. No garantiza recuperación muscular más rápida."
        : "May support relaxation and short-term autonomic regulation. Does not guarantee faster muscle recovery.",
    },
  };
}
