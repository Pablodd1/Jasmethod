// JasMiamiMethod — Rep-by-rep execution compliance (perf-engine-v3). Pure, no I/O.
//
// Compares the prescribed steps of a completed session with the recorded
// stream (power for bike, speed for run/swim, HR as fallback) and returns:
// - hitRate: share of work reps within 95% of the session's own best rep.
//   This measures relative consistency, NOT attainment of prescribed targets,
// - fade: % drop from the first to the last work rep (fatigue within session),
// - decoupling: Pa:HR / Pw:HR drift between halves of steady work (aerobic
//   durability; >5% = meaningful drift, Friel/Maunder),
// - verdict: on_target | faded | missed | too_easy | insufficient_data.
// Feeds the next day's engine decision and anchor-retest prompts.

import type { WorkoutStep } from "./prescription";
import type { ActivityStreams } from "./activity-streams";

export interface ComplianceResult {
  version: "compliance-v1";
  verdict: "on_target" | "faded" | "missed" | "too_easy" | "insufficient_data";
  channel: "power" | "speed" | "hr" | null;
  workReps: number;
  hitRate: number | null;
  fadePct: number | null;
  decouplingPct: number | null;
  repOutputs: number[];
  note: string;
}

const mean = (a: number[]) => a.reduce((s, n) => s + n, 0) / a.length;

function windowValues(streams: ActivityStreams, ch: (number | null)[], from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < streams.t.length; i++) { const v = ch[i]; if (streams.t[i] >= from && streams.t[i] < to && typeof v === "number" && Number.isFinite(v) && v > 0) out.push(v); }
  return out;
}

export function analyzeCompliance(steps: WorkoutStep[], streams: ActivityStreams | null, opts: { sport: string; rpe?: number | null; intendedRpe?: number | null } ): ComplianceResult {
  const none = (note: string): ComplianceResult => ({ version: "compliance-v1", verdict: "insufficient_data", channel: null, workReps: 0, hitRate: null, fadePct: null, decouplingPct: null, repOutputs: [], note });
  if (!streams || streams.t.length < 60 || !steps.length) return none("No recorded stream for this session.");
  const total = steps.reduce((a, s) => a + s.seconds, 0), recorded = streams.t[streams.t.length - 1];
  if (recorded < total * 0.6) return none("Recording is much shorter than the prescription; reps cannot be aligned.");
  const share = (arr: (number | null)[]) => arr.filter(v => typeof v === "number" && v > 0).length / streams.t.length;
  const channel: ComplianceResult["channel"] = opts.sport === "bike" && share(streams.power) > 0.8 ? "power" : ["run", "swim"].includes(opts.sport) && share(streams.speedMs) > 0.8 ? "speed" : share(streams.hr) > 0.8 ? "hr" : null;
  if (!channel) return none("Power, speed and heart rate are each missing in more than 20% of samples.");
  const ch = channel === "power" ? streams.power : channel === "speed" ? streams.speedMs : streams.hr;

  // Align by elapsed time (warm-up starts at t=0). HR lags ~30 s, so skip the first 30 s of each rep for HR.
  let cursor = 0;
  const reps: number[] = [];
  const steady: number[][] = [];
  for (const s of steps) {
    const from = cursor + (channel === "hr" ? Math.min(30, s.seconds / 3) : Math.min(10, s.seconds / 6)), to = cursor + s.seconds;
    if (s.phase === "active" && Number(s.zone.slice(1)) >= 4 && s.seconds >= 20) { const v = windowValues(streams, ch, from, to); if (v.length >= 3) reps.push(mean(v)); }
    if (s.phase === "active" && Number(s.zone.slice(1)) <= 3 && s.seconds >= 1200) steady.push([cursor, to]);
    cursor = to;
  }

  // Aerobic decoupling on the longest steady block (needs output + HR).
  let decouplingPct: number | null = null;
  const block = steady.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
  const out = channel === "hr" ? null : ch;
  if (block && out && share(streams.hr) > 0.8) {
    const mid = (block[0] + block[1]) / 2;
    const r = (a: number, b: number) => { const o = windowValues(streams, out, a, b), h = windowValues(streams, streams.hr, a, b); return o.length > 10 && h.length > 10 ? mean(o) / mean(h) : null; };
    const r1 = r(block[0], mid), r2 = r(mid, block[1]);
    if (r1 && r2) decouplingPct = Math.round(((r1 - r2) / r1) * 1000) / 10;
  }

  if (reps.length < 2) {
    const verdict = decouplingPct != null && decouplingPct > 5 ? "faded" : "on_target";
    return { version: "compliance-v1", verdict: decouplingPct == null ? "insufficient_data" : verdict, channel, workReps: reps.length, hitRate: null, fadePct: null, decouplingPct, repOutputs: reps.map(r => Math.round(r * 10) / 10), note: decouplingPct == null ? "No hard reps to compare." : `Aerobic decoupling ${decouplingPct}%${decouplingPct > 5 ? " (>5%: durability limiter)" : ""}.` };
  }
  // HR rises with fatigue; for HR, a *higher* late value is drift, not a better rep.
  const best = channel === "hr" ? Math.min(...reps) : Math.max(...reps);
  const hit = channel === "hr" ? reps.filter(r => r <= best * 1.05).length : reps.filter(r => r >= best * 0.95).length;
  const hitRate = Math.round((hit / reps.length) * 100) / 100;
  const fadePct = Math.round(((channel === "hr" ? reps[reps.length - 1] - reps[0] : reps[0] - reps[reps.length - 1]) / reps[0]) * 1000) / 10;
  const plannedReps = steps.filter(s => s.phase === "active" && Number(s.zone.slice(1)) >= 4 && s.seconds >= 20).length;
  const completedAll = reps.length >= plannedReps * 0.9;
  let verdict: ComplianceResult["verdict"] = "on_target";
  if (!completedAll) verdict = "missed";
  else if (fadePct > 8 || hitRate < 0.7) verdict = "faded";
  else if (opts.rpe != null && opts.intendedRpe != null && opts.rpe <= opts.intendedRpe - 2 && fadePct < 2) verdict = "too_easy";
  const note = verdict === "missed" ? `Completed ${reps.length}/${plannedReps} hard reps.`
    : verdict === "faded" ? `Output faded ${fadePct}% first→last rep (relative consistency ${Math.round(hitRate * 100)}%). Review execution and conditions; the cause is not established.`
    : verdict === "too_easy" ? "Reps were relatively steady and reported RPE below intended. Review the dose or consider a retest; fitness improvement is not established."
    : `Reps relatively consistent (fade ${fadePct}%, consistency ${Math.round(hitRate * 100)}%). Prescribed pace, power or HR target attainment was not assessed.`;
  return { version: "compliance-v1", verdict, channel, workReps: reps.length, hitRate, fadePct, decouplingPct, repOutputs: reps.map(r => Math.round(r * 10) / 10), note };
}
