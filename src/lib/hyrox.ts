// JasMiamiMethod — HYROX Race Split Planner + weak-station analysis.
// 16 segments to manage: 8 × 1km runs + 8 stations (+ roxzone transitions).
// Plan model: target finish − runs − transitions = station budget, distributed
// by division-relative station-duration weights (open men/women medians from
// public split data; pro scales ~15-20% faster). Weak-station analysis
// compares actual vs plan and ranks where the race was lost, feeding training
// emphasis for the next block.

export interface SplitSegment {
  n: number;                 // 1..16
  kind: "run" | "station";
  key: string;               // run1..run8 | station key
  name: string;
  targetSec: number;         // planned segment duration
  cumulativeSec: number;     // planned elapsed at segment exit (checkpoint)
}

export interface SplitPlan {
  targetTotalMin: number;
  runPaceSecPerKm: number;
  runsTotalSec: number;
  stationsTotalSec: number;
  transitionsTotalSec: number;
  segments: SplitSegment[];
  notes: string[];
}

// Relative station-duration weights (Open division; women scale ~1.15 on
// strength stations, ~1.0 on engine stations).
const STATION_WEIGHTS: Record<string, number> = {
  ski: 3.4, sledpush: 2.4, sledpull: 3.0, burpee: 6.0,
  row: 3.8, farmers: 1.7, lunges: 4.4, wallball: 5.3,
};
const STATION_NAMES: Record<string, string> = {
  ski: "SkiErg", sledpush: "Sled Push", sledpull: "Sled Pull", burpee: "Burpee Broad Jumps",
  row: "Rowing", farmers: "Farmers Carry", lunges: "Sandbag Lunges", wallball: "Wall Balls",
};
const STATION_ORDER = ["ski", "sledpush", "sledpull", "burpee", "row", "farmers", "lunges", "wallball"];
const ROXZONE_SEC = 12; // per transition estimate (8 transitions)

export function planHyroxSplits(opts: {
  targetTotalMin: number;
  runPaceSecPerKm: number;   // planned 1km race pace
  sex?: "male" | "female";   // scales strength stations
  pro?: boolean;             // pro weights run longer, stations faster
}): SplitPlan {
  const { targetTotalMin, runPaceSecPerKm, sex = "male", pro = false } = opts;
  const targetSec = Math.round(targetTotalMin * 60);
  const runsTotalSec = runPaceSecPerKm * 8;
  const transitionsTotalSec = ROXZONE_SEC * 8;
  let stationBudget = targetSec - runsTotalSec - transitionsTotalSec;
  if (stationBudget < 8 * 45) stationBudget = 8 * 45; // sanity floor

  const strength = new Set(["sledpush", "sledpull", "farmers", "lunges", "wallball"]);
  const weights = STATION_ORDER.map((k) => {
    let w = STATION_WEIGHTS[k];
    if (strength.has(k) && sex === "female") w *= 1.15;
    if (pro) w *= 0.85;
    return w;
  });
  const wSum = weights.reduce((a, b) => a + b, 0);

  const segments: SplitSegment[] = [];
  let cum = 0;
  for (let i = 0; i < 8; i++) {
    // run i+1
    const runSec = Math.round(runPaceSecPerKm);
    cum += runSec + ROXZONE_SEC / 2;
    segments.push({ n: segments.length + 1, kind: "run", key: `run${i + 1}`, name: `Run ${i + 1} (1km)`, targetSec: runSec, cumulativeSec: Math.round(cum) });
    // station i
    const stSec = Math.max(30, Math.round((weights[i] / wSum) * stationBudget));
    cum += stSec + ROXZONE_SEC / 2;
    segments.push({ n: segments.length + 1, kind: "station", key: STATION_ORDER[i], name: STATION_NAMES[STATION_ORDER[i]], targetSec: stSec, cumulativeSec: Math.round(cum) });
  }

  const notes = [
    `Runs: ${fmt(runsTotalSec)} (${fmt(runPaceSecPerKm)}/km) · stations: ${fmt(stationBudget)} · roxzones: ${fmt(transitionsTotalSec)}.`,
    `Back-half guard: stations 5-8 (row→wall ball) are where races die — if cumulative time at Wall Balls exit is on target, hold pace; never chase early.`,
    `2026/27 rules: every station must meet full movement standard — sandbag penalties replace instant DQs on some faults, but incomplete stations = DQ (HYROX 2026/27 rulebook).`,
  ];

  return { targetTotalMin, runPaceSecPerKm, runsTotalSec, stationsTotalSec: stationBudget, transitionsTotalSec, segments, notes };
}

