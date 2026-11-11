import { prescriptionSteps } from "./prescription-steps";

const validZone = (zone: unknown) => typeof zone === "string" && /^z[1-7]$/.test(zone);
const easy = (zone: unknown) => zone === "z1" || zone === "z2";

type PlannedRow = {
  sport?: string;
  type?: string;
  intensity?: string | null;
  durationMin?: number | null;
  planned?: boolean;
  prescription?: unknown;
};

/** Planned aerobic effort only. Distance-based durations remain estimates in the prescription. */
export function plannedAerobicDistribution(rows: readonly PlannedRow[]) {
  const aerobic = rows.filter(row => row.planned !== false &&
    ["run", "bike", "swim", "brick"].includes(row.sport ?? "") && !["strength", "plyo"].includes(row.type ?? ""));
  let totalMinutes = 0;
  let easyMinutes = 0;
  let incomplete = false;
  for (const row of aerobic) {
    if (row.prescription != null) {
      let saved: unknown = row.prescription;
      if (typeof saved === "string") {
        try { saved = JSON.parse(saved); } catch { saved = null; }
      }
      const structure = (saved as { sportStructure?: { kind?: string; components?: unknown[] } } | null)?.sportStructure;
      const steps = row.sport === "brick"
        ? structure?.kind === "brick" && Array.isArray(structure.components)
          ? structure.components.flatMap(component => prescriptionSteps(component) ?? [null])
          : null
        : prescriptionSteps(saved);
      if (!steps?.length || steps.some(step => !step || !validZone(step.zone) || !Number.isFinite(step.seconds) || step.seconds <= 0)) {
        incomplete = true;
        continue;
      }
      for (const step of steps) {
        if (!step) continue;
        totalMinutes += step.seconds / 60;
        if (easy(step.zone)) easyMinutes += step.seconds / 60;
      }
    } else if (row.sport !== "brick" && typeof row.durationMin === "number" &&
      Number.isFinite(row.durationMin) && row.durationMin >= 0 && validZone(row.intensity)) {
      totalMinutes += row.durationMin;
      if (easy(row.intensity)) easyMinutes += row.durationMin;
    } else {
      incomplete = true;
    }
  }
  return { totalMinutes, easyMinutes, easyPct: incomplete || !totalMinutes ? null : Math.round(easyMinutes / totalMinutes * 100), sessionCount: aerobic.length };
}
