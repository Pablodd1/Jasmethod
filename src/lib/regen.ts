// JasMiamiMethod — Workout regeneration engine.
// Two modes, both preserving the SESSION GOAL (zone, duration, weekly intent):
//  - variant:   same sport, same intensity, different structure (steps, rep
//               lengths, set shapes) picked deterministically by regen seed.
//  - alternate: different modality with the same training effect, chosen by
//               the session's goal — aerobic days swap run/bike/swim freely;
//               speed/strength days become plyometrics or weights (specific
//               to the athlete's sport); recovery stays recovery.
// All alternatives respect the mandatory plyometrics rule and sport specificity.

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
      { title: "Strength: Compound", description: `Main: squat, deadlift/hinge, press, row — 3-5×5-8 heavy + plyometric primer (box jumps 3×5). Leave 2 reps in reserve.`, },
      { title: "Strength: Circuit", description: `Main: 4 rounds — 8 weighted step-ups/leg, 8 pull-ups/rows, 12 push-ups, 30s plank, 8 med-ball slams. Density format, same total work.`, },
      { title: "Strength: Unilateral + Core", description: `Main: 3×8/leg Bulgarian split squat + single-leg RDL, 3×10 single-arm press, Pallof 3×10/side, hanging knee raises 3×10 — fixes sides, protects spine.`, },
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

// ---- CROSS-MODALITY ALTERNATES (same training effect, different sport) ----
// Aerobic days: rotate run/bike/swim (specificity preserved per the athlete's
// sport profile; the weekly plan re-balances). Speed/strength days: everyone
// earns plyometrics or weights — runners and cyclists get run/ride-specific
// plyo, swimmers get upper-body-dominant plyo + pull strength, HYROX athletes
// get station-specific power. Recovery stays recovery.
export function alternateFor(sport: string, type: string, zone: string, minutes: number, athleteGoal: string): RegenSession {
  const z = zone.toUpperCase();
  const aerobic = z === "Z1" || z === "Z2" || type === "endurance";
  const speed = z === "Z5" || z === "Z6" || z === "Z7" || type === "interval";
  const m = Math.max(20, minutes);

  if (type === "recovery") {
    return { sport: "recovery", type: "recovery", intensity: "z1", title: "Recovery: Mobility + Breath", description: `Main: ${Math.round(m * 0.6)} min mobility flow (hips, ankles, T-spine) + ${Math.round(m * 0.3)} min extended-exhale breathing 2:1. Day stays a day off in disguise.` };
  }

  if (speed || type === "threshold" || z === "Z4" || z === "Z3") {
    // Quality day -> plyometrics (mandatory rule lives here too) or power strength
    const isSwimmer = sport === "swim";
    const isCyclist = athleteGoal === "cycle";
    if (isSwimmer) {
      return { sport: "strength", type: "plyo", intensity: "z3", title: "Alt: Upper Plyo + Pull Strength", description: `Main (same goal as your ${type} day, new modality): plyo push-ups 4×8, med-ball chest pass 4×8, clap push-ups 3×5 + weighted pull-ups/rows 4×6, rotator band work 3×15. Explosive upper body = a faster catch and pull. Full recoveries, land/hit quiet (Ramírez-Campillo 2022).` };
    }
    if (isCyclist) {
      return { sport: "strength", type: "plyo", intensity: "z3", title: "Alt: Cycling Power Plyo", description: `Main (same goal as your ${type} day, new modality): jump squats 4×6, single-leg pogo hops 3×20s/leg, box jumps 4×5 + hip thrust 4×6, single-leg press 4×8/leg. Explosive legs push bigger watts (Ramírez-Campillo 2022).` };
    }
    return { sport: "strength", type: "plyo", intensity: "z3", title: "Alt: Plyometric Power", description: `Main (same goal as your ${type} day, new modality): depth jumps 4×5, bounds 4×20m, single-leg hops 3×10/leg, sprint starts 4×15m + core anti-rotation 3×10/side. Full recovery between sets — stiffness and speed (Ramírez-Campillo 2022).` };
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

  // strength day -> plyo alternate
  return { sport: "strength", type: "plyo", intensity: "z3", title: "Alt: Plyometrics", description: `Main (same strength goal, explosive form): box jumps 4×5, broad jumps 3×5, pogo hops 3×20s, med-ball throws 4×8 + heavy carry 3×40m. Power is strength expressed fast (Ramírez-Campillo 2022).` };
}
