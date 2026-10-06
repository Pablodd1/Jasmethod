// HYROX scenario calculator: allocations are illustrative, not validated predictions.
export interface SplitSegment { n: number; kind: "run" | "station"; key: string; name: string; targetSec: number; cumulativeSec: number }
export interface SplitPlan { targetTotalMin: number; runPaceSecPerKm: number; runsTotalSec: number; stationsTotalSec: number; transitionsTotalSec: number; segments: SplitSegment[]; notes: string[] }
const STATIONS = [
  ["ski", "SkiErg", 3.4], ["sledpush", "Sled Push", 2.4], ["sledpull", "Sled Pull", 3], ["burpee", "Burpee Broad Jumps", 6],
  ["row", "Rowing", 3.8], ["farmers", "Farmers Carry", 1.7], ["lunges", "Sandbag Lunges", 4.4], ["wallball", "Wall Balls", 5.3],
] as const;
const fmt = (sec: number) => { const rounded = Math.round(sec); return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`; };
/** Shared by GET and POST. A threshold is an explicitly labelled scenario anchor, not an inferred HYROX race pace. */
export function resolveHyroxPace(input: unknown, profilePace: number | null | undefined) {
  if (input !== undefined && input !== null && input !== "") {
    if ((typeof input !== "number" && typeof input !== "string") || !String(input).trim()) throw new Error("Enter a positive running pace in seconds per kilometre.");
    const pace = Number(input);
    if (!Number.isFinite(pace) || pace <= 0) throw new Error("Enter a positive running pace in seconds per kilometre.");
    return { pace, source: "entered" as const };
  }
  if (profilePace != null && Number.isFinite(profilePace) && profilePace > 0) return { pace: profilePace, source: "profile_threshold_scenario" as const };
  throw new Error("No running pace is available. Enter a practiced pace in seconds per kilometre; no device is required.");
}
export function planHyroxSplits(opts: { targetTotalMin: number; runPaceSecPerKm: number; sex?: "male" | "female"; pro?: boolean }): SplitPlan {
  const { targetTotalMin, runPaceSecPerKm, sex = "male", pro = false } = opts;
  if (!Number.isFinite(targetTotalMin) || targetTotalMin <= 0 || !Number.isFinite(runPaceSecPerKm) || runPaceSecPerKm <= 0) throw new Error("Enter a positive target and running pace.");
  const targetSec = Math.round(targetTotalMin * 60), runSec = Math.round(runPaceSecPerKm), runsTotalSec = runSec * 8, transitionsTotalSec = 96;
  const stationsTotalSec = targetSec - runsTotalSec - transitionsTotalSec;
  if (runSec < 1 || stationsTotalSec < 360) throw new Error("Target leaves less than six minutes for eight stations after running and transitions. Increase the target or revise the pace. This calculator cannot confirm race feasibility.");
  const weightSum = STATIONS.reduce((sum, s) => sum + s[2], 0);
  const segments: SplitSegment[] = []; let cumulative = 0, allocated = 0;
  STATIONS.forEach(([key, name, weight], i) => {
    cumulative += runSec + 6;
    segments.push({ n: i * 2 + 1, kind: "run", key: `run${i + 1}`, name: `Run ${i + 1} (1km)`, targetSec: runSec, cumulativeSec: cumulative });
    const stationSec = i === 7 ? stationsTotalSec - allocated : Math.round(stationsTotalSec * weight / weightSum);
    allocated += stationSec; cumulative += stationSec + 6;
    segments.push({ n: i * 2 + 2, kind: "station", key, name, targetSec: stationSec, cumulativeSec: cumulative });
  });
  return {
targetTotalMin: targetSec / 60, runPaceSecPerKm: runSec, runsTotalSec, stationsTotalSec, transitionsTotalSec, segments, notes: [
      `Runs: ${fmt(runsTotalSec)} (${fmt(runSec)}/km) · stations: ${fmt(stationsTotalSec)} · transitions: ${fmt(transitionsTotalSec)}.`,
      `${sex === "female" ? "Women" : "Men"} ${pro ? "Pro" : "Open"}: scenario only. Station allocations are illustrative, not measured division norms or a validated finish prediction. Division changes do not invent performance adjustments.`,
      "Transitions use a 96-second scenario allowance; checkpoint times include it. Verify against your venue and experience. No heart-rate target is inferred: use an individually reviewed anchor or perceived effort. No device is required.",
    ]
};
}
export interface StationGap { key: string; name: string; actualSec: number; targetSec: number; deltaSec: number; pctOfTotalLoss: number; advice: string }
export interface SplitAnalysis { planTotalSec: number; actualTotalSec: number; totalDeltaSec: number; stationGaps: StationGap[]; runGaps: StationGap[]; weakest: string; summary: string }
export function analyzeHyroxSplits(plan: SplitPlan, actualSecs: (number | null)[]): SplitAnalysis {
  if (actualSecs.length !== plan.segments.length || actualSecs.some(v => v !== null && (!Number.isFinite(v) || v <= 0))) throw new Error("Provide 16 positive split times or null for missing splits.");
  const logged = plan.segments.flatMap((seg, i) => actualSecs[i] == null ? [] : [{ seg, actual: actualSecs[i] as number }]);
  const planTotalSec = logged.reduce((sum, x) => sum + x.seg.targetSec, 0), actualTotalSec = logged.reduce((sum, x) => sum + x.actual, 0), totalDeltaSec = actualTotalSec - planTotalSec;
  const gaps = logged.map(({ seg, actual }) => ({ key: seg.key, name: seg.name, actualSec: actual, targetSec: seg.targetSec, deltaSec: actual - seg.targetSec, pctOfTotalLoss: 0, advice: seg.kind === "station" ? `Review ${seg.name.toLowerCase()} technique, pacing, equipment and conditions with your coach before choosing training changes.` : "", kind: seg.kind }));
  const loss = gaps.reduce((sum, g) => sum + Math.max(0, g.deltaSec), 0);
  gaps.forEach(g => { g.pctOfTotalLoss = loss ? Math.round(Math.max(0, g.deltaSec) / loss * 100) : 0 });
  const chronologicalRuns = gaps.filter(g => g.kind === "run");
  const runFade = chronologicalRuns.length === 8 && chronologicalRuns[7].deltaSec - chronologicalRuns[0].deltaSec > 25;
  const stationGaps = gaps.filter(g => g.kind === "station").sort((a, b) => b.deltaSec - a.deltaSec), runGaps = chronologicalRuns.slice().sort((a, b) => b.deltaSec - a.deltaSec);
  const worst = stationGaps.find(g => g.deltaSec > 0);
  const summary = !logged.length ? "No splits logged yet." : `Compared ${logged.length}/16 logged segments: ${fmt(actualTotalSec)} vs scenario ${fmt(planTotalSec)}. Transitions excluded; this is not a finish-time comparison. ${worst ? "Largest station overrun: " + worst.name + " (+" + worst.deltaSec + "s)." : "No logged station exceeded its scenario allocation."} ${runFade ? "The last run was slower relative to target than the first; review pacing and station fatigue." : ""}`;
  return { planTotalSec, actualTotalSec, totalDeltaSec, stationGaps, runGaps, weakest: worst?.name || "", summary };
}
