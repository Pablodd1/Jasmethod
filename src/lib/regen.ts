// JasMiamiMethod — Workout regeneration engine.
// Variants retain the intended sport and allocation. Alternate modalities
// provide another conditioning option, not an equivalent physiological stimulus.
// Generic alternatives cannot establish eligibility for explosive lifts or jumps.

export interface RegenSession {
  sport: string;
  type: string;
  intensity?: string;
  title: string;
  description: string;
}

const fmtMin = (m: number) => `${Math.floor(m / 60) ? `${Math.floor(m / 60)}h ` : ""}${m % 60 ? `${m % 60}m` : ""}`.trim() || `${m}m`;

// ---- SAME-SPORT STRUCTURAL VARIANTS (3 per sport x type; seed 0..2) ----
// seed 0 mirrors the plan template; 1 and 2 restructure while keeping the
// zone and total work.
export function variantFor(sport: string, type: string, zone: string, minutes: number, seed: number): { title: string; description: string } {
  const work = Math.max(15, minutes - 25);
  const z = zone.toUpperCase();
  const s = ((seed % 3) + 3) % 3;

  if (sport === "run") {
    if (type === "threshold" || z === "Z4") {
      return [
        { title: "Run: Threshold", description: `Main: 3×10 min at T-pace (${z}) with 3 min easy jog between. Classic — steady, repeatable.`, },
        { title: "Run: Cruise Intervals", description: `Main: 5×6 min at T-pace (${z}) with 90s jog — shorter reps, same total threshold time, quicker feel.`, },
        { title: "Run: Threshold Wave", description: `Main: 2×(8 min T-pace + 2 min marathon effort + 4 min T-pace) with 4 min jog between — wave the intensity inside the threshold load.`, },
      ][s];
    }
    if (type === "interval" || z === "Z5" || z === "Z6") {
      return [
        { title: "Run: VO2 Intervals", description: `Main: 6×800m at ~5k pace (${z}) with 400m jog recovery. Stop the set if pace drops.`, },
        { title: "Run: Short-Sharp Reps", description: `Main: 10×400m at 5k-3k pace (${z}) with 200-300m jog — more touches at speed, shorter exposures.`, },
        { title: "Run: Hill VO2", description: `Main: 8×90s uphill at hard effort (${z}, grade does the intensity) jog-down recovery — eccentric-light, legs stay fresher.`, },
      ][s];
    }
    if (type === "tempo" || z === "Z3") {
      return [
        { title: "Run: Tempo", description: `Main: ${Math.min(40, work)} min continuous at comfortably-hard (${z}) — marathon-ish effort.`, },
        { title: "Run: Tempo Blocks", description: `Main: 3×${Math.round(work / 4)} min at ${z} with 3 min easy — same tempo load, broken into friendlier blocks.`, },
        { title: "Run: Progression", description: `Main: ${Math.min(45, work)} min progression — last third at ${z}. Starts easy, finishes tempo.`, },
      ][s];
    }
    return [
      { title: "Run: Easy Aerobic", description: `Main: ${Math.round(work)} min easy ${z}. Conversational; cap HR at 89% LTHR.`, },
      { title: "Run: Easy + Strides", description: `Main: ${Math.round(work * 0.85)} min easy + 6×20s strides at Z5 with full recovery — easy volume plus nervous-system sparks.`, },
      { title: "Run: Fartlite", description: `Main: ${Math.round(work)} min easy with 4×1 min relaxed surges (Z3) sprinkled — easy day that never gets boring.`, },
    ][s];
  }

  if (sport === "bike") {
    if (type === "threshold" || z === "Z4") {
      return [
        { title: "Bike: Threshold", description: `Main: 3×10 min at 91-105% FTP with 5 min easy spin.`, },
        { title: "Bike: Over-Unders", description: `Main: 3×(4 min @95% + 1 min @110% + 4 min @95%) with 5 min easy — threshold with spikes, race-realistic.`, },
        { title: "Bike: Sweet Spot", description: `Main: 4×${Math.round(work / 5)} min at 88-94% FTP with 4 min spin — slightly under threshold, more total load.`, },
      ][s];
    }
    if (type === "interval" || z === "Z5" || z === "Z6") {
      return [
        { title: "Bike: VO2 Intervals", description: `Main: 5×4 min at 106-120% FTP with 4 min easy.`, },
        { title: "Bike: 40/20s", description: `Main: 2 sets of 13×(40s @120-130% / 20s easy) with 5 min between — classic VO2 in micro-doses.`, },
        { title: "Bike: Ramp Intervals", description: `Main: 4×5 min stepping 105%→115% FTP inside each rep, 4 min easy between.`, },
      ][s];
    }
    if (type === "tempo" || z === "Z3") {
      return [
        { title: "Bike: Tempo", description: `Main: 2×${Math.round(work / 2.5)} min at 76-90% FTP with 8 min easy.`, },
        { title: "Bike: Tempo Mixed Terrain", description: `Main: ${Math.round(work)} min steady with 6×90s seated-force efforts at tempo+ (big gear, low cadence 55-60rpm) — strength-endurance flavor.`, },
        { title: "Bike: Tempo Cadence Play", description: `Main: 3×${Math.round(work / 4)} min tempo alternating 2 min @95rpm / 2 min @70rpm — same load, new stimulus.`, },
      ][s];
    }
    return [
      { title: "Bike: Endurance", description: `Main: ${Math.round(work)} min steady Z2, cadence 85-95.`, },
      { title: "Bike: Endurance + Sprints", description: `Main: ${Math.round(work * 0.9)} min Z2 with 4×15s max sprints (long recovery) at the end — aerobic day plus neuromuscular pop.`, },
      { title: "Bike: Endurance Low-Cadence", description: `Main: ${Math.round(work)} min Z2 with 3×6 min @65rpm force blocks — aerobic engine with a muscle-strength twist.`, },
    ][s];
  }

  if (sport === "swim") {
    if (type === "threshold" || z === "Z4" || type === "interval") {
      return [
        { title: "Swim: Threshold Set", description: `Main: 8×100m at CSS pace with 20s rest (or 4×200m with 30s).`, },
        { title: "Swim: Broken 1500", description: `Main: 3×(300m easy / 200m CSS / 100m fast) with 30s rest — race-pace skills inside a threshold set.`, },
        { title: "Swim: Descend Ladder", description: `Main: 6×150m descending 1-3 (each triplet faster), 25s rest — learns pace control at speed.`, },
      ][s];
    }
    return [
      { title: "Swim: Aerobic + Technique", description: `Main: ${Math.max(8, Math.round(work / 4))}×(150m easy + 50m drill: catch-up, fingertip drag, 3-3-3 breathing).`, },
      { title: "Swim: Pull Endurance", description: `Main: ${Math.round(work / 5)}×100m pull-buoy easy-moderate, focus on long catch and body line.`, },
      { title: "Swim: Kick + Swim", description: `Main: 8×50m kick strong + 8×75m easy swim alternating — builds the kick the race start needs.`, },
    ][s];
  }

  if (sport === "strength" || type === "strength") {
    return [
      { title: "Strength: Compound", description: `Main: familiar coach-reviewed squat, hinge, press and pull movements within the allocated time. Select tolerable loads, repetitions and full recovery from movement technique and training history; no jumps are assigned automatically.`, },
      { title: "Strength: Circuit", description: `Main: familiar coach-reviewed squat, pull, press and trunk movements within the allocated time. Adjust circuit repetitions and rest to current technique and tolerance; no explosive movements or fixed loaded dose is assumed.`, },
      { title: "Strength: Unilateral + Core", description: `Main: familiar coach-reviewed single-leg, hinge, press and trunk movements within the allocated time. Choose tolerable loads, repetitions and recovery from movement technique and training history; this does not guarantee correction of asymmetry or injury prevention.`, },
    ][s];
  }

  if (sport === "hyrox" || type === "brick") {
    return [
      { title: "Compromised Run: Station Intervals", description: `Main: run 1km → station (rotating: ski/sled/wallball) → run 1km → next, ×4.`, },
      { title: "Compromised Run: Wall Ball Chain", description: `Main: 5×(400m run + 20 wall balls) — shorter runs, higher station density.`, },
      { title: "Compromised Run: Sled Finisher", description: `Main: 4×(500m run + 25m sled push + 25m sled pull) — brute-force version, grip and drive.`, },
    ][s];
  }

  // recovery / fallback: same shape, new flavor
  return [
    { title: "Recovery: Flush", description: `Main: ${Math.round(work)} min anything-goes Z1 — walk, spin, swim, stretch. Blood flow, not fitness.`, },
    { title: "Recovery: Mobility Flow", description: `Main: ${Math.round(work)} min mobility flow — hips, ankles, T-spine, shoulders. Breathe through it.`, },
    { title: "Recovery: Easy + Breath", description: `Main: 20 min easy movement + 10 min breathing down-regulation (extended exhale 2:1).`, },
  ][s];
}

