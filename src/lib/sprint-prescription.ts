// JasMiamiMethod — Sprint Daily Prescription Engine
// Generates the full pre/during/post arc for sprint athletes (100-400m)
// using velocity zones, energy systems, and event-specific protocols.
// Every element is evidence-cited and adjustable by JASAI via voice/text.

import { SPRINT_ZONES, ELITE_MODEL, type SprintEvent, type SprintPhase } from "./sprint";

export interface SprintPrescription {
  event: SprintEvent;
  phase: SprintPhase;
  weekNumber: number;
  daysUntilRace: number | null;

  // The session
  session: {
    title: string;
    type: string;
    zone: string;
    velocityTarget: string;
    totalQualityMeters: number;
    warmup: string[];
    mainSet: string[];
    cooldown: string[];
  };

  // Pre-workout
  pre: {
    hydration: string;
    nutrition: string;
    ergogenics: { name: string; dose: string; timing: string; evidence: string }[];
    activation: string[];
    visualization: string;
  };

  // During
  during: {
    betweenReps: string;
    hydration: string;
    monitoring: string;
    cues: string[];
  };

  // Post
  post: {
    immediateNutrition: string;
    recoveryProtocol: string[];
    breathing: string;
    sleep: string;
    nextDay: string;
  };

  // JASAI modifiable fields
  aiAdjustable: {
    canAddRep: boolean;
    canRemoveRep: boolean;
    canChangeZone: boolean;
    canRestDay: boolean;
    canSubstituteSport: boolean;
    reason: string;
  };
}

