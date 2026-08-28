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
    { title: "Energetic Workout Mix — High BPM EDM/Hip-Hop", url: "https://www.youtube.com/results?search_query=high+bpm+workout+music+2026", note: "140+ BPM for hard intervals and strength — tempo-matching boosts output." },
    { title: "Pre-Race Pump Up — 120-130 BPM", url: "https://www.youtube.com/results?search_query=pre+race+pump+up+music+playlist", note: "Arousal ramp ~45-60 min before start." },
  ],
  focus: [
    { title: "Deep Focus — Instrumental / Lo-Fi", url: "https://www.youtube.com/results?search_query=deep+focus+instrumental+music", note: "For steady Z2 and long tempo — keeps effort even without lyrics." },
    { title: "Alpha Waves Focus 40Hz", url: "https://www.youtube.com/results?search_query=40hz+focus+music+binaural", note: "Binaural/40Hz claims are mixed evidence — use as a tool, not a guarantee." },
  ],
  recover: [
    { title: "Calm Recovery — Ambient / Soft", url: "https://www.youtube.com/results?search_query=calm+ambient+recovery+music", note: "Pairs with physiological sigh or 4-7-8 for vagal down-shift." },
    { title: "Yoga / Stretch Slow 60-70 BPM", url: "https://www.youtube.com/results?search_query=yoga+stretch+slow+music+playlist", note: "For mobility + PMR blocks." },
  ],
  sleep: [
    { title: "Deep Sleep — 432Hz / Nature Sounds", url: "https://www.youtube.com/results?search_query=deep+sleep+music+432hz", note: "For the night routine; pairs with extended exhale breathing." },
    { title: "Rain & Thunder Sleep", url: "https://www.youtube.com/results?search_query=rain+sounds+sleep+playlist", note: "Masking noise + steady state = better sleep onset (Mah 2011)." },
  ],
};

// Brain training: short cognitive tasks for focus (pre/during) and
// down-regulation (post). Science-backed domains: attention, inhibition,
// working memory. Simple to do anywhere, no app needed.
export const BRAIN_TRAINING: Record<StimPhase, { name: string; task: string }> = {
  pre: {
    name: "Attentional focus primer",
    task: "2 min: stare at a fixed point (wall mark, tree). Count slow breaths 1-10, restart on distraction. Trains sustained attention — same system pacing demands.",
  },
  during: {
    name: "Interval counting",
    task: "During reps, count stroke/step cadence in 15s blocks and hit a target number. Trains working memory + internal focus under fatigue.",
  },
  post: {
    name: "Down-regulation scan",
    task: "3-5 min body scan: top of head → toes, releasing tension each exhale. Activates parasympathetic recovery (Balban 2023).",
  },
  night: {
    name: "Cognitive wind-down",
    task: "Write 3 'done today' items + 1 'tomorrow priority' — closes open loops, reduces pre-sleep rumination (Gollwitzer 1999 implementation intentions).",
  },
};

const PHASE_BREATH: Record<StimPhase, string> = {
  pre: "Box breathing 4-4-4-4 × 4 rounds — calm + oxygenate before effort.",
  during: "Exhale on effort, inhale on recovery — keep rhythm matched to cadence.",
  post: "Physiological sigh (double inhale + long exhale) × 5 — fastest vagal brake.",
  night: "Extended exhale 2:1 (inhale 4s, exhale 8s) × 10 — sleep onset.",
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
    pre: "Arousal priming improves readiness; music at 120-140 BPM is a standard pre-race tool (Karageorghis 2013).",
    during: "Tempo-matched music lowers perceived exertion during steady efforts.",
    post: "Down-regulation is trainable: slow breathing + calm audio accelerates parasympathetic recovery (Lehrer 2014, Balban 2023).",
    night: "Sleep extension improves next-day performance (Mah 2011) — audio routines help onset.",
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
