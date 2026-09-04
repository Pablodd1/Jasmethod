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
// Combines science-grounded coaching cues with psychology research
// (self-determination theory — Ryan & Deci 2000; implementation intentions — Gollwitzer 1999).
export const MOTIVATION_LIBRARY: { quote: string; science: string; coach: string; es?: { quote: string; coach: string } }[] = [
  { quote: "The body achieves what the mind believes.", science: "Self-efficacy is one of the strongest predictors of endurance performance (Hagger et al. 2001).", coach: "Today is a brick in the wall. Lay it well.", es: { quote: "El cuerpo logra lo que la mente cree.", coach: "Hoy pones un ladrillo en la pared. Colócalo bien." } },
  { quote: "Discipline is choosing what you want most over what you want now.", science: "Delay of gratification and habit automation are trainable (Gollwitzer 1999 implementation intentions).", coach: "Set your gear out tonight. Remove the choice, remove the friction.", es: { quote: "La disciplina es elegir lo que más quieres sobre lo que quieres ahora.", coach: "Deja tu equipo listo esta noche. Sin decisión, sin fricción." } },
  { quote: "You don't rise to the level of your goals. You fall to the level of your systems.", science: "Consistency of training load beats heroic single sessions — CTL is built daily (Coggan).", coach: "One session today beats two tomorrow. Go.", es: { quote: "No subes al nivel de tus metas; caes al nivel de tus sistemas.", coach: "Una sesión hoy vale más que dos mañana. Ve." } },
  { quote: "Pain is temporary. Quitting lasts forever.", science: "Perceived exertion is modulated by mindset — reframing effort as a positive signal improves performance (Crum & Langer 2007).", coach: "When it hurts in Z4, tell yourself: this is exactly where the adaptation happens.", es: { quote: "El dolor es temporal. Rendirse dura para siempre.", coach: "Cuando duela en Z4, dime: aquí es exactamente donde ocurre la adaptación." } },
  { quote: "The miracle isn't that I finished. It's that I had the courage to start.", science: "Behavioral activation — starting is the hardest part; once moving, commitment rises (Lewin's task-initiation research).", coach: "Warm-up is the hardest 10 minutes. Get them done and the rest flows.", es: { quote: "El milagro no es que terminé; es que tuve el valor de empezar.", coach: "El calentamiento son los 10 minutos más difíciles. Hazlos y el resto fluye." } },
  { quote: "Champions are made in the hours others spend sleeping.", science: "Sleep is when training adaptations consolidate — growth hormone, tissue repair, memory of motor patterns (Fullagar 2015, Sports Med).", coach: "Actually — champions ARE made in sleep. 8 hours is a training session. Guard it.", es: { quote: "Los campeones se hacen en las horas que otros gastan durmiendo.", coach: "De hecho — los campeones SE hacen durmiendo. 8 horas son una sesión de entreno. Protégelas." } },
  { quote: "Run when you can, walk if you must, crawl if you have to; just never give up.", science: "Pacing flexibility preserves performance when conditions change (Abbiss & Laursen 2008).", coach: "Bad day? Cut the pace, keep the time. Load is load.", es: { quote: "Corre cuando puedas, camina si hace falta, gatea si tienes que; pero nunca te rindas.", coach: "¿Mal día? Baja el ritmo, mantén el tiempo. La carga es carga." } },
  { quote: "What you do every day matters more than what you do once in a while.", science: "Aerobic base requires chronic stimulus — 12+ weeks of consistent Z2 (Seiler 2009).", coach: "The long game is the only game. Today's easy session IS the adaptation.", es: { quote: "Lo que haces cada día importa más que lo que haces de vez en cuando.", coach: "El juego largo es el único juego. La sesión fácil de hoy ES la adaptación." } },
  { quote: "Sweat is fat crying.", science: "Well — sweat is thermoregulation, but the sentiment stands: hard work signals adaptation (ACSM 2021).", coach: "Hydrate. Electrolytes. Now. Then train.", es: { quote: "El sudor es la grasa llorando.", coach: "Hidrátate. Electrolitos. Ya. Luego entrena." } },
  { quote: "It never gets easier, you just get faster.", science: "As fitness improves, the same RPE yields higher absolute output — this is the hallmark of adaptation (Foster 1998).", coach: "If today's Z2 feels easier than last month, raise the bar — that's progress.", es: { quote: "Nunca se hace más fácil, solo te haces más rápido.", coach: "Si tu Z2 de hoy se siente más fácil que el mes pasado, sube el listón — eso es progreso." } },
];

// Style prefixes localized (prepended to the coach message).
const MOTIVATION_PREFIX: Record<string, { tough: string; gentle: string }> = {
  en: { tough: "No excuses. ", gentle: "You've got this. " },
  es: { tough: "Sin excusas. ", gentle: "Tú puedes. " },
  ht: { tough: "Pa gen ekskoz. ", gentle: "Ou kapab. " },
  fr: { tough: "Aucune excuse. ", gentle: "Tu peux le faire. " },
  ru: { tough: "Без оправданий. ", gentle: "У тебя получится. " },
};

export function dailyMotivation(dayIndex: number, style: string = "coach", lang: string = "en"): { quote: string; message: string } {
  const item = MOTIVATION_LIBRARY[dayIndex % MOTIVATION_LIBRARY.length];
  const es = lang === "es" && item.es ? item.es : null;
  const quote = es ? es.quote : item.quote;
  const coach = es ? es.coach : item.coach;
  const prefix = MOTIVATION_PREFIX[lang] || MOTIVATION_PREFIX.en;
  if (style === "science") return { quote, message: item.science };
  if (style === "tough") return { quote, message: `${prefix.tough}${coach}` };
  if (style === "gentle") return { quote, message: `${prefix.gentle}${coach}` };
  return { quote, message: coach };
}




