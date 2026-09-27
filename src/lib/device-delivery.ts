// Export availability is distinct from provider publication and device receipt.
export type WatchPlatform = "garmin" | "apple" | "coros" | "other";
export interface DeliveryGuide {
  platform: WatchPlatform;
  label: string;
  steps: string[];
  file: "garmin-json" | "fit";
}
export function deliveryGuideFor(platform: WatchPlatform, lang: "en" | "es" = "en"): DeliveryGuide {
  const es = lang === "es";
  const labels = { garmin: "Garmin", apple: "Apple Watch", coros: "COROS", other: es ? "Otro dispositivo" : "Other device" };
  const requirements = {
    garmin: es ? "La entrega automática requiere una integración aprobada con Garmin Training API; aún no está implementada." : "Automatic delivery requires an approved Garmin Training API integration; it is not implemented yet.",
    coros: es ? "La entrega automática requiere una integración aprobada con COROS; aún no está implementada." : "Automatic delivery requires an approved COROS integration; it is not implemented yet.",
    apple: es ? "La programación nativa requiere una app con WorkoutKit; JMM web no tiene esa integración." : "Native workout scheduling requires an app with WorkoutKit; JMM web does not have that integration.",
    other: es ? "Consulta las funciones de importación de tu app y dispositivo." : "Check your app and device's supported import capabilities.",
  };
  return { platform, label: labels[platform], file: "fit", steps: [
    requirements[platform],
    es ? "Puedes descargar el archivo FIT. La descarga o la hoja de compartir no confirma recepción en el reloj." : "You can download the FIT file. A download or share sheet does not confirm receipt on the watch.",
    es ? "La compatibilidad de importación debe comprobarse para tu app, versión y dispositivo. Revisa cada paso y objetivo antes de entrenar." : "Import compatibility must be checked for your app, version and device. Review every step and target before training.",
  ] };
}
export function allDeliveryGuides(lang: "en" | "es" = "en"): DeliveryGuide[] {
  return (["garmin", "apple", "coros"] as WatchPlatform[]).map(p => deliveryGuideFor(p, lang));
}
