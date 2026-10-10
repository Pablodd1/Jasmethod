/** Synthetic, review-only examples. This module is intentionally not imported by
 * production plan generation. Evidence supports principles, not these doses.
 * Editing or copying an example never grants permission to prescribe it. */
import { addDaysKey } from "./dates";
import type { Sport } from "./science";

export const CYCLE_SAMPLE_VERSION = "2026-10-10-review-only-v1";
export const CYCLE_SAMPLE_EVIDENCE = "docs/research/2026-10-07/training-evidence.md";
export type SampleGoal = "sprint" | "olympic" | "half" | "full" | "run-only" | "track-sprint" | "cycle" | "swim-only" | "hyrox" | "general-strength";
export type SampleFamily = "triathlon" | "distance-running" | "track-sprint" | "cycling" | "swimming" | "hyrox" | "general-strength";
export type SampleEndpoint = { type: "time"; seconds: number } | { type: "distance"; meters: number };
export interface ReviewedSampleStep {
  name: string;
  phase: "warmup" | "active" | "recovery" | "cooldown";
  sport: Sport;
  endpoint: SampleEndpoint;
  target: { type: "open"; instruction: string };
}
export interface ReviewedSampleSession {
  id: string; daySlot: number; title: string; sport: Sport;
  purpose: string; budgetMinutes: number;
  steps: ReviewedSampleStep[];
  stop: string;
  provenance: { doseOrigin: "jmm_coaching_heuristic"; sourceIds: string[]; trialReplication: false };
}
export interface SampleBaseline {
  sport: Sport;
  source: "synthetic_fixture";
  observedAt: string;
  protocol: string;
  observations: Record<string, number | string>;
  interpretation: string;
  nextReviewAfterDays: 28;
  reviewRule: "coaching_heuristic";
}
export interface ReviewedCycleSample {
  id: string; goal: SampleGoal; family: SampleFamily; title: string;
  review: { status: "review_only"; reviewedAt: string; scope: "engineering_and_evidence_scope"; qualifiedCoachApproval: false; automaticPrescription: false };
  support: "supported_goal_example" | "partial_supporting_strength";
  population: string; prerequisites: string[]; limitations: string[];
  startKey: string; baselineWeeklyMinutes: number; baselines: SampleBaseline[];
  event: { name: string; dateKey: string; priority: "A"; source: "synthetic_fixture" } | null;
  weeks: { week: number; startKey: string; theme: string; reviewRequired: boolean; sessions: ReviewedSampleSession[]; restDaySlots: number[] }[];
}

const START = "2026-10-12";
const STOP = "Stop for pain, illness, unusual symptoms, deteriorating technique or unsafe conditions. Reduce or omit unfinished work; never make it up later.";
const EASY = "Comfortable, conversational effort; pace/HR is not inferred from a goal or another sport.";
const CONTROLLED = "Controlled repeatable effort, about 5/10. Reduce if form or repeatability deteriorates; this RPE is a coaching cue, not a measured physiological zone.";
const time = (name: string, minutes: number, phase: ReviewedSampleStep["phase"], sport: Sport, instruction = EASY): ReviewedSampleStep =>
  ({ name, phase, sport, endpoint: { type: "time", seconds: minutes * 60 }, target: { type: "open", instruction } });
const distance = (name: string, meters: number, phase: ReviewedSampleStep["phase"], sport: Sport, instruction: string): ReviewedSampleStep =>
  ({ name, phase, sport, endpoint: { type: "distance", meters }, target: { type: "open", instruction } });

/** Recomputed from edited endpoints, not a stored prose total. Distance work has
 * unknown elapsed time; the session budget must never be advertised as measured
 * or exact time. Rest is present only between repetitions, never added twice. */