// ---- CROSS-MODALITY ALTERNATES ----
// Recovery remains recovery. Other modalities change the training stimulus;
// specific movement and experience review is required before optional power work.
export function alternateFor(sport: string, type: string, zone: string, minutes: number, athleteGoal: string): RegenSession {
  const z = zone.toUpperCase();
  const aerobic = z === "Z1" || z === "Z2" || type === "endurance";
  const speed = z === "Z5" || z === "Z6" || z === "Z7" || type === "interval";
  const m = Math.max(20, minutes);

  if (type === "recovery") {
    return { sport: "recovery", type: "recovery", intensity: "z1", title: "Recovery: Mobility + Breath", description: `Main: ${Math.round(m * 0.6)} min mobility flow (hips, ankles, T-spine) + ${Math.round(m * 0.3)} min extended-exhale breathing 2:1. Day stays a day off in disguise.` };
  }

  if (speed || type === "threshold" || z === "Z4" || z === "Z3") {
    const focus = sport === "swim" ? "Upper-body" : athleteGoal === "cycle" ? "Cycling support" : "General";
    return { sport: "strength", type: "strength", intensity: "z3", title: `Alt: ${focus} strength preparation`, description: `Use familiar coach-reviewed strength movements within the allocated time, with tolerable loads and adequate recovery. This changes the stimulus from the original ${sport} ${type} session; it is not an equivalent sport-specific dose. Optional plyometrics or explosive lifts need specific movement, experience, equipment and tolerance review; no jumps are prescribed automatically.` };
  }

  if (aerobic || type === "tempo") {
    const goalSports: Record<string, string[]> = {
      run: ["bike", "swim"], bike: ["run", "swim"], swim: ["run", "bike"],
      strength: ["bike", "run"], hyrox: ["run", "bike"], boxing: ["run", "bike"],
    };
    const pool = goalSports[sport] || ["bike", "run"];
    const pick = pool[minutes % pool.length]; // stable per day
    const altTitle = pick === "run" ? "Alt: Easy Run" : pick === "bike" ? "Alt: Endurance Ride" : "Alt: Aerobic Swim";
    const altDesc =
      pick === "run" ? `Main: ${Math.round(m)} min easy Z2 run (conversational). Same aerobic goal as your ${sport} session — the engine doesn't care about the machine.` :
      pick === "bike" ? `Main: ${Math.round(m)} min steady Z2 ride, cadence 85-95. Same aerobic goal as your ${sport} session, zero impact.` :
      `Main: ${Math.max(600, Math.round(m * 12))}m easy-moderate swim with technique drills. Same aerobic goal, full-body and gentle on the legs.`;
    return { sport: pick, type: "endurance", intensity: "z2", title: altTitle, description: altDesc };
  }

  // A generic strength alternate retains controlled familiar movement.
  return { sport: "strength", type: "strength", intensity: "z3", title: "Alt: Strength practice — review first", description: "Use familiar coach-reviewed strength and trunk movements within the allocated time, with tolerable loads and adequate recovery. Optional plyometrics require specific movement, experience, equipment and tolerance review; no jumps or explosive lifts are assigned automatically." };
}
