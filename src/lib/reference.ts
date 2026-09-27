// JasMiamiMethod — reference data library.
// Extracted from science.ts (consolidation sprint): stable lookup tables that
// are DATA, not logic — blood ranges, DNA traits, nutrition consensus, and
// the motivation library. science.ts re-exports everything, so importers are
// unchanged.

// ---- Blood panel reference ranges (post-2000 clinical + sports medicine) ----
// Sources: Brutsaert et al. 2003 (iron & endurance), Peeling et al. 2008 (females),
// Ross et al. 2016 (hemoglobin & VO2max), Holick 2007 (vitamin D), and
// standard clinical ranges (Mayo Clinic / AACC 2020).
export const BLOOD_REFERENCE: Record<string, { unit: string; refLow: number; refHigh: number; athleteNote: string }> = {
  Hemoglobin: { unit: "g/dL", refLow: 13.5, refHigh: 17.5, athleteNote: "Athletes often run 0.5-1.0 g/dL lower due to plasma volume expansion (Ross 2016)." },
  Hematocrit: { unit: "%", refLow: 38.3, refHigh: 48.6, athleteNote: "Dilutional pseudoanemia is common in endurance athletes — not pathology." },
  Ferritin: { unit: "ng/mL", refLow: 30, refHigh: 300, athleteNote: "For endurance athletes, target ≥50-60 ng/mL; <30 = deficient (Peeling 2008)." },
  "Vitamin D": { unit: "ng/mL", refLow: 30, refHigh: 80, athleteNote: "Optimize to 40-60 ng/mL; deficiency impairs muscle function & immunity (Holick 2007)." },
  "Vitamin B12": { unit: "pg/mL", refLow: 200, refHigh: 900, athleteNote: "Vegetarian athletes at higher risk of low B12." },
  Folate: { unit: "ng/mL", refLow: 3.1, refHigh: 20, athleteNote: "Needed for red cell production." },
  Testosterone: { unit: "ng/dL", refLow: 300, refHigh: 1000, athleteNote: "Overtraining can suppress T; total T <300 warrants investigation (male)." },
  Cortisol: { unit: "µg/dL", refLow: 6, refHigh: 23, athleteNote: "Morning cortisol trends matter more than single values — chronic elevation = overreach." },
  "TSH": { unit: "mIU/L", refLow: 0.4, refHigh: 4.0, athleteNote: "Even subclinical hypothyroidism impairs performance." },
  "Total Cholesterol": { unit: "mg/dL", refLow: 125, refHigh: 200, athleteNote: "Endurance training usually improves HDL/LDL ratio." },
  HDL: { unit: "mg/dL", refLow: 40, refHigh: 90, athleteNote: "HDL >60 mg/dL is protective; training raises it." },
  LDL: { unit: "mg/dL", refLow: 0, refHigh: 100, athleteNote: "Athletes can tolerate slightly higher LDL if HDL is high." },
  Triglycerides: { unit: "mg/dL", refLow: 0, refHigh: 150, athleteNote: "Low TG + high HDL = the endurance athlete signature." },
  Glucose: { unit: "mg/dL", refLow: 70, refHigh: 100, athleteNote: "Fasting glucose <100; train low sessions can transiently lower it." },
  HbA1c: { unit: "%", refLow: 4, refHigh: 5.6, athleteNote: "Carbohydrate loading doesn't meaningfully change A1c in healthy athletes." },
  Creatinine: { unit: "mg/dL", refLow: 0.74, refHigh: 1.35, athleteNote: "Higher muscle mass → slightly higher creatinine is normal." },
  "Creatine Kinase": { unit: "U/L", refLow: 39, refHigh: 308, athleteNote: "CK spikes 24-72h after hard sessions; chronic elevation = inadequate recovery." },
  CRP: { unit: "mg/L", refLow: 0, refHigh: 3, athleteNote: "High-sensitivity CRP >3 mg/L with fatigue = investigate overtraining or infection." },
  "Iron": { unit: "µg/dL", refLow: 60, refHigh: 170, athleteNote: "Total iron is less informative than ferritin + transferrin saturation." },
  "Transferrin Saturation": { unit: "%", refLow: 15, refHigh: 50, athleteNote: "TSAT <15% = functional iron deficiency even with normal ferritin (Brutsaert 2003)." },
  Magnesium: { unit: "mg/dL", refLow: 1.7, refHigh: 2.2, athleteNote: "Athletes lose Mg in sweat; deficiency worsens cramps & sleep." },
  Sodium: { unit: "mmol/L", refLow: 135, refHigh: 145, athleteNote: "Hyponatremia risk in long events — match fluids to sweat rate (Noakes 2003)." },
  Potassium: { unit: "mmol/L", refLow: 3.5, refHigh: 5.0, athleteNote: "Sweat potassium losses are usually covered by diet." },
  "Uric Acid": { unit: "mg/dL", refLow: 3.5, refHigh: 7.2, athleteNote: "Elevated with hard training volume; also antioxidant (controversial)." },
  "White Blood Cells": { unit: "K/µL", refLow: 4.5, refHigh: 11, athleteNote: "High volume training can cause transient leucopenia — check with fatigue." },
};


