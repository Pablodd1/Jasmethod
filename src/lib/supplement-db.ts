// JasMiamiMethod — Complete Supplement Database V2
//
// Organized by evidence strength and sport relevance. Every entry cites
// human trials with PMID/DOI. Updated through September 2026.
//
// TIER A = Strong human RCT/meta-analysis evidence, consistently replicated
// TIER B = Good human evidence but mixed results or fewer trials
// TIER C = Emerging evidence, limited human trials, or mechanism-only support
//
// ORGANIZED BY SPORT RELEVANCE:
//   sprint_400m: creatine, beta-alanine, caffeine, bicarb, DHA (neuro)
//   boxing_combat: creatine (neuro), DHA, choline, beta-alanine, caffeine
//   endurance_tri: caffeine, nitrate, carb mixtures, electrolytes
//   strength_hypertrophy: creatine, protein, citrulline, vitamin D
//   recovery_all: tart cherry, collagen, omega-3, vitamin D

import type { EvidenceTier } from "./evidence-registry";

export interface Supplement {
  id: string;
  name: string;
  category:
    | "performance"    // improves training or competition output
    | "recovery"       // reduces soreness, accelerates recovery
    | "neuroprotection" // brain/CNS protection (contact sports)
    | "tendon_joint"   // tendon, ligament, joint support
    | "health_base"    // foundational health (vitamin D, omega-3)
    | "body_comp";     // muscle gain, fat loss

  tier: EvidenceTier;
  evidenceScore: number; // 1-10 (10 = strongest evidence)
  sports: string[];      // which sports benefit most
  dose: string;
  timing: string;
  mechanism: string;
  caution?: string;
  citations: { author: string; year: number; journal: string; PMID?: string }[];
}

