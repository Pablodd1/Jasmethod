// File export, provider publication and watch receipt are different states.
export type WatchPlatform = "garmin" | "apple" | "coros" | "other";
export interface DeliveryGuide {
  platform: WatchPlatform;
  label: string;
  steps: string[];
  file: "fit";
  helpUrl?: string;
  helpLabel?: string;
}
export const GARMIN_WORKOUT_HELP = "https://support.garmin.com/en-US/?faq=lLvhWrmlMv0vGmyGpWjOX6";
export function deliveryGuideFor(platform: WatchPlatform, lang: "en" | "es" = "en"): DeliveryGuide {
  const es = lang === "es";
  const labels = { garmin: "Garmin", apple: "Apple Watch", coros: "COROS", other: es ? "Otro dispositivo" : "Other device" };
  const common = es ? [
    "La descarga no confirma recepción en el reloj. La compatibilidad con tu modelo y firmware aún no está verificada por JMM.",
    "Comprueba cada paso, objetivo y transición en el dispositivo antes de entrenar. Las instrucciones completas siguen disponibles en JMM.",
  ] : [
    "Downloading does not confirm watch receipt. JMM has not verified compatibility with your model and firmware.",
    "Check every step, target and transition on the device before training. Full instructions remain available in JMM.",
  ];
  const manual = es ? [
    "Consulta la guía oficial de compatibilidad y el manual de tu modelo. En dispositivos compatibles con acceso a archivos, descarga el entrenamiento FIT.",
    "Conecta el Garmin a un ordenador con un cable USB de datos y copia el FIT a la carpeta Garmin/NewFiles. Expulsa y desconecta de forma segura.",
    "En el reloj, abre el perfil de actividad correspondiente y Entrenamiento / Sesiones / Biblioteca de entrenamientos. Los menús y el soporte varían por modelo.",
    "Algunos Garmin con música/MTP tienen limitaciones de acceso desde Mac y requieren Windows. No todos aparecen en Finder. No se garantiza una ruta solo móvil ni colocación en el calendario de Garmin Connect.",
  ] : [
    "Check the official compatibility guide and your model's manual. For a compatible device with supported file access, download the workout FIT.",
    "Connect the Garmin to a computer with a data-capable USB cable and copy the FIT to Garmin/NewFiles. Safely eject and disconnect.",
    "On the watch, open the corresponding activity profile, then Training / Workouts / Workout Library. Menu names and support vary by model.",
    "Some music/MTP Garmin devices have Mac file-access limitations and require Windows. Not every watch appears in Finder. A mobile-only transfer or Garmin Connect calendar placement is not guaranteed.",
  ];
  return {
    platform, label: labels[platform], file: "fit",
    steps: [...(platform === "garmin" ? manual : [es ? "JMM no tiene entrega nativa verificada para este dispositivo. Consulta la importación compatible de tu app y modelo; la guía web no requiere reloj." : "JMM has no verified native delivery for this device. Check your app and model's supported imports; the web plan needs no watch."]), ...common],
    ...(platform === "garmin" ? { helpUrl: GARMIN_WORKOUT_HELP, helpLabel: es ? "Guía oficial de compatibilidad Garmin" : "Official Garmin workout compatibility guide" } : {}),
  };
}
export function allDeliveryGuides(lang: "en" | "es" = "en"): DeliveryGuide[] {
  return (["garmin", "apple", "coros"] as WatchPlatform[]).map(p => deliveryGuideFor(p, lang));
}