// ---- DNA sport-relevant SNPs (post-2000 genomics of performance) ----
// References: Yang et al. 2003 ACTN3 R577X (Nat Genet 34:460-461); Montgomery et al. 1998
// ACE I/D; Bouchard et al. 2011 HERITAGE VO2max trainability; MacArthur & North 2004.
export const DNA_TRAITS: { rsid: string; gene: string; trait: string; pairs: Record<string, { impact: string; note: string }> }[] = [
  {
    rsid: "rs1815739", gene: "ACTN3", trait: "Power vs Endurance Profile",
    pairs: {
      "CC": { impact: "beneficial", note: "RR genotype (C/C): α-actinin-3 present — sprint/power advantage (Yang 2003). Sprint-trained athletes overrepresented." },
      "CT": { impact: "neutral", note: "RX heterozygote: mixed profile — well suited to triathlon's hybrid demands." },
      "TT": { impact: "beneficial", note: "XX genotype: ACTN3 deficiency — associated with elite endurance performance (Eynon 2009). Common among pro cyclists/rowers." },
    },
  },
  {
    rsid: "rs4646994", gene: "ACE", trait: "Endurance Adaptation (I/D)",
    pairs: {
      "II": { impact: "beneficial", note: "II genotype: higher ACE activity → better endurance economy, high-altitude performance (Montgomery 1998; Gayagay 1998)." },
      "ID": { impact: "neutral", note: "Heterozygote: balanced." },
      "DD": { impact: "caution", note: "DD genotype: sprint/power association; may require more careful volume progression to avoid overuse injury." },
    },
  },
  {
    rsid: "rs4680", gene: "COMT", trait: "Pain Tolerance & Stress Response",
    pairs: {
      "GG": { impact: "neutral", note: "Val/Val: fast catecholamine breakdown — lower baseline pain tolerance, benefits from mental skills training." },
      "GA": { impact: "neutral", note: "Val/Met: intermediate." },
      "AA": { impact: "beneficial", note: "Met/Met: higher endogenous dopamine — better pain tolerance & stress resilience under load." },
    },
  },
  {
    rsid: "rs8192678", gene: "PPARGC1A", trait: "VO2max Trainability",
    pairs: {
      "AA": { impact: "neutral", note: "Gly482: standard trainability." },
      "AG": { impact: "neutral", note: "Heterozygote." },
      "GG": { impact: "caution", note: "Ser482 variant: associated with lower aerobic training response in some cohorts (Bouchard 2011). Requires more consistent Z2 volume." },
    },
  },
  {
    rsid: "rs1799983", gene: "NOS3", trait: "Blood Flow & Oxygen Delivery",
    pairs: {
      "GG": { impact: "beneficial", note: "Glu298Glu: normal eNOS — good microcirculation for endurance." },
      "GT": { impact: "neutral", note: "Heterozygote." },
      "TT": { impact: "caution", note: "Asp298 variant: reduced NO production — prioritize aerobic base and recovery; some studies link to hypertension risk." },
    },
  },
  {
    rsid: "rs1042713", gene: "ADRB2", trait: "Cardiorespiratory Response",
    pairs: {
      "AA": { impact: "beneficial", note: "Gly16Gly: favorable bronchodilation & VO2max response to training." },
      "AG": { impact: "neutral", note: "Heterozygote." },
      "GG": { impact: "neutral", note: "Arg16: fine — monitor respiratory response to hard intervals." },
    },
  },
];


// ---- Nutrition guidance (post-2000 sports nutrition consensus) ----
// Burke et al. 2001/2011 (carb periodization); Thomas et al. 2016 (ACSM/AND/DC joint position);
// Jeukendrup 2011 (multiple transportable carbs); Phillips & Van Loon 2011 (protein).