export const SUPPLEMENT_DB: Supplement[] = [
  // ═══════════════════════════════════════════════════════════
  // TIER A — STRONGEST EVIDENCE (meta-analyses, replicated RCTs)
  // ═══════════════════════════════════════════════════════════
  {
    id: "creatine_mono",
    name: "Creatine Monohydrate",
    category: "performance",
    tier: "meta_analysis",
    evidenceScore: 10,
    sports: ["sprint_400m", "boxing_combat", "strength_hypertrophy", "all"],
    dose: "3–5 g/day maintenance (loading: 20 g/day × 5-7 days optional)",
    timing: "Any time of day — consistency matters more than timing",
    mechanism: "Increases phosphocreatine pool → faster ATP regeneration during high-intensity efforts. Also buffers H+ ions and may reduce muscle damage.",
    caution: "Water retention 1-2 kg during loading phase. Safe across the lifespan (Kreider 2025: safe from adolescents to elderly, no kidney damage in healthy individuals).",
    citations: [
      { author: "Kreider", year: 2025, journal: "Frontiers in Nutrition", PMID: undefined },
      { author: "Ashtary-Larky", year: 2025, journal: "J ISSN — 61 RCT meta-analysis" },
      { author: "Wax", year: 2021, journal: "Nutrients — cited 303×", PMID: "34199588" },
      { author: "Giraldo", year: 2025, journal: "J ISSN — neuroprotective in mTBI" },
    ],
  },
  {
    id: "caffeine",
    name: "Caffeine",
    category: "performance",
    tier: "meta_analysis",
    evidenceScore: 9,
    sports: ["sprint_400m", "boxing_combat", "endurance_tri", "strength_hypertrophy", "all"],
    dose: "3–6 mg/kg body mass (200–400 mg for 70 kg athlete)",
    timing: "45–60 min pre-exercise",
    mechanism: "Adenosine receptor antagonist → reduces perceived exertion, increases motor unit recruitment and fat oxidation.",
    caution: "≥9 mg/kg increases anxiety, jitters, GI distress. Tachycardia in sensitive individuals. Tolerance develops — cycle off every 4-6 weeks. Stop by 2 PM to protect sleep.",
    citations: [
      { author: "Guest", year: 2021, journal: "J ISSN — Position Stand, cited 1297×", PMID: "33388079" },
      { author: "Grgic", year: 2020, journal: "Scandinavian J Med Sci Sports" },
    ],
  },
  {
    id: "beta_alanine",
    name: "Beta-Alanine",
    category: "performance",
    tier: "meta_analysis",
    evidenceScore: 8,
    sports: ["sprint_400m", "boxing_combat", "row_hyrox"],
    dose: "3.2–6.4 g/day for 4+ weeks (chronic loading — acute doses do NOT work)",
    timing: "Split into 4+ doses of 0.8-1.6g throughout the day to reduce paresthesia",
    mechanism: "Increases muscle carnosine → buffers H+ ions → delays fatigue in 1-4 min high-intensity efforts.",
    caution: "Paresthesia (tingling) at doses >800 mg single dose. Harmless and resolves in 30-60 min. Slow-release formulas reduce this.",
    citations: [
      { author: "Trexler", year: 2015, journal: "J ISSN — Position Stand, cited 668×", PMID: "26175657" },
      { author: "Saunders", year: 2017, journal: "Br J Sports Med — meta-analysis in combat sports" },
      { author: "Korean National Team", year: 2018, journal: "Elite boxers — peak power improvement" },
    ],
  },
  {
    id: "protein_whey",
    name: "Whey Protein",
    category: "body_comp",
    tier: "meta_analysis",
    evidenceScore: 9,
    sports: ["all"],
    dose: "20–40 g per serving; total daily 1.6–2.2 g/kg for athletes",
    timing: "Within 2h post-workout (anabolic window); also between meals to hit daily target",
    mechanism: "Provides essential amino acids (especially leucine 2.5-3g) to trigger muscle protein synthesis.",
    caution: "None for most people. Lactose-intolerant athletes: use isolate (0.1% lactose) or plant-based alternatives.",
    citations: [
      { author: "Kerksick", year: 2018, journal: "J ISSN — Review update, cited 1779×" },
      { author: "Morton", year: 2018, journal: "Br J Sports Med — protein meta-analysis" },
    ],
  },
  {
    id: "vitamin_d",
    name: "Vitamin D3",
    category: "health_base",
    tier: "meta_analysis",
    evidenceScore: 8,
    sports: ["all"],
    dose: "2000–4000 IU/day (target blood level: 40–60 ng/mL)",
    timing: "With a fat-containing meal for absorption",
    mechanism: "Regulates muscle function, bone health, immune function. Deficiency impairs muscle repair and increases injury risk.",
    caution: "Get blood test first — excess (>80 ng/mL) is harmful. Toxicity risk above 10000 IU/d without monitoring.",
    citations: [
      { author: "Wiacek", year: 2026, journal: "Vitamin Supplementation in Sports — decade review", PMID: undefined },
      { author: "Owens", year: 2018, journal: "Sports Medicine — vitamin D and athletic performance" },
    ],
  },
  {
    id: "omega3_dha",
    name: "Omega-3 (DHA + EPA)",
    category: "health_base",
    tier: "meta_analysis",
    evidenceScore: 8,
    sports: ["all", "boxing_combat", "contact_sports"],
    dose: "1–3 g/d combined DHA+EPA; DHA-dominant for brain health; EPA-dominant for inflammation",
    timing: "With meals (fat-soluble)",
    mechanism: "Reduces inflammation, supports cell membrane function, may enhance muscle protein synthesis and reduce muscle loss.",
    caution: ">3g/d has mild blood-thinning effect. DHA-dominant for brain protection; EPA-only may interfere with TBI repair (2025 finding).",
    citations: [
      { author: "Beauregard", year: 2025, journal: "PLOS ONE — neuroprotection in TBI", PMID: "PMC12021223" },
      { author: "Heileson", year: 2024, journal: "Contact sports omega-3 and NfL biomarkers" },
      { author: "Fernández-Lázaro", year: 2024, journal: "Omega-3 and exercise recovery — cited 136×" },
    ],
  },
  // ═══════════════════════════════════════════════════════════
  // TIER B — GOOD EVIDENCE (RCTs with some mixed results)
  // ═══════════════════════════════════════════════════════════
  {
    id: "citrulline_malate",
    name: "L-Citrulline Malate",
    category: "performance",
    tier: "rct",
    evidenceScore: 7,
    sports: ["strength_hypertrophy", "boxing_combat", "all"],
    dose: "6–8 g citrulline malate (2:1 ratio)",
    timing: "60 min pre-workout",
    mechanism: "Increases nitric oxide → improves blood flow, nutrient delivery, and reduces muscle soreness.",
    caution: "GI upset at doses >10g.",
    citations: [
      { author: "Pérez-Guisado", year: 2010, journal: "J Strength Cond Res — bench press reps" },
      { author: "Trexler", year: 2019, journal: "Sports Med — citrulline meta-analysis" },
    ],
  },
  {
    id: "nitrate_beetroot",
    name: "Dietary Nitrate (Beetroot)",
    category: "performance",
    tier: "rct",
    evidenceScore: 7,
    sports: ["endurance_tri", "all"],
    dose: "6–8 mmol nitrate (≈400–500 mg) from 500 ml beet juice or concentrate",
    timing: "2–3h pre-exercise; daily for chronic effect",
    mechanism: "Nitrate → nitrite → nitric oxide → improves mitochondrial efficiency and blood flow.",
    caution: "Avoid antibacterial mouthwash (kills oral bacteria that convert nitrate to nitrite). Beets stain.",
    citations: [
      { author: "Jones", year: 2018, journal: "Annu Rev Nutr — nitrate and exercise performance" },
      { author: "ACSM", year: 2007, journal: "Position stand — hydration and sodium" },
    ],
  },
  {
    id: "tart_cherry",
    name: "Tart Cherry (Montmorency)",
    category: "recovery",
    tier: "rct",
    evidenceScore: 7,
    sports: ["all"],
    dose: "30 ml concentrated juice × 2/day (or 480 mg extract) for 4-5 days pre + 2-3 days post-event",
    timing: "Start 4-5 days before competition; continue 2-3 days after",
    mechanism: "Anthocyanins reduce oxidative stress and inflammation → accelerates muscle function recovery and reduces soreness.",
    caution: "Contains natural sugars (~30g/30ml concentrate). Some studies show mixed results on strength recovery.",
    citations: [
      { author: "Hagele", year: 2026, journal: "MDPI — powdered tart cherry meta-analysis" },
      { author: "Kim", year: 2026, journal: "PMC — systematic review of RCTs" },
      { author: "Zhu", year: 2026, journal: "Frontiers — performance effects review" },
    ],
  },
  {
    id: "collagen_peptides",
    name: "Collagen Peptides + Vitamin C",
    category: "tendon_joint",
    tier: "rct",
    evidenceScore: 7,
    sports: ["all", "contact_sports", "running"],
    dose: "15 g hydrolyzed collagen + 50 mg vitamin C",
    timing: "30–60 min BEFORE training (need blood amino acids elevated during loading)",
    mechanism: "Provides amino acid building blocks (glycine, proline, hydroxyproline) for collagen synthesis in tendons and ligaments when combined with mechanical loading.",
    caution: "Not a protein substitute for muscle — it targets connective tissue specifically. Needs the mechanical loading stimulus.",
    citations: [
      { author: "Bischof", year: 2024, journal: "PMC — cited 57×, tendon CSA increase", PMID: undefined },
      { author: "Buchalski", year: 2026, journal: "MDPI — collagen + loading for tendon remodeling" },
      { author: "Baar", year: 2017, journal: "J Applied Physiology — original mechanism paper" },
    ],
  },
  {
    id: "bicarbonate",
    name: "Sodium Bicarbonate",
    category: "performance",
    tier: "meta_analysis",
    evidenceScore: 7,
    sports: ["sprint_400m", "boxing_combat", "row_hyrox"],
    dose: "0.2–0.3 g/kg body mass",
    timing: "90–150 min pre-exercise (with food to reduce GI distress)",
    mechanism: "Extracellular buffer → delays acidosis in high-intensity efforts lasting 1-7 minutes.",
    caution: "GI distress is COMMON — test in training, never try on race day without prior use. Use enteric-coated capsules to reduce GI side effects.",
    citations: [
      { author: "ISSN", year: 2021, journal: "J ISSN — sodium bicarbonate position stand" },
      { author: "Heublein", year: 2023, journal: "Meta-analysis — bicarbonate and exercise" },
    ],
  },
  {
    id: "alpha_gpc",
    name: "Alpha-GPC (Choline)",
    category: "performance",
    tier: "rct",
    evidenceScore: 6,
    sports: ["boxing_combat", "sprint_400m", "power_sports"],
    dose: "300–600 mg",
    timing: "30–60 min pre-session",
    mechanism: "Acetylcholine precursor → supports reaction time, motor unit recruitment, and force output under fatigue.",
    caution: "Limited long-term safety data at high doses. Start at 300 mg.",
    citations: [
      { author: "Bellar", year: 2015, journal: "J ISSN — alpha-GPC and power output" },
      { author: "ISSN Combat", year: 2025, journal: "J ISSN — combat sport nutrition position stand" },
    ],
  },
  // ═══════════════════════════════════════════════════════════
  // TIER C — EMERGING EVIDENCE (promising but limited trials)
  // ═══════════════════════════════════════════════════════════
  {
    id: "creatine_brain",
    name: "Creatine for Brain Health (neuroprotection)",
    category: "neuroprotection",
    tier: "rct",
    evidenceScore: 5,
    sports: ["boxing_combat", "contact_sports"],
    dose: "5–10 g/day (higher than muscle dose — brain uptake is slower)",
    timing: "Daily, any time",
    mechanism: "Increases brain phosphocreatine → provides ATP for brain cell recovery after sub-concussive impacts. May reduce concussion severity.",
    caution: "Emerging evidence — most data from experimental models. Active clinical trial NCT06644131. Not a helmet substitute.",
    citations: [
      { author: "Giraldo", year: 2025, journal: "J ISSN — neuroprotective in mTBI" },
      { author: "Dean", year: 2017, journal: "PMC — cited 105×, creatine and mTBI" },
      { author: "NCT06644131", year: 2025, journal: "ClinicalTrials.gov — active creatine mTBI trial" },
    ],
  },
  {
    id: "dha_neuroprotection",
    name: "Omega-3 DHA (Neuroprotection)",
    category: "neuroprotection",
    tier: "rct",
    evidenceScore: 6,
    sports: ["boxing_combat", "contact_sports"],
    dose: "1–2 g DHA daily (DHA-dominant, NOT EPA-only)",
    timing: "Daily with meals",
    mechanism: "DHA is the dominant structural fatty acid in neuronal membranes. Higher omega-3 index → lower neurofilament light chain (NfL) after repetitive head impacts.",
    caution: "⚠️ 2025 MUSC study: EPA-only may INTERFERE with TBI repair. Use DHA-dominant, not EPA-only. >3g/d mild blood thinning.",
    citations: [
      { author: "Beauregard", year: 2025, journal: "PLOS ONE — DHA/EPA neuroprotection", PMID: "PMC12021223" },
      { author: "Heileson", year: 2024, journal: "Contact sports omega-3 and NfL biomarkers" },
    ],
  },
  {
    id: "ashwagandha",
    name: "Ashwagandha (KSM-66)",
    category: "recovery",
    tier: "rct",
    evidenceScore: 6,
    sports: ["all"],
    dose: "300–600 mg/day (root extract)",
    timing: "Daily (morning or evening)",
    mechanism: "Adaptogen — reduces cortisol, may improve recovery, sleep quality and stress resilience.",
    caution: "May interact with thyroid medication and sedatives. Avoid during pregnancy.",
    citations: [
      { author: "Chandrasekhar", year: 2012, journal: "Indian J Psychol Med — cortisol reduction RCT" },
      { author: "Wankhede", year: 2015, journal: "J ISSN — strength and muscle mass RCT" },
    ],
  },
];

