/** Rebuild the review pack from its editable source, or verify it with --check. */
import { readFileSync, writeFileSync } from "node:fs";
import { buildReviewedCycleSample, reviewedSampleTotals, REVIEWED_CYCLE_SAMPLE_GOALS, CYCLE_SAMPLE_VERSION, type ReviewedSampleSession } from "../src/lib/reviewed-cycle-samples";

const path = "docs/research/2026-10-07/reviewed-cycle-examples.md";
const samples = REVIEWED_CYCLE_SAMPLE_GOALS.map(buildReviewedCycleSample);
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const library = new Map<string, { id: string; session: ReviewedSampleSession }>();
const signature = (session: ReviewedSampleSession) => JSON.stringify([session.title, session.sport, session.steps, session.budgetMinutes, session.provenance]);
function entry(session: ReviewedSampleSession) {
  const key = signature(session);
  if (!library.has(key)) library.set(key, { id: `S${String(library.size + 1).padStart(2, "0")}`, session });
  return library.get(key)!;
}
const lines = [
  "# JMM 12-week review examples and baselines",
  "",
  `Version: ${CYCLE_SAMPLE_VERSION}. Rebuilt from src/lib/reviewed-cycle-samples.ts with node --import tsx scripts/render-reviewed-cycle-samples.ts.`,
  "",
  "Engineering and evidence-scope review only. These are synthetic educational drafts, not real athlete data, qualified coaching approvals, trial-validated doses or automatically selectable plans. Every number, sequence, priority rule and review window here is a JMM coaching heuristic. Use the [existing evidence dossier](training-evidence.md) and [expert-education adjudication](huberman-galpin-evidence.md) for source limitations.",
  "",
  "## How to review or adapt",
  "",
  "- Confirm sport-specific history, current symptoms/restrictions, equipment, safe setting, available time and prior tolerance. These samples assume established adults; they are not novice, injury-return or clearance protocols.",
  "- Compare each week to actual tolerated training; the stated ceiling is an assumed synthetic limit, not a target to fill. Stop or reduce for poor recovery, pain, unsafe conditions or lost technique. Do not add missed work later.",
  "- Review at the start and around weeks 4, 8 and 12. Later weeks remain conditional. The 28-day cadence is a product heuristic; observations do not renew the separate 90-day anchor-validity policy.",
  "- Each session below links to editable work/rest endpoints. Recompute all totals after edits. Exact timed totals include warm-up, all work, listed rest and cool-down. Distance sessions have exact distance plus explicit recovery time; their elapsed duration is unknown. Budget minutes are scheduling allowances only.",
  "- The event in week 11 replaces its date; its duration and result are unknown and excluded from training budgets. Week 12 deliberately prescribes no post-event workouts pending actual recovery review. A rest/review slot is not a claim that no activity occurred.",
  "- Close A/B/C events need an explicit choice: reduce conservatively, revise priorities or seek individual coaching. Lower priority does not imply lower physiological cost. The review pack shows one event to keep the example readable; runtime event regression tests cover multiple events.",
  "- General strength is partial supporting scope. Boxing and standalone Olympic lifting remain excluded. The Olympic goal below means Olympic-distance triathlon.",
  "",
];
for (const sample of samples) {
  lines.push(`## ${sample.title}`, "", `Goal: ${sample.goal}. Scope: ${sample.support}. Assumed recently tolerated ceiling: ${sample.baselineWeeklyMinutes} min/week. Start: ${sample.startKey}.`, "",
    sample.event ? `Synthetic A event: ${sample.event.dateKey}. Event readiness, duration and recovery are not established by this horizon.` : "No event or standalone lifting progression is inferred.", "",
    ...(sample.family === "triathlon" ? ["The triathlon variants provide a foundation/maintenance illustration with combined swim–bike–run load. Longer-course variants require separate endurance, open-water, equipment and fueling review; these example durations do not establish full-distance race readiness.", ""] : []),
    "### Baseline examples", "");
  for (const baseline of sample.baselines) lines.push(`- ${baseline.sport}, synthetic observation ${baseline.observedAt}: ${baseline.protocol}. Values: ${Object.entries(baseline.observations).map(([key, value]) => `${key}=${value}`).join("; ")}. ${baseline.interpretation}`);
  lines.push("", "### Full 12-week horizon", "", "| Week / starting | Purpose | Sessions (allowance or exact time as noted in library) | Budget total, excluding event | Rest/review slots |", "|---|---|---|---|---|");
  for (const week of sample.weeks) {
    const links = week.sessions.map(session => `${days[session.daySlot]} [${entry(session).id}](#${entry(session).id.toLowerCase()}) ${session.sport} ${session.budgetMinutes} min`);
    if (sample.event && week.week === 11) links.push(`Sun event ${sample.event.dateKey}; duration unknown`);
    lines.push(`| ${week.week} / ${week.startKey} | ${week.theme}${week.reviewRequired ? "; review required" : ""} | ${links.join("; ") || "No workouts prescribed pending actual recovery review"} | ${week.sessions.reduce((sum, session) => sum + session.budgetMinutes, 0)} min | ${week.restDaySlots.map(day => days[day]).join(", ")} |`);
  }
  lines.push("");
}
lines.push("## Editable session library", "", "All targets are open effort with explicit instructions. No numeric pace, power or HR target is derived from the synthetic results. Source IDs refer to the [existing evidence dossier](training-evidence.md); the cited studies support principles and do not validate these exact recipes.", "");
for (const { id, session } of library.values()) {
  const totals = reviewedSampleTotals(session);
  lines.push(`### ${id}`, "", `**${session.title} (${session.sport})**. ${session.purpose}.`, "",
    totals.exactTimeSeconds === null
      ? `Distance total: ${totals.distanceMeters} m. Known timed steps: ${totals.timedSeconds} s, including ${totals.recoverySeconds} s recovery. Elapsed session time: unknown. Scheduling allowance: ${totals.budgetMinutes} min.`
      : `Exact timed total: ${totals.exactTimeSeconds} s (${totals.exactTimeSeconds / 60} min); active steps ${totals.workSeconds} s, recovery steps ${totals.recoverySeconds} s; warm-up/cool-down are included.`, "");
  for (const [index, step] of session.steps.entries()) lines.push(`${index + 1}. ${step.name}: ${step.endpoint.type === "time" ? `${step.endpoint.seconds} s` : `${step.endpoint.meters} m`} (${step.phase}; ${step.sport}). ${step.target.instruction}`);
  lines.push("", `Provenance: JMM coaching heuristic; not a trial replication. Principle sources: ${session.provenance.sourceIds.join(", ")}. ${session.stop}`, "");
}
const output = `${lines.join("\n").trim()}\n`;
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8") !== output) throw new Error("Reviewed cycle example pack is stale; rebuild it from the fixtures.");
  console.log(`Verified ${samples.length} review-only cycle examples and ${library.size} unique session structures.`);
} else {
  writeFileSync(path, output);
  console.log(`Wrote ${samples.length} review-only cycle examples and ${library.size} unique session structures to ${path}.`);
}