export const NUTRITION_GUIDELINES = {
  dailyProtein: { endurance: 1.2, strength: 1.6, unit: "g/kg", source: "Thomas et al. 2016 (ACSM/AND/DC)" },
  carbDuring: { under1h: 0, under2h: 30, over2h: 60, unit: "g/h", source: "Jeukendrup 2011" },
  carbLong: { target: 90, unit: "g/h", source: "Jeukendrup 2014 — multiple transportable carbs" },
  hydration: { sweatRate: 0.8, range: "0.4-1.2", unit: "L/h", source: "Noakes 2003; ACSM 2007" },
  sodium: { target: 700, range: "400-1000", unit: "mg/L", source: "ACSM 2007" },
  proteinPost: { target: 0.3, unit: "g/kg within 2h", source: "Phillips & Van Loon 2011" },
};
// ---- Daily motivation engine ----
// Original JMM coaching cues, not attributed quotations or research findings.
export const MOTIVATION_LIBRARY = [
  { quote: "Consistency includes recovery.", science: "Completion alone does not demonstrate adaptation.", coach: "Follow the agreed purpose of today's session; more is not automatically better." },
  { quote: "A useful check-in starts with an honest answer.", science: "Missing measurements are unknown, not evidence of good recovery.", coach: "Share your energy, soreness and available time before training." },
  { quote: "Preparation makes the next step easier.", science: "A training prescription should retain its intended targets and recovery intervals.", coach: "Review the session steps and prepare your equipment." },
  { quote: "Feedback is part of training.", science: "Planned and completed training are different observations.", coach: "Record what you actually did and how it felt." },
  { quote: "An easy day has its own purpose.", science: "A reassuring single metric does not establish readiness for a harder session.", coach: "Keep easy efforts easy. Discuss changes with your coach." },
];

export function dailyMotivation(dayIndex: number, style = "coach", lang = "en"): { quote: string; message: string } {
  const index = Number.isFinite(dayIndex) ? Math.abs(Math.trunc(dayIndex)) % MOTIVATION_LIBRARY.length : 0;
  if (lang === "es") {
    const cues = [
      { quote: "La constancia incluye la recuperación.", message: "Respeta el propósito de la sesión; más no siempre es mejor." },
      { quote: "Una evaluación útil empieza con una respuesta honesta.", message: "Comparte tu energía, molestias y tiempo disponible antes de entrenar." },
      { quote: "La preparación facilita el próximo paso.", message: "Revisa los pasos de la sesión y prepara tu equipo." },
      { quote: "Tus sensaciones son parte del entrenamiento.", message: "Registra lo que hiciste y cómo te sentiste." },
      { quote: "Un día suave tiene su propio propósito.", message: "Mantén suaves los esfuerzos suaves. Consulta los cambios con tu entrenador." },
    ];
    return cues[index];
  }
  const item = MOTIVATION_LIBRARY[index];
  return { quote: item.quote, message: style === "science" ? item.science : item.coach };
}

export interface DailyMotivationContext {
  date: string;
  name?: string | null;
  goal?: string | null;
  sessionTitle?: string | null;
  rest?: boolean;
  checkinComplete?: boolean;
  enabled?: boolean;
  style?: string;
  lang?: string;
}

/** Deterministic, preference-controlled cue. Does not send observations to an AI. */
export function personalizedDailyMotivation(context: DailyMotivationContext): {
  quote: string; message: string; source: "JMM coaching cue";
} | null {
  if (context.enabled === false) return null;
  const day = Date.parse(`${context.date.slice(0, 10)}T12:00:00Z`);
  const cue = dailyMotivation(Number.isFinite(day) ? Math.floor(day / 86400000) : 0, context.style, context.lang);
  const name = context.name?.trim().slice(0, 60);
  const goal = context.goal?.trim().slice(0, 120);
  const session = context.sessionTitle?.trim().slice(0, 160);
  const action = context.rest
    ? "Today is for recovery. Rest belongs in your plan; do not add training to make up for it."
    : context.checkinComplete !== true
      ? "Complete your daily check-in before deciding whether today's planned session fits how you feel."
      : session
        ? `For ${session}, follow the agreed targets and recovery periods. Record the actual session and how it felt.`
        : "Review today's plan with your coach; no session has been provided in this briefing.";
  if (context.lang === "es") {
    const actionEs = context.rest ? "Hoy toca recuperación. Descansa; no añadas entrenamiento para compensar."
      : context.checkinComplete !== true ? "Completa tu evaluación diaria antes de decidir si la sesión de hoy encaja con cómo te sientes."
      : session ? `Para ${session}, sigue los objetivos y descansos acordados. Registra lo realizado y tus sensaciones.`
      : "Revisa el plan de hoy con tu entrenador; este resumen no contiene una sesión.";
    return { quote: context.rest ? "La recuperación también tiene propósito." : cue.quote,
      message: `${name ? `${name}, ` : ""}${actionEs}${goal ? ` Tu objetivo: ${goal}.` : ""}${context.rest ? "" : ` ${cue.message}`}`,
      source: "JMM coaching cue" };
  }
  return { quote: context.rest ? "Recovery is purposeful training time." : cue.quote,
    message: `${name ? `${name}, ` : ""}${action}${goal ? ` Your goal: ${goal}.` : ""}${context.rest ? "" : ` ${cue.message}`}`,
    source: "JMM coaching cue" };
}
