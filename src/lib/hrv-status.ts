// JasMiamiMethod — HRV status categorical layer (PR 0 hotfix).
//
// The contradiction: hrvReadiness() gives normal HRV a score of ~50,
// fallbackBriefing() treats <55 as RED. A normal reading produced a red day.
//
// Fix: hrvStatus is a categorical interpretation (high | normal | low |
// insufficient) that constrains the downstream day-type mapping. The numeric
// score stays unchanged for display and backward compatibility. The status —
// not the score — drives whether HRV alone can produce a red day.
//
// hrvDayType() maps hrvStatus to a safe day-type constraint:
//   high → "green"      (recovery is good, normal session is fine)
//   normal → "neutral"  (HRV alone never makes it a red or green day)
//   low → "caution"     (HRV alone flags a caution but doesn't mandate rest)
//   insufficient → "unknown" (not enough data — never = poor readiness)

export type HrvStatus = "high" | "normal" | "low" | "insufficient";
export type HrvDayType = "green" | "neutral" | "caution" | "unknown";

export function hrvDayType(status: HrvStatus | string): HrvDayType {
  switch (status) {
    case "high": return "green";
    case "normal": return "neutral";
    case "low": return "caution";
    case "insufficient": return "unknown";
    default: return "unknown";
  }
}

// Used by the coach fallback and Today page to constrain the day interpretation.
// HRV is one contextual signal — it can add caution but never alone mandate rest
// or justify increasing intensity.
export function hrvContextualNote(status: HrvStatus | string, es: boolean): string {
  const esMap: Record<string, string> = {
    high: "VFC elevada — recuperación buena, día normal de entreno.",
    normal: "VFC en rango normal — procede con la sesión planificada.",
    low: "VFC baja — ten precaución, el entreno duro puede esperar un día.",
    insufficient: "Datos de VFC insuficientes — se necesitan al menos 3 días para una lectura fiable.",
  };
  const enMap: Record<string, string> = {
    high: "HRV elevated — recovery is good, normal training day.",
    normal: "HRV in normal range — proceed with the planned session.",
    low: "HRV low — exercise caution, hard training can wait a day.",
    insufficient: "Insufficient HRV data — at least 3 days needed for a reliable reading.",
  };
  const map = es ? esMap : enMap;
  return map[status] || map[status as string] || map["insufficient"];
}