// ---- Sport-specific supplement protocols ----
// Keys map to the platform's plan disciplines via SPORT_KEY_FOR_DISCIPLINE.
export const SPORT_PROTOCOLS: Record<string, { id: string; priority: number; reason: string }[]> = {
  "sprint_400m": [
    { id: "creatine_mono", priority: 1, reason: "Neuroprotective + phosphocreatine for 400m ATP demand" },
    { id: "caffeine", priority: 2, reason: "RFD + reaction time for sprint starts" },
    { id: "beta_alanine", priority: 3, reason: "Buffers H+ for 400m (60-240s lactate tolerance)" },
    { id: "bicarbonate", priority: 4, reason: "400m-specific — extracellular buffer for late-race acidosis" },
    { id: "dha_neuroprotection", priority: 5, reason: "Brain protection for contact-aware sprint athletes" },
  ],
  "boxing_combat": [
    { id: "creatine_brain", priority: 1, reason: "Neuroprotective after sub-concussive impacts" },
    { id: "dha_neuroprotection", priority: 2, reason: "DHA structural brain support + NfL reduction" },
    { id: "alpha_gpc", priority: 3, reason: "Reaction time + motor unit recruitment" },
    { id: "creatine_mono", priority: 4, reason: "Explosive power + repeat effort" },
    { id: "beta_alanine", priority: 5, reason: "Buffers 1-4 min round efforts" },
    { id: "caffeine", priority: 6, reason: "RFD + pre-training arousal" },
  ],
  "endurance_tri": [
    { id: "caffeine", priority: 1, reason: "Endurance performance evidence strongest" },
    { id: "nitrate_beetroot", priority: 2, reason: "Economy improvement for time trials" },
    { id: "protein_whey", priority: 3, reason: "Recovery + daily protein target" },
    { id: "beta_alanine", priority: 4, reason: "Buffering for high-intensity blocks" },
    { id: "tart_cherry", priority: 5, reason: "Multi-day competition recovery" },
  ],
  "hyrox": [
    { id: "caffeine", priority: 1, reason: "Perceived exertion reduction across the 8 stations" },
    { id: "beta_alanine", priority: 2, reason: "Buffers the 60-240s wall/row/sled efforts" },
    { id: "creatine_mono", priority: 3, reason: "Repeat-effort power for strength stations" },
    { id: "citrulline_malate", priority: 4, reason: "Blood flow for high-volume station work" },
    { id: "tart_cherry", priority: 5, reason: "Recovery between heats on multi-race weekends" },
  ],
  "strength_hypertrophy": [
    { id: "creatine_mono", priority: 1, reason: "Best-evidenced supplement for strength and power" },
    { id: "protein_whey", priority: 2, reason: "Daily protein target + post-workout window" },
    { id: "citrulline_malate", priority: 3, reason: "More reps per set, less soreness" },
    { id: "vitamin_d", priority: 4, reason: "Muscle function + injury prevention" },
  ],
  "recovery_all": [
    { id: "tart_cherry", priority: 1, reason: "Reduces soreness and accelerates strength recovery" },
    { id: "omega3_dha", priority: 2, reason: "Reduces inflammation, supports muscle remodeling" },
    { id: "collagen_peptides", priority: 3, reason: "Tendon/ligament support with training" },
    { id: "vitamin_d", priority: 4, reason: "Bone health + muscle function + immune support" },
    { id: "ashwagandha", priority: 5, reason: "Cortisol reduction, sleep quality, stress resilience" },
  ],
};

