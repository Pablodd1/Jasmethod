// JasMiamiMethod — Device delivery guide (platform-aware, research-verified)
//
// The truth about structured-workout delivery from a web app (2026):
//  • Garmin: Connect web imports its OWN JSON (Training → Workouts → Import);
//    FIT/TCX are activity-only formats. → /api/workout/garmin-json is the path.
//  • Apple Watch: NO import from web. Native WorkoutKit needs a watchOS app
//    (future). Today's working path: save the .FIT and open it in a
//    compatible watch app (WorkOutDoors-style apps load structured .FIT).
//  • COROS: no public workout-import API (TrainingPeaks-style push is
//    partner-gated). Working path: .FIT via compatible apps / Training Hub
//    manual create.
// We never claim "on your watch" — import is verifiable, device sync is not.

export type WatchPlatform = "garmin" | "apple" | "coros" | "other";

export interface DeliveryGuide {
  platform: WatchPlatform;
  label: string;
  steps: string[];
  file: "garmin-json" | "fit";
}

export function deliveryGuideFor(platform: WatchPlatform, lang: "en" | "es" = "en"): DeliveryGuide {
  const es = lang === "es";
  switch (platform) {
    case "garmin":
      return {
        platform,
        label: "Garmin",
        file: "garmin-json",
        steps: es
          ? [
              "Toca «Enviar a Garmin» — se descarga el archivo JSON del entrenamiento.",
              "Abre connect.garmin.com → Entrenamiento → Entrenamientos → Importar y sube el archivo.",
              "Selecciona el entrenamiento → «Enviar al dispositivo» → sincroniza el reloj. Avisos por paso activados.",
            ]
          : [
              "Tap “Send to Garmin” — the workout JSON downloads.",
              "Open connect.garmin.com → Training → Workouts → Import Workout and upload the file.",
              "Select the workout → “Send to Device” → sync your watch. Per-step alerts are on.",
            ],
      };
    case "apple":
      return {
        platform,
        label: "Apple Watch",
        file: "fit",
        steps: es
          ? [
              "Toca «Compartir .FIT» → Guardar en Archivos.",
              "Abre una app de entrenamiento compatible con .FIT estructurado (p. ej. WorkOutDoors) e importa el archivo.",
              "Inicia el entrenamiento desde la app del reloj — pasos y zonas se muestran en la muñeca.",
              "El Apple Watch no importa entrenamientos desde la web directamente; una app compatible es el camino que existe hoy.",
            ]
          : [
              "Tap “Share .FIT” → Save to Files.",
              "Open a watch app that loads structured .FIT workouts (e.g. WorkOutDoors) and import the file.",
              "Start the workout from the watch app — steps and zones appear on your wrist.",
              "Apple Watch can't import workouts from the web directly; a compatible app is today's working path.",
            ],
      };
    case "coros":
      return {
        platform,
        label: "COROS",
        file: "fit",
        steps: es
          ? [
              "Toca «Compartir .FIT» → Guardar en Archivos o comparte con tu app compatible.",
              "En COROS Training Hub puedes recrear la estructura (intervalos/zonas de la tarjeta de Hoy) o usar una app que importe .FIT.",
              "Sincroniza la app COROS con el reloj para ver el entrenamiento.",
            ]
          : [
              "Tap “Share .FIT” → Save to Files or share with your compatible app.",
              "In COROS Training Hub you can recreate the structure (intervals/zones from the Today card) or use an app that imports .FIT.",
              "Sync the COROS app with your watch to see the workout.",
            ],
      };
    default:
      return {
        platform,
        label: es ? "Otro dispositivo" : "Other device",
        file: "fit",
        steps: es
          ? [
              "Comparte el .FIT con cualquier app que importe entrenamientos estructurados.",
              "Los pasos, zonas y avisos van incluidos en el archivo.",
            ]
          : [
              "Share the .FIT with any app that imports structured workouts.",
              "Steps, zones and alerts are included in the file.",
            ],
      };
  }
}

export function allDeliveryGuides(lang: "en" | "es" = "en"): DeliveryGuide[] {
  return (["garmin", "apple", "coros"] as WatchPlatform[]).map((p) =>
    deliveryGuideFor(p, lang),
  );
}