export interface StationGap {
  key: string;
  name: string;
  actualSec: number;
  targetSec: number;
  deltaSec: number;   // positive = slower than plan
  pctOfTotalLoss: number;
  advice: string;
}

export interface SplitAnalysis {
  planTotalSec: number;
  actualTotalSec: number;
  totalDeltaSec: number;
  stationGaps: StationGap[];   // sorted worst first
  runGaps: StationGap[];       // run pacing fade check
  weakest: string;             // station name that cost the most
  summary: string;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Training emphasis per station for the next block.
const STATION_ADVICE: Record<string, string> = {
  ski: "Aerobic ceiling + pull mechanics: SkiErg 5×500m hard / 90s rest; lat strength (weighted pull-downs 4×8); practise damper 6-7 rhythm.",
  sledpush: "Drive strength: heavy sled pushes 8×12.5m + front-squat strength 4×5; low-body positioning drills under fatigue.",
  sledpull: "Posterior chain + grip: rope pulls 8×12.5m hand-over-hand; RDL 4×6; farmer-grip deadlifts.",
  burpee: "The HR spike: burpee broad-jump intervals 4×80m at race effort with 2 min rest; pace — do NOT sprint the first two rounds.",
  row: "Engine + ratio: row 8×500m race pace / 1:1 rest; stroke-rate discipline 30-32; legs-then-arms sequencing.",
  farmers: "Grip + posture: heavy farmers 4×50m; grip work (hangs, thick-bar holds) — grip is already blown by station 6.",
  lunges: "Hip-flexor endurance under load: sandbag lunges 4×25m unbroken; knee-to-floor standard; hip-mobility daily.",
  wallball: "Squat endurance + rhythm: 100-rep wall ball time-trials in training; 3×30 unbroken at race weight; learn the 10-rep micro-break.",
};

export function analyzeHyroxSplits(plan: SplitPlan, actualSecs: number[]): SplitAnalysis {
  const planTotalSec = plan.targetTotalMin * 60;
  const actualTotalSec = actualSecs.reduce((a, b) => a + (Number(b) || 0), 0);
  const totalDeltaSec = actualTotalSec - planTotalSec;

  const stationGaps: StationGap[] = [];
  const runGaps: StationGap[] = [];
  plan.segments.forEach((seg, i) => {
    const actual = Number(actualSecs[i]) || 0;
    const delta = actual - seg.targetSec;
    const gap: StationGap = {
      key: seg.key, name: seg.name, actualSec: actual, targetSec: seg.targetSec,
      deltaSec: delta, pctOfTotalLoss: 0,
      advice: seg.kind === "station" ? (STATION_ADVICE[seg.key] || "") : "",
    };
    (seg.kind === "station" ? stationGaps : runGaps).push(gap);
  });
  const lossSum = [...stationGaps, ...runGaps].filter((g) => g.deltaSec > 0).reduce((a, g) => a + g.deltaSec, 0) || 1;
  [...stationGaps, ...runGaps].forEach((g) => { g.pctOfTotalLoss = Math.round((Math.max(0, g.deltaSec) / lossSum) * 100); });
  stationGaps.sort((a, b) => b.deltaSec - a.deltaSec);
  runGaps.sort((a, b) => b.deltaSec - a.deltaSec);

  const worst = stationGaps[0];
  const runFade = runGaps[runGaps.length - 1].deltaSec - runGaps[0].deltaSec;
  const summary = actualTotalSec === 0
    ? "No splits logged yet."
    : `Finish ${fmt(actualTotalSec)} vs target ${fmt(planTotalSec)} (${totalDeltaSec >= 0 ? "+" : ""}${fmt(Math.abs(totalDeltaSec))}). Biggest loss: ${worst.name} (+${worst.deltaSec}s, ${worst.pctOfTotalLoss}% of all lost time). ${runFade > 25 ? "Run pacing faded badly across the 8 rounds — start slower." : "Run pacing held."}`;

  return { planTotalSec, actualTotalSec, totalDeltaSec, stationGaps, runGaps, weakest: worst?.name || "", summary };
}
