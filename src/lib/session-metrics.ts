import type { CanonicalStep } from "./canonical-session";

type MetricStep = Pick<CanonicalStep, "endpoint" | "target" | "componentSport">;

export function targetReferenceSource(source: string, es = false): string {
  if (source === "athlete_reported_reference") return es ? "Referencia declarada" : "Athlete-reported reference";
  if (source === "applied_field_test") return es ? "Prueba de campo aplicada" : "Applied field test";
  if (source === "estimated_from_applied_5k") return es ? "Estimación de una prueba de 5 km" : "Estimate from a 5 km test";
  return es ? "Referencia" : "Reference";
}

/** Planned mechanical work, not measured activity work or metabolic calories.
 * Only exact timed power steps qualify. Unknown time/effort is never zero work.
 */
export function plannedMechanicalWork(steps: MetricStep[], sport: string): { lowKj: number; highKj: number } | null {
  if (!steps.length) return null;
  let low = 0, high = 0, counted = false;
  for (const step of steps) {
    if ((step.componentSport ?? sport) !== "bike") {
      // A whole-session value would omit another leg's unknown work.
      return null;
    }
    const { endpoint, target } = step;
    if (endpoint.type !== "time" || !Number.isFinite(endpoint.seconds) || endpoint.seconds <= 0 ||
        target.type !== "power" || !Number.isFinite(target.low) || !Number.isFinite(target.high) ||
        target.low! < 0 || target.high! <= 0 || target.low! > target.high!) return null;
    low += target.low! * endpoint.seconds / 1000;
    high += target.high! * endpoint.seconds / 1000;
    counted = true;
  }
  return counted ? { lowKj: low, highKj: high } : null;
}

/** Canonical pace is sec/km; canonical speed is m/s. No watt/HR→speed inference. */
export function targetSpeedLabel(target: CanonicalStep["target"], units: "metric" | "imperial" = "metric"): string | null {
  if (!["pace", "speed"].includes(target.type) || !Number.isFinite(target.low) || !Number.isFinite(target.high) ||
      target.low! <= 0 || target.high! < target.low!) return null;
  const factor = units === "imperial" ? 1 / 1.609344 : 1;
  const low = (target.type === "pace" ? 3600 / target.high! : target.low! * 3.6) * factor;
  const high = (target.type === "pace" ? 3600 / target.low! : target.high! * 3.6) * factor;
  return `${low.toFixed(1)}${Math.abs(high - low) < .0001 ? "" : `–${high.toFixed(1)}`} ${units === "imperial" ? "mph" : "km/h"}`;
}

export function plannedWorkLabel(steps: MetricStep[], sport: string, es = false): string | null {
  const work = plannedMechanicalWork(steps, sport);
  if (!work) return null;
  // Outward rounding keeps the displayed range conservative.
  const low = Math.floor(work.lowKj), high = Math.ceil(work.highKj);
  return `${es ? "Trabajo mecánico previsto" : "Planned mechanical work"}: ${low}${low === high ? "" : `–${high}`} kJ`;
}