export function prescribeSprintDay(opts: {
  event: SprintEvent;
  phase: SprintPhase;
  weekNumber: number;
  sessionIndex: number; // 0=speed/accel, 1=max velocity/speed endurance, 2=strength heavy, 3=tempo/core, 4=strength power/plyo
  daysUntilRace?: number | null;
  isRaceDay?: boolean;
}): SprintPrescription {
  const { event, phase, sessionIndex, daysUntilRace } = opts;
  const isSpeed = sessionIndex <= 1;
  const isStrength = sessionIndex === 2 || sessionIndex === 4;
  const isTempo = sessionIndex === 3;
  const isRaceWeek = phase === "pre_comp" || phase === "comp";
  const isRaceDay = opts.isRaceDay || false;

  // Determine zone
  const zone = isSpeed
    ? event === "100m" && sessionIndex === 0
      ? SPRINT_ZONES[0] // Acceleration
      : event === "400m" && sessionIndex === 0
      ? SPRINT_ZONES[3] // Speed Endurance II
      : SPRINT_ZONES[1] // Max Velocity
    : isTempo
    ? SPRINT_ZONES[6] // Tempo Extensive
    : null;

  // Volume: reduced in race week
  const volumeMultiplier = isRaceWeek ? 0.5 : phase === "specific_prep" ? 1.0 : 0.8;
  const baseMeters = isSpeed ? (sessionIndex === 0 ? 300 : 240) : isTempo ? 1200 : 0;
  const totalQuality = Math.round(baseMeters * volumeMultiplier);

  // Main set construction
  const mainSet: string[] = [];
  if (isRaceDay) {
    mainSet.push("RACE DAY — see pre-race protocol below");
  } else if (isSpeed && zone) {
    if (zone.name === "Acceleration") {
      const reps = Math.max(4, Math.floor(totalQuality / 20));
      mainSet.push(`${reps} × 10-30m block starts (100% effort)`);
      mainSet.push(`Rest: 2-3 min full recovery between reps`);
      mainSet.push(`Focus: first 3 steps violent, drive phase to 20-30m, transition to upright`);
    } else if (zone.name === "Max Velocity") {
      const reps = Math.max(3, Math.floor(totalQuality / 40));
      mainSet.push(`${reps} × 20-60m fly-in sprints at ${zone.velocityPct * 100}% max velocity`);
      mainSet.push(`Rest: 4-6 min — full recovery is non-negotiable (phosphagen system needs 3-5 min)`);
      mainSet.push(`Fly-in 15-20m build → 20-40m at max velocity → decelerate gradually`);
      mainSet.push(`STOP the set if velocity drops >2% — quality is the stimulus`);
    } else if (zone.name === "Speed Endurance II") {
      const reps = Math.max(3, Math.floor(totalQuality / 120));
      mainSet.push(`${reps} × 120-150m at 90% max velocity`);
      mainSet.push(`Rest: 12-15 min between reps — lactate clearance requires full recovery`);
      mainSet.push(`Focus: maintaining mechanics under fatigue — this is 400m specific`);
    }
  } else if (isStrength) {
    if (sessionIndex === 2) {
      mainSet.push("Back Squat: 4×3 @ 85-90% 1RM (3-4 min rest) — max strength");
      mainSet.push("Romanian Deadlift: 3×5 @ 80% (3 min rest) — posterior chain");
      mainSet.push("Bulgarian Split Squat: 3×5/leg @ 80% — unilateral force");
      mainSet.push("Calf Raise (loaded): 3×8 — ankle stiffness for ground contact");
    } else {
      mainSet.push("Power Clean: 4×3 @ 70-75% 1RM (3 min rest) — RFD");
      mainSet.push("Trap Bar Jump Squat: 4×4 @ 30% 1RM — explosive transfer");
      mainSet.push("Depth Jumps: 3×5 from 40cm box — reactive strength");
      mainSet.push("Single-Leg Bounds: 3×6/leg — sprint-specific plyo");
      mainSet.push("Sled Push (heavy): 4×20m — horizontal force production");
    }
  } else if (isTempo) {
    mainSet.push(`${Math.floor(totalQuality / 100)} × 100m @ 70% max velocity`);
    mainSet.push("Rest: 45-90s between reps (walk back)");
    mainSet.push("Total volume: ~1200m — aerobic recovery, not a workout");
    mainSet.push("Should feel conversational — if you're breathing hard, slow down");
  }

  return {
    event,
    phase,
    weekNumber: opts.weekNumber,
    daysUntilRace: daysUntilRace ?? null,

    session: {
      title: isRaceDay ? `${event} RACE` : isSpeed ? (zone?.name || "Speed") : isStrength ? (sessionIndex === 2 ? "Strength: Heavy" : "Strength: Power + Plyo") : "Tempo + Core",
      type: isRaceDay ? "race" : isSpeed ? "speed" : isStrength ? "strength" : "tempo",
      zone: zone?.name || "N/A",
      velocityTarget: zone ? `${zone.velocityPct * 100}% max velocity` : "N/A",
      totalQualityMeters: totalQuality,
      warmup: [
        "10 min easy jog or bike (raise core temp)",
        "Dynamic stretching: leg swings, hip openers, ankle circles ×10 each",
        "A-skips, B-skips 2×20m — sprint mechanics at low speed",
        "3×20m build to 70%, 80%, 90% — progressive neural activation",
        isSpeed ? "2×10m block starts (practice the first step)" : "Band pull-aparts + glute activation ×15",
      ],
      mainSet,
      cooldown: [
        "10 min walk or easy bike — don't sit down immediately",
        "Static stretching: hip flexors, hamstrings, quads, calves (30s each)",
        "Contrast shower if available (30s hot / 30s cold ×3)",
      ],
    },

    pre: {
      hydration: "400-600ml water + electrolytes in the 90 min before session. Urine should be pale yellow.",
      nutrition: isSpeed || isRaceDay
        ? "Pre-race/speed meal 3h before: 2-3g/kg carbs (rice, oatmeal, toast with honey), moderate protein, low fat + low fiber. Simple carbs 30min before if needed (banana, sports drink)."
        : isStrength
        ? "Pre-strength meal 2h before: 1.5-2g/kg carbs + 30g protein. Creatine 3-5g with this meal."
        : "Pre-tempo meal 1-2h before: 1g/kg carbs, light protein. This is a recovery session — don't overeat.",
      ergogenics: isSpeed || isRaceDay ? [
        { name: "Caffeine", dose: "3-6 mg/kg bodyweight", timing: "45-60 min before", evidence: "Improves RFD and reaction time (Goldstein 2010; ISSN Position Stand)" },
        { name: "Creatine", dose: "3-5g (daily, timing flexible)", timing: "With pre-session meal", evidence: "Increases phosphocreatine pool — directly fuels the ATP-PCr system (ISSN 2025)" },
        { name: "Beta-Alanine", dose: "3.2-6.4g/day (chronic, not acute)", timing: "Daily — takes 4+ weeks to saturate", evidence: event === "400m" ? "Buffers H+ for 40-60s efforts — 400m specific" : "May help repeat sprint recovery (200m)" },
      ] : isStrength ? [
        { name: "Creatine", dose: "3-5g", timing: "With pre-workout meal", evidence: "Increases phosphocreatine for explosive efforts (ISSN)" },
        { name: "Caffeine", dose: "3 mg/kg", timing: "45 min before", evidence: "Improves power output and RFD" },
      ] : [],
      activation: [
        "Glute bridges ×15 + clamshells ×10/side — prime the posterior chain",
        "Ankle hops in place ×20 — prepare stiff ground contacts",
        isSpeed ? "2-3 explosive push-ups — potentiate the nervous system" : "Dead bugs ×10/side — core stability under load",
      ],
      visualization: isRaceDay
        ? "5 min: close your eyes and run the race in your head — the gun, your first 3 steps, the drive phase, the transition at 30m, relax at 60m, hold form through the line. Feel your rhythm. You've done this thousands of times."
        : isSpeed
        ? "3 min: see yourself executing the first step — explosive, violent, perfect mechanics. Feel the track under your feet, hear your breathing, see yourself running fast and relaxed."
        : "2 min: see yourself executing each lift/rep with perfect form. The bar moves fast, the movement feels smooth.",
    },

    during: {
      betweenReps: isSpeed
        ? "Full recovery between reps. Walk back, stay warm, stay focused. No standing around getting cold — use a jacket if needed. This is neural training, not cardio — the rest IS the training."
        : "2-4 min between sets. Use the time to visualise the next rep or set.",
      hydration: "Sip water between sets (150-250ml every 15 min). Add electrolytes if session >60 min or hot conditions.",
      monitoring: isSpeed
        ? "Track: rep times (stopwatch or app), how the legs feel (RPE 1-10), and whether you're maintaining mechanics. If times drop >2% from your best rep, STOP — you're now training slowness."
        : "Track: weights lifted, bar speed (should be fast/intentional), and RPE. Leave 1-2 reps in reserve on strength sets.",
      cues: [
        isSpeed ? "Stay tall, hips forward, strike the ground hard and fast" : "",
        isSpeed ? "Relax your face and hands — tension wastes energy at speed" : "",
        event === "400m" ? "Distribute: first 200m controlled, back off 5% at 250m, then everything you have from 300m" : "",
        event === "200m" ? "The curve is won in the first 50m — attack it, then relax and run" : "",
        event === "100m" ? "Drive phase to 30m, transition by 50m, max velocity at 60-70m, hold form" : "",
      ].filter(Boolean),
    },

    post: {
      immediateNutrition: isSpeed || isRaceDay
        ? "WITHIN 30 MIN: 1.2g/kg carbs + 0.3g/kg protein (chocolate milk + banana, or recovery shake). Sprinting depletes muscle glycogen — the window matters."
        : isStrength
        ? "WITHIN 60 MIN: 0.3g/kg protein + 1g/kg carbs (whey + rice, or chicken + sweet potato). Muscle protein synthesis is elevated for 24-48h post-strength."
        : "Within 2h: normal meal with 20-30g protein + carbs. Tempo is low stress — no urgent window.",
      recoveryProtocol: [
        isSpeed ? "Neural recovery: 10 min easy walk + 10 min legs-up-the-wall. Speed work taxes the CNS." : "Light movement: 10 min easy walk or bike.",
        "Contrast immersion: 30s cold / 60s warm ×3 if available — reduces DOMS without blunting adaptation",
        "Soft tissue: foam roll quads, hamstrings, calves, glutes 5 min",
        "Grade your recovery: how do you feel 2h post? 1-10 scale — below 5 means tomorrow should be easier",
      ],
      breathing: "10 min extended-exhale breathing: inhale 4s → exhale 8s × 15 rounds. Shifts the autonomic nervous system from sympathetic (fight) to parasympathetic (recover). Critical after speed work — your CNS is highly aroused.",
      sleep: "Target 8-9h tonight. Speed adaptations consolidate during sleep — growth hormone peaks in deep sleep. If you sleep <7h after a speed session, reduce tomorrow's intensity.",
      nextDay: isSpeed
        ? "Tomorrow should be tempo or strength (not speed). CNS needs 48h between max-velocity sessions."
        : isStrength
        ? "Tomorrow can be speed if the legs feel good — check CMJ or first few steps. If soreness >5/10, make it tempo."
        : "Tomorrow can be speed or strength — you should feel recovered after tempo.",
    },

    aiAdjustable: {
      canAddRep: !isRaceWeek,
      canRemoveRep: true,
      canChangeZone: !isRaceDay,
      canRestDay: true,
      canSubstituteSport: isTempo, // tempo can become swim/bike; speed/strength should stay
      reason: isRaceDay ? "Race day — no modifications" : isRaceWeek ? "Race week — volume already reduced, only removal allowed" : "Full adjustability in this phase",
    },
  };
}
