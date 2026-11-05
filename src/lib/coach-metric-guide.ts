/** Review cues for the Coaching Desk. These are never inputs to prescriptions. */
const sources = {
  aerobic: { label: "Helgerud et al. · controlled aerobic interval trial", url: "https://pubmed.ncbi.nlm.nih.gov/17414804/" },
  cycling: { label: "Seiler et al. · cycling intervals", url: "https://pubmed.ncbi.nlm.nih.gov/21812820/" },
  swim: { label: "Stroke-specific critical speed study", url: "https://pubmed.ncbi.nlm.nih.gov/38380294/" },
  triathlon: { label: "Röhrken et al. · triathlon pilot", url: "https://doi.org/10.3389/fphys.2020.534688" },
  sprint: { label: "Chen et al. · acute sprint study", url: "https://pubmed.ncbi.nlm.nih.gov/40873761/" },
  strength: { label: "Currier et al. · resistance training review", url: "https://pubmed.ncbi.nlm.nih.gov/37414459/" },
  hyrox: { label: "Brandt et al. · HYROX simulation", url: "https://doi.org/10.3389/fphys.2025.1519240" },
};

type Guide = { title: string; review: string; when: string; limit: string; source?: typeof sources.aerobic };
export const coachMetricGuides: Record<"run" | "bike" | "swim" | "triathlon" | "track" | "strength" | "hyrox" | "boxing", Guide> = {
  run: { title: "Distance running", review: "Actual minutes, distance, pace and session effort. Compare a dated result on a similar course or surface.",
    when: "Use pace at comparable effort for endurance review. For an aerobic power block, track interval execution and a comparable test result.",
    limit: "Heat, hills and terrain affect pace. A field result can inform a pace estimate. Measured VO₂max requires a test with gas exchange.", source: sources.aerobic },
  bike: { title: "Cycling", review: "Actual minutes, watts, cadence and effort. Compare power at the same duration and with a comparable meter and setup.",
    when: "Review sustained power for endurance or threshold work. Inspect repeat power and recovery for intervals, and short-duration power for sprints.",
    limit: "Speed depends on terrain, wind and equipment. FTP, critical power and peak sprint power describe different efforts.", source: sources.cycling },
  swim: { title: "Swimming", review: "Distance, split pace, stroke, pool length and rest between repetitions. Keep open-water observations separate.",
    when: "Use comparable pool sets to review endurance. Use a dated, stroke-matched CSS reference when prescribing pace for sustained sets.",
    limit: "Pool length, stroke and rest change comparisons. CSS is a field reference.", source: sources.swim },
  triathlon: { title: "Triathlon", review: "Review swim, bike and run separately. Where recorded, compare transition times and running off the bike with comparable brick sessions.",
    when: "Use the relevant discipline's reference for each session. Review combined load and recovery when disciplines share a day.",
    limit: "The triathlon evidence includes small pilot studies. Keep overall finish time separate from leg performance and conditions.", source: sources.triathlon },
  track: { title: "Track sprint", review: "Record start type, timed distance, split time, timing method and recovery. Review acceleration, flying speed and speed endurance separately.",
    when: "Use matched timing and conditions during speed sessions. Review technique and rep quality before considering progression.",
    limit: "Sprint studies are often small and specific to the tested athletes and drills. Average HR and endurance pace do not describe peak speed.", source: sources.sprint },
  strength: { title: "Strength and power", review: "Record exercise, load, sets, repetitions and repetitions in reserve. Record velocity or jump output only when measured.",
    when: "Compare the same movement and technique during strength blocks. Review load, rep quality and recovery separately when strength supports another sport.",
    limit: "Session effort describes the overall demand. It cannot establish exercise load, mechanical power or a one-repetition maximum.", source: sources.strength },
  hyrox: { title: "HYROX", review: "Track run and station splits, transitions, station loads and valid reps. Compare the same division and equipment.",
    when: "Review how run pace changes after stations and which station limits execution in a comparable session.",
    limit: "The cited simulation was small and observational. Competition loads and splits provide context for review.", source: sources.hyrox },
  boxing: { title: "Boxing", review: "Review the recorded activity and coach notes.",
    when: "Use qualified sport-specific review for technical work and contact exposure.",
    limit: "JMM’s boxing-specific metrics and contact progression are outside this evidence review." },
};

export function coachMetricFocus(goal?: string | null): keyof typeof coachMetricGuides | "" {
  if (["triathlon", "sprint", "olympic", "half", "full"].includes(goal ?? "")) return "triathlon";
  if (["run-only", "5k", "10k", "half-marathon", "marathon"].includes(goal ?? "")) return "run";
  if (goal === "track-sprint") return "track";
  if (goal === "cycle") return "bike";
  if (goal === "swim-only") return "swim";
  if (goal === "hyrox" || goal === "strength" || goal === "boxing") return goal;
  return "";
}