export function reviewedSampleTotals(session: Pick<ReviewedSampleSession, "steps" | "budgetMinutes">) {
  let timedSeconds = 0, distanceMeters = 0, workSeconds = 0, recoverySeconds = 0;
  for (const step of session.steps) {
    const value = step.endpoint.type === "time" ? step.endpoint.seconds : step.endpoint.meters;
    if (!Number.isFinite(value) || value <= 0) throw new Error("Sample endpoints must be positive finite values");
    if (step.endpoint.type === "distance") distanceMeters += value;
    else {
      timedSeconds += value;
      if (step.phase === "active") workSeconds += value;
      if (step.phase === "recovery") recoverySeconds += value;
    }
  }
  if (!Number.isFinite(session.budgetMinutes) || session.budgetMinutes <= 0 || timedSeconds > session.budgetMinutes * 60)
    throw new Error("Sample timed steps exceed the session budget");
  return { timedSeconds, distanceMeters, workSeconds, recoverySeconds,
    exactTimeSeconds: session.steps.some(step => step.endpoint.type === "distance") ? null : timedSeconds,
    budgetMinutes: session.budgetMinutes };
}
const session = (sport: Sport, title: string, daySlot: number, steps: ReviewedSampleStep[], budgetMinutes: number, sourceIds: string[], purpose = title): ReviewedSampleSession => ({
  id: `${sport}-${daySlot}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, sport, title, daySlot, purpose, steps, budgetMinutes,
  stop: STOP, provenance: { doseOrigin: "jmm_coaching_heuristic", sourceIds, trialReplication: false },
});
const easy = (sport: "run" | "bike", minutes: number, daySlot: number, observation = false) => session(sport,
  observation ? "Comfortable baseline observation" : "Easy endurance", daySlot,
  [time("Gradual warm-up", 5, "warmup", sport), time(observation ? "Observe comfortable effort; record conditions and response" : "Comfortable continuous work", minutes - 10, "active", sport), time("Easy finish", 5, "cooldown", sport)],
  minutes, sport === "bike" ? ["C1", "Z1", "Z2"] : ["R1", "R2"],
  observation ? "Non-maximal observation of familiar work; no threshold or VO2max measurement" : "Maintain repeatable tolerated endurance");
function controlled(sport: "run" | "bike", daySlot: number, recoveryWeek: boolean) {
  if (recoveryWeek) return easy(sport, 25, daySlot, true);
  const steps = [time("Easy warm-up", 10, "warmup", sport)];
  for (let i = 0; i < 3; i++) {
    steps.push(time(`Controlled repetition ${i + 1}/3`, 4, "active", sport, CONTROLLED));
    if (i < 2) steps.push(time("Easy recovery", 2, "recovery", sport));
  }
  steps.push(time("Easy cool-down", 5, "cooldown", sport));
  return session(sport, "3 × 4-minute controlled practice", daySlot, steps, 31, sport === "bike" ? ["C1"] : ["R1", "R2"],
    "Practice repeatable effort; this moderate JMM dose is not the maximal-tolerable Seiler or Helgerud protocol");
}
function brick(daySlot: number, bikeMinutes: number, reduced: boolean) {
  const runMinutes = reduced ? 10 : 15;
  const steps = [time("Easy bike warm-up", 5, "warmup", "bike"), time("Comfortable bike endurance", bikeMinutes - 10, "active", "bike"),
    time("Easy bike finish", 5, "cooldown", "bike"), time("Unhurried equipment transition", 3, "recovery", "brick", "Safe venue; change equipment without rushing."),
    time("Comfortable run off the bike", runMinutes - 3, "active", "run", EASY), time("Walk or easy finish", 3, "cooldown", "run")];
  return session("brick", "Easy bike–run transition practice", daySlot, steps, bikeMinutes + runMinutes + 3, ["T1"],
    "Combined easy load; neither an additional hard day nor evidence of race-distance readiness");
}
function pool(daySlot: number, recoveryWeek: boolean) {
  const repeats = recoveryWeek ? 4 : 6;
  const steps = [distance("Easy familiar stroke", 200, "warmup", "swim", "Pool with appropriate supervision; use a familiar stroke and stop before technique fails.")];
  for (let i = 0; i < repeats; i++) {
    steps.push(distance(`Controlled 100 m ${i + 1}/${repeats}`, 100, "active", "swim", "Comfortable technique-focused pace; no CSS target inferred from this example."));
    if (i < repeats - 1) steps.push(time("Rest at wall", .5, "recovery", "swim", "Recover comfortably; extend rest or omit a repeat if needed."));
  }
  steps.push(distance("Easy finish", 100, "cooldown", "swim", "Comfortable familiar stroke; no breath-holding challenge."));
  return session("swim", `${repeats} × 100 m technique practice`, daySlot, steps, recoveryWeek ? 30 : 40, ["S1", "S2"], "Repeatable stroke quality; distance totals are exact but elapsed swim time is unknown");
}
function strength(daySlot: number, recoveryWeek: boolean) {
  const practiceMinutes = recoveryWeek ? 2 : 4;
  const steps = [time("Familiar mobility and unloaded rehearsal", 5, "warmup", "strength")];
  for (const movement of ["familiar squat or supported sit-to-stand", "familiar hinge", "familiar row or press"]) {
    steps.push(time(`Coach-reviewed ${movement}`, practiceMinutes, "active", "strength", "Technique window, not continuous repetitions. Coach/athlete selects familiar load and reps; finish well before failure. No maximal lift or Olympic lift is assigned."));
    steps.push(time("Full recovery / equipment adjustment", 2, "recovery", "strength", "Rest; continue only with comfortable technique."));
  }
  steps.push(time("Easy mobility finish", 3, "cooldown", "strength"));
  return session("strength", "Familiar movement practice", daySlot, steps, 14 + 3 * practiceMinutes, ["ST1", "ST4"], "Supporting strength practice; load, reps and progression require individual review");
}
function sprint(daySlot: number, recoveryWeek: boolean) {
  if (recoveryWeek) return session("run", "Sprint technique review", daySlot,
    [time("Easy warm-up", 10, "warmup", "run"), time("Familiar low-speed mechanics, pauses as needed", 10, "active", "run", "Coach-led technique; no maximal velocity or aerobic HR target."), time("Easy finish", 5, "cooldown", "run")], 25, ["TRN-SPRINT-QUALITY-PRACTICE"]);
  const steps = [time("Easy warm-up and familiar drills", 15, "warmup", "run")];
  for (let i = 0; i < 4; i++) {
    steps.push(distance(`Controlled acceleration ${i + 1}/4`, 20, "active", "run", "Technically prepared adult under qualified sprint coaching; build speed smoothly, never strain or chase HR."));
    if (i < 3) steps.push(time("Full walk / standing recovery", 3, "recovery", "run", "Do not shorten recovery to increase difficulty; extend or stop if not ready."));
  }
  steps.push(time("Easy cool-down", 5, "cooldown", "run"));
  return session("run", "4 × 20 m acceleration practice", daySlot, steps, 40, ["TRN-SPRINT-QUALITY-PRACTICE"], "Quality and measured repeat time on consistent surface, not endurance conditioning");
}
function hyrox(daySlot: number, recoveryWeek: boolean) {
  const rounds = recoveryWeek ? 2 : 3;
  const steps = [time("Easy movement and familiar station rehearsal", 8, "warmup", "hyrox")];
  for (let i = 0; i < rounds; i++) {
    steps.push(time(`Comfortable run ${i + 1}/${rounds}`, 3, "active", "run"));
    steps.push(time("Controlled transition", 1, "recovery", "hyrox", "Walk, prepare equipment, do not rush."));
    steps.push(time("Familiar row or carry technique", 2, "active", "hyrox", "Reviewed movement and load only; no fixed repetitions, division load or race-equivalent target is assumed."));
    if (i < rounds - 1) steps.push(time("Easy recovery", 2, "recovery", "hyrox"));
  }
  steps.push(time("Easy cool-down", 5, "cooldown", "hyrox"));
  return session("hyrox", `${rounds} controlled run–station rounds`, daySlot, steps, 13 + 6 * rounds + 2 * (rounds - 1), ["H1", "H2"], "Practice familiar transitions; observational HYROX evidence does not validate this dose or full-race readiness");
}
const baseline = (sport: Sport, protocol: string, observations: SampleBaseline["observations"], interpretation: string): SampleBaseline => ({
  sport, protocol, observations, interpretation, source: "synthetic_fixture", observedAt: "2026-10-05", nextReviewAfterDays: 28, reviewRule: "coaching_heuristic",
});
const BASELINES = {
  run: baseline("run", "Recent familiar 5 km performance, consistent course; optional non-maximal alternative records minutes/effort only", { distanceMeters: 5000, elapsedSeconds: 1500, conditions: "Synthetic flat-course example" }, "5:00/km is observed performance pace, not measured threshold. Do not silently write performance pace to a threshold field. Any explicitly chosen derived threshold estimate must retain its method and uncertainty; an aspirational goal never becomes an anchor."),
  bike: baseline("bike", "Previously completed, reviewed FTP protocol with calibrated meter", { reportedFtpWatts: 220, protocol: "20-minute-derived FTP, method explicitly recorded" }, "220 W is a synthetic FTP field estimate; CP needs its own test and field. No universal CP = FTP + 16 W conversion."),
  swim: baseline("swim", "Reviewed same-stroke 200/400 m pool tests; not automatically scheduled", { t400Seconds: 480, t200Seconds: 220, cssSecondsPer100m: 130, poolLengthMeters: 25, stroke: "freestyle" }, "(480−220)/2 = 130 s/100 m, a CSS field estimate with measurement error. It is not directly measured LT2 or proof of open-water safety."),
  sprint: baseline("run", "Coach-observed acceleration on a consistent safe surface with consistent timing method", { distanceMeters: 20, bestSeconds: 3.6, timing: "Synthetic electronic timing example" }, "A 20 m acceleration result informs only comparable acceleration practice. It is not maximal flying speed, 100/400 m ability or an endurance threshold."),
  hyrox: baseline("hyrox", "Familiar non-maximal run–station observation with reviewed equipment/load", { rounds: 2, runMinutesPerRound: 3, stationTechniqueMinutesPerRound: 2, effort: "comfortable" }, "Keep running, transitions, station load/repetitions and symptoms separate. No total-race prediction or division load is inferred."),
  strength: baseline("strength", "Qualified review of familiar movements, comfortable loads and repetitions in reserve", { movement: "goblet squat", loadKg: 12, repetitions: 6, reportedRepsInReserve: 3 }, "Synthetic technique example, not a 1RM estimate or automatic starting load. General strength is only partially supported; Olympic lifting remains outside scope."),
};
const THEMES = ["Baseline observation and familiarization", "Repeatable foundation", "Controlled practice", "Recovery and baseline review", "Event-relevant practice", "Consolidate repeatability", "Practice within tolerated load", "Recovery and baseline review", "Event-specific integration", "Reduced-load event preparation", "Event week; review actual response", "Post-event recovery and review; no assumed return"];
const CATALOG: { goal: SampleGoal; family: SampleFamily; title: string; ceiling: number; baselines: (keyof typeof BASELINES)[] }[] = [
  { goal: "sprint", family: "triathlon", title: "Sprint triathlon", ceiling: 300, baselines: ["run", "bike", "swim", "strength"] },
  { goal: "olympic", family: "triathlon", title: "Olympic-distance triathlon", ceiling: 360, baselines: ["run", "bike", "swim", "strength"] },
  { goal: "half", family: "triathlon", title: "Half-distance triathlon", ceiling: 420, baselines: ["run", "bike", "swim", "strength"] },
  { goal: "full", family: "triathlon", title: "Full-distance triathlon", ceiling: 480, baselines: ["run", "bike", "swim", "strength"] },
  { goal: "run-only", family: "distance-running", title: "Distance running", ceiling: 240, baselines: ["run", "strength"] },
  { goal: "track-sprint", family: "track-sprint", title: "Track sprint: acceleration foundation", ceiling: 180, baselines: ["sprint", "strength"] },
  { goal: "cycle", family: "cycling", title: "Cycling", ceiling: 300, baselines: ["bike", "strength"] },
  { goal: "swim-only", family: "swimming", title: "Pool swimming", ceiling: 180, baselines: ["swim", "strength"] },
  { goal: "hyrox", family: "hyrox", title: "HYROX familiar-skill foundation", ceiling: 240, baselines: ["run", "hyrox", "strength"] },
  { goal: "general-strength", family: "general-strength", title: "General strength: partial supporting scope", ceiling: 120, baselines: ["strength"] },
];

/** Full-horizon review drafts, not completion-ready race plans. Repeatable
 * opportunities are shown across 12 weeks; no outcome is promised by the horizon.
 * Weeks after each review remain conditional until actual work/recovery and
 * source-specific baselines are reviewed. No imported observation is renewed. */
export function buildReviewedCycleSample(goal: SampleGoal): ReviewedCycleSample {
  const spec = CATALOG.find(item => item.goal === goal);
  if (!spec) throw new Error("Unsupported review sample goal");
  return {
    id: `synthetic-${goal}-${CYCLE_SAMPLE_VERSION}`, goal, family: spec.family, title: spec.title,
    review: { status: "review_only", reviewedAt: "2026-10-10", scope: "engineering_and_evidence_scope", qualifiedCoachApproval: false, automaticPrescription: false },
    support: goal === "general-strength" ? "partial_supporting_strength" : "supported_goal_example",
    population: "Synthetic established adult with recent, already tolerated sport-specific training; not a real athlete or a novice starting prescription.",
    prerequisites: ["Confirm recent training, symptoms, restrictions, venue/equipment, time and recovery", "Review each sport independently; other-sport fitness is not transferable proof", "Obtain qualified review for the athlete, technical skills and all demanding work", "All doses, sequencing, priority handling and 28-day review windows are coaching heuristics"],
    limitations: ["This full 12-week horizon illustrates structure, not race completion readiness or a validated response model", "After each scheduled review, hold or reduce until actual response supports the next block; no automatic volume increase", "Events replace the planned day; no assumed event duration, completion, recovery or compensatory work", "Distance endpoints preserve exact distance and unknown elapsed time; time budgets are not measured totals", ...(spec.family === "triathlon" ? ["Distance variants require separate event-specific endurance and open-water/fueling review; a larger ceiling does not establish long-course readiness"] : []), ...(goal === "general-strength" ? ["General strength has partial supporting scope only; no standalone lifting goal, 1RM progression or Olympic-lifting cycle"] : [])],
    startKey: START, baselineWeeklyMinutes: spec.ceiling,
    baselines: spec.baselines.map(key => ({ ...BASELINES[key], observations: { ...BASELINES[key].observations } })),
    event: goal === "general-strength" ? null : { name: `${spec.title} review event`, dateKey: addDaysKey(START, 76), priority: "A", source: "synthetic_fixture" },
    weeks: Array.from({ length: 12 }, (_, index) => {
      const week = index + 1;
      const reduced = [1, 4, 8, 10, 11, 12].includes(week);
      const easyMinutes = reduced ? 25 : week < 5 ? 35 : 40;
      let sessions: ReviewedSampleSession[];
      if (spec.family === "triathlon") {
        const longBike = reduced ? 40 : goal === "sprint" ? 50 : goal === "olympic" ? 65 : goal === "half" ? 80 : 95;
        sessions = [pool(0, reduced), controlled("bike", 1, reduced), pool(2, reduced), ...(week === 11 ? [] : [strength(3, true)]), easy("run", easyMinutes, 4, week === 1), brick(5, longBike, reduced)];
      } else if (spec.family === "distance-running") sessions = [easy("run", easyMinutes, 0, week === 1), controlled("run", 2, reduced), strength(4, reduced), easy("run", reduced ? 30 : 50, 5)];
      else if (spec.family === "cycling") sessions = [easy("bike", easyMinutes, 0, week === 1), controlled("bike", 2, reduced), strength(4, reduced), easy("bike", reduced ? 40 : 75, 5)];
      else if (spec.family === "swimming") sessions = [pool(0, reduced), pool(2, reduced), strength(4, reduced), pool(5, true)];
      else if (spec.family === "track-sprint") sessions = [sprint(0, reduced), strength(2, reduced), sprint(4, true)];
      else if (spec.family === "hyrox") sessions = [easy("run", easyMinutes, 0, week === 1), strength(2, reduced), hyrox(4, reduced), easy("run", reduced ? 25 : 35, 5)];
      else sessions = [strength(1, reduced), strength(4, reduced)];
      // No post-event session is assumed safe or performed. Review the actual
      // event and recovery first; optional movement needs its own daily review.
      if (week === 12 && goal !== "general-strength") sessions = [];
      // Recovery opportunities are explicit, never fabricated completed sessions.
      return { week, startKey: addDaysKey(START, index * 7), theme: goal === "general-strength" && week >= 11 ? "Reduced practice and goal review" : THEMES[index],
        reviewRequired: [1, 4, 8, 12].includes(week), sessions,
        restDaySlots: Array.from({ length: 7 }, (_, day) => day).filter(day => !sessions.some(item => item.daySlot === day) && !(week === 11 && goal !== "general-strength" && day === 6)) };
    }),
  };
}
export const REVIEWED_CYCLE_SAMPLE_GOALS: readonly SampleGoal[] = CATALOG.map(item => item.goal);