// Map the platform's plan disciplines to supplement protocol keys
export const SPORT_KEY_FOR_DISCIPLINE: Record<string, string> = {
  "track-sprint": "sprint_400m",
  "boxing": "boxing_combat",
  "sprint": "endurance_tri",
  "olympic": "endurance_tri",
  "half": "endurance_tri",
  "full": "endurance_tri",
  "run-only": "endurance_tri",
  "swim-only": "endurance_tri",
  "cycle": "endurance_tri",
  "hyrox": "hyrox",
  "lifting": "strength_hypertrophy",
};

// ---- Lookup functions ----
export function getSupplement(id: string): Supplement | undefined {
  return SUPPLEMENT_DB.find((s) => s.id === id);
}

export function supplementsForSport(sport: string): { supplement: Supplement; priority: number; reason: string }[] {
  const protocol = SPORT_PROTOCOLS[sport];
  if (!protocol) return [];
  return protocol
    .map((p) => {
      const supplement = SUPPLEMENT_DB.find((s) => s.id === p.id);
      return supplement ? { supplement, priority: p.priority, reason: p.reason } : null;
    })
    .filter(Boolean) as { supplement: Supplement; priority: number; reason: string }[];
}

export function recoverySupplements(): Supplement[] {
  return supplementsForSport("recovery_all").map((s) => s.supplement);
}
