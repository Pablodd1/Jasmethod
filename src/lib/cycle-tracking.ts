// JasMiamiMethod — Female athlete cycle tracking.
// Stores cycle dates, flow, and symptoms. The training engine uses this
// CONTEXTUALLY — it never applies an automatic readiness penalty based on
// cycle day alone. Adjustments come from the athlete's own reported symptoms
// and energy, not from a calendar formula (McNulty 2020: individual
// variability dominates).

export interface CycleEntry {
  date: string;           // YYYY-MM-DD
  flow: "light" | "medium" | "heavy" | "spotting" | null;
  symptoms: string[];     // cramps | headache | fatigue | breast_tenderness | nausea
  notes?: string;
}

export function cyclePhase(dayOfCycle: number): {
  phase: string;
  description: string;
  trainingNote: string;
  evidence: string;
} {
  if (dayOfCycle <= 5) {
    return {
      phase: "Menstrual",
      description: "Bleeding phase — energy may be lower, cramps possible",
      trainingNote: "Light or moderate training is fine if you feel up to it. Strength can be maintained. If cramps are severe, rest or do mobility.",
      evidence: "ISSN Combat 2025; McNulty 2020 (individual variability dominates)",
    };
  }
  if (dayOfCycle <= 13) {
    return {
      phase: "Follicular",
      description: "Estrogen rising — energy and strength typically improving",
      trainingNote: "Good window for higher intensity, strength gains, and pushing threshold sessions.",
      evidence: "Niering 2024 (strength favours late follicular); McNulty 2020",
    };
  }
  if (dayOfCycle <= 16) {
    return {
      phase: "Ovulatory",
      description: "Peak estrogen — typically strongest, but ligament laxity slightly increased",
      trainingNote: "Peak power window. Great for max lifts and race-pace work. Warm up thoroughly (injury risk slightly higher).",
      evidence: "Niering 2024; McNulty 2020",
    };
  }
  if (dayOfCycle <= 22) {
    return {
      phase: "Early Luteal",
      description: "Progesterone rising — core temp up, perceived effort higher",
      trainingNote: "Maintain training but expect slightly higher perceived effort. Hydration matters more (core temp elevated).",
      evidence: "McNulty 2020; Carmichael 2021",
    };
  }
  return {
    phase: "Late Luteal",
    description: "PMS window — energy lowest, cravings, possible mood changes",
    trainingNote: "Reduce intensity if needed. Easy aerobic + mobility are ideal. Don't skip — movement helps PMS symptoms.",
    evidence: "McNulty 2020 (individual variability); Pletz 2022",
  };
}
