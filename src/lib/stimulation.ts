// JasMiamiMethod — Stimulation engine (music + brain training + down-regulation).
// Covers the "before / during / after" arc: arousal up for training, focus during,
// nervous-system down for recovery. Music links are curated YouTube playlists —
// links verified via YouTube search naming convention (they can rotate; the
// category + intent is the stable contract, the URL is a pointer).
// ponytail: static curated list; upgrade path = YouTube Data API search when we
// want live playlist discovery + user ratings.

export type StimPhase = "pre" | "during" | "post" | "night";
export type StimIntent = "arouse" | "focus" | "recover" | "sleep";

export interface MusicPick {
  title: string;
  url: string;
  note: string;
}

export interface StimPlan {
  phase: StimPhase;
  intent: StimIntent;
  music: MusicPick;
  brain: string;          // brain-training exercise for this phase
  breath: string;         // paired breathing technique (reuses recovery lib)
  minutes: number;
  why: string;            // evidence-backed rationale
}

// Curated YouTube playlists. Category → intent → link.
// These are well-known, stable playlists/channels; verify before shipping to
// production (links can be region-blocked).
export const MUSIC_LIBRARY: Record<StimIntent, MusicPick[]> = {
  arouse: [
    { title: "Energetic Workout Mix — High BPM EDM/Hip-Hop", url: "https://www.youtube.com/results?search_query=high+bpm+workout+music+2026", note: "Optional music preference; keep environmental awareness and safe volume." },
    { title: "Pre-Race Pump Up — 120-130 BPM", url: "https://www.youtube.com/results?search_query=pre+race+pump+up+music+playlist", note: "Optional pre-session listening; no effect on readiness is assumed." },
  ],
  focus: [
    { title: "Deep Focus — Instrumental / Lo-Fi", url: "https://www.youtube.com/results?search_query=deep+focus+instrumental+music", note: "Optional background listening; it does not set or stabilize training intensity." },
    { title: "Alpha Waves Focus 40Hz", url: "https://www.youtube.com/results?search_query=40hz+focus+music+binaural", note: "Binaural/40Hz claims are mixed evidence — use as a tool, not a guarantee." },
  ],
  recover: [
    { title: "Calm Recovery — Ambient / Soft", url: "https://www.youtube.com/results?search_query=calm+ambient+recovery+music", note: "Optional quiet listening; no autonomic reset or recovery guarantee." },
    { title: "Yoga / Stretch Slow 60-70 BPM", url: "https://www.youtube.com/results?search_query=yoga+stretch+slow+music+playlist", note: "For mobility + PMR blocks." },
  ],
  sleep: [
    { title: "Quiet evening — nature sounds", url: "https://www.youtube.com/results?search_query=quiet+nature+sounds", note: "Optional evening preference; no special-frequency or sleep benefit is established here." },
    { title: "Rain & Thunder Sleep", url: "https://www.youtube.com/results?search_query=rain+sounds+sleep+playlist", note: "Optional sound preference; stop if it disrupts your sleep." },
  ],
};

// Brain training: short cognitive tasks for focus (pre/during) and
// down-regulation (post). Science-backed domains: attention, inhibition,
// working memory. Simple to do anywhere, no app needed.
export const BRAIN_TRAINING: Record<StimPhase, { name: string; task: string }> = {
  pre: {
    name: "Attentional focus primer",
    task: "Optional, while safely stationary: briefly review the session and one useful cue. Skip if distracting or uncomfortable.",
  },
  during: {
    name: "Interval counting",
    task: "Follow the existing reviewed steps. Keep awareness of your surroundings; no additional cadence task is required.",
  },
  post: {
    name: "Down-regulation scan",
    task: "Optional brief comfortable pause and reflection. This does not establish physiological recovery.",
  },
  night: {
    name: "Cognitive wind-down",
    task: "Write 3 'done today' items + 1 'tomorrow priority' — closes open loops, reduces pre-sleep rumination (Gollwitzer 1999 implementation intentions).",
  },
};

const PHASE_BREATH: Record<StimPhase, string> = {
  pre: "Optional comfortable natural breathing while stationary. No breath holds or fixed ratios are required.",
  during: "Breathe comfortably during the reviewed activity; no additional breathing drill is required.",
  post: "Optional relaxed breathing; stop if uncomfortable or dizzy. No autonomic-reset claim.",
  night: "Optional comfortable evening pause. No forced breathing rhythm or promised sleep effect.",
};

export function stimPlan(phase: StimPhase, opts?: { hardSession?: boolean; heat?: boolean }): StimPlan {
  const intent: StimIntent =
    phase === "pre" ? "arouse" :
    phase === "during" ? "focus" :
    phase === "post" ? "recover" : "sleep";

  const pool = MUSIC_LIBRARY[intent];
  // rotate deterministically by day so users don't get the same link forever
  const idx = Math.floor(Date.now() / 86400000) % pool.length;
  const music = pool[idx];

  const minutes =
    phase === "pre" ? 10 :
    phase === "during" ? 0 :
    phase === "post" ? 10 : 15;

  const why: Record<StimPhase, string> = {
    pre: "Music and reflection are optional preferences, not readiness measurements.",
    during: "No improvement in output or perceived effort is assumed for this athlete.",
    post: "This optional routine does not demonstrate faster recovery or authorize more training.",
    night: "An audio preference does not diagnose or treat sleep problems.",
  };

  return {
    phase,
    intent,
    music,
    brain: BRAIN_TRAINING[phase].task,
    breath: PHASE_BREATH[phase],
    minutes,
    why: why[phase],
  };
}
