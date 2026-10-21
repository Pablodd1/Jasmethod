/**
 * Upper bound of zone z1..z7 as a fraction of the athlete's anchor (index 0 is unused).
 * One definition shared by plan targets (canonical-session.ts) and stream analysis (stream-analysis.ts), so a
 * planned "Z4" and an analysed "Z4" mean the same thing. Anchors are the athlete's own FTP / lactate-threshold
 * heart rate; when an anchor is unknown, no zone is computed (never defaulted).
 */
export const POWER_ZONE_UPPER_FACTORS = [0, .55, .75, .9, 1.05, 1.2, 1.5, 1.5] as const;
export const HR_ZONE_UPPER_FACTORS = [0, .8, .89, .94, 1, 1.05, 1.1, 1.1] as const;

/** 1..7, or null when the anchor is missing/invalid or the value is not a finite number. */
export function zoneOf(value: number | null | undefined, anchor: number | null | undefined, factors: readonly number[]): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || typeof anchor !== "number" || !Number.isFinite(anchor) || anchor <= 0) return null;
  for (let z = 1; z <= 6; z++) if (value <= anchor * factors[z]) return z;
  return 7;
}
