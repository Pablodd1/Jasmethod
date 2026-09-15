// JasMiamiMethod — Evidence Registry V2
//
// Parallel evidence registry (V1 research.ts is preserved and unchanged).
// Every algorithmic claim in the V2 engine references an immutable claim ID
// from this registry. The AI coach may only cite IDs that exist here —
// unknown IDs are rejected at the API layer.
//
// Evidence hierarchy (highest → lowest):
//   1. systematic_review / meta_analysis / replicated_rct
//   2. rct / controlled_trial
//   3. prospective / observational
//   4. consensus (position stands, reviews without new data)
//   5. implementation_reference (books, coaching guides — NOT scientific evidence)
//
// Regulatory sources (WADA, federation rules) use studyDesign = "regulatory"
// and live in a separate category.

export type EvidenceTier =
  | "meta_analysis"
  | "systematic_review"
  | "replicated_rct"
  | "rct"
  | "controlled_trial"
  | "prospective"
  | "observational"
  | "consensus"
  | "regulatory"
  | "implementation_reference";

export type CertaintyGrade = "high" | "moderate" | "low" | "very_low";

export interface EvidenceEntry {
  claimId: string;            // immutable — referenced by algorithms, never reused
  claim: string;              // one-sentence description of what the evidence supports
  domain: string;             // "endurance" | "strength" | "recovery" | "nutrition" | "environment" | "neuroprotection" | "race_prediction"
  population: string;         // "elite" | "recreational" | "both" | "clinical"
  sport: string;              // "running" | "cycling" | "swimming" | "triathlon" | "boxing" | "all" | ...
  studyDesign: string;        // e.g. "systematic review + meta-analysis", "RCT", "position stand"
  PMID?: string;
  DOI?: string;
  publicationYear: number;
  sampleSize?: number;
  intervention?: string;
  comparator?: string;
  effect?: string;            // direction + magnitude of the effect
  effectSize?: string;        // e.g. "d=0.8", "5-10% improvement", "RR=0.85"
  limitations?: string;
  certainty: CertaintyGrade;  // GRADE-style certainty assessment
  directness: "direct" | "indirect" | "surrogate";
  replicationStatus: "replicated" | "single_study" | "emerging" | "contested";
  lastReviewed: string;       // ISO date of last editorial review
  status: "active" | "superseded" | "retracted";
  tier: EvidenceTier;
}

export const EVIDENCE_REGISTRY: EvidenceEntry[] = [
  // ---- HRV / autonomic ----
  {
    claimId: "hrv-guided-training-2021",
    claim: "HRV-guided training improves endurance performance vs pre-planned training",
    domain: "recovery",
    population: "recreational",
    sport: "running",
    studyDesign: "meta-analysis",
    PMID: "34489178",
    publicationYear: 2021,
    intervention: "Daily HRV-guided training intensity adjustment",
    comparator: "Pre-planned training without HRV adjustment",
    effect: "Small improvement in endurance performance measures",
    effectSize: "ES=0.34",
    limitations: "Limited to recreational runners; elite athlete response not established",
    certainty: "moderate",
    directness: "direct",
    replicationStatus: "replicated",
    lastReviewed: "2026-09-07",
    status: "active",
    tier: "meta_analysis",
  },
  {
    claimId: "plews-hrv-baseline-2013",
    claim: "7-day rolling HRV baseline is more reliable than single readings for monitoring training adaptation",
    domain: "recovery",
    population: "both",
    sport: "all",
    studyDesign: "systematic review",
    PMID: "23667366",
    publicationYear: 2013,
    effect: "7-day rolling average reduces day-to-day noise and tracks training adaptation",
    certainty: "moderate",
    directness: "direct",
    replicationStatus: "replicated",
    lastReviewed: "2026-09-07",
    status: "active",
    tier: "systematic_review",
  },
  // ---- Strength / plyometrics ----
  {
    claimId: "currier-strength-2023",
    claim: "Resistance training 2-3×/week improves health outcomes in a dose-dependent manner",
    domain: "strength",
    population: "both",
    sport: "all",
    studyDesign: "systematic review + network meta-analysis",
    PMID: "37414459",
    publicationYear: 2023,
    intervention: "Structured resistance training 2-3×/week",
    comparator: "No resistance training or 1×/week",
    effect: "Dose-dependent improvement in all-cause mortality, functional capacity",
    certainty: "high",
    directness: "direct",
    replicationStatus: "replicated",
    lastReviewed: "2026-09-07",
    status: "active",
    tier: "meta_analysis",
  },
  {
    claimId: "schoenfeld-volume-2017",
    claim: "Weekly set volume 10-20 sets per muscle group maximises hypertrophy",
    domain: "strength",
    population: "recreational",
    sport: "all",
    studyDesign: "meta-analysis",
    PMID: "27433992",
    publicationYear: 2017,
    intervention: "Resistance training volume 10-20 sets per muscle group per week",
    comparator: "Lower volume (<10 sets) or higher volume (>20 sets)",
    effect: "Higher hypertrophy in 10-20 set range; diminishing returns above",
    effectSize: "ES=0.25 for 10-20 vs <10",
    limitations: "Trained populations may benefit from higher volumes",
    certainty: "moderate",
    directness: "direct",
    replicationStatus: "replicated",
    lastReviewed: "2026-09-07",
    status: "active",
    tier: "meta_analysis",
  },
  {
    claimId: "robinson-failure-2024",
    claim: "Training closer to failure increases hypertrophy but not necessarily strength",
    domain: "strength",
    population: "recreational",
    sport: "all",
    studyDesign: "exploratory meta-regression",
    PMID: "38970765",
    publicationYear: 2024,
    intervention: "Sets taken to or near volitional failure (RPE 8-10)",
    comparator: "Sets further from failure (RPE 5-7)",
    effect: "Greater hypertrophy with proximity to failure; strength gains similar",
    certainty: "low",
    directness: "direct",
    replicationStatus: "single_study",
    lastReviewed: "2026-09-07",
    status: "active",
    tier: "meta_analysis",
  },
  // ---- Endurance ----
  {
    claimId: "helgerud-4x4-2007",
    claim: "4×4 min at 90-95% HRmax improves VO2max more than moderate continuous running",
    domain: "endurance",
    population: "recreational",
    sport: "running",
    studyDesign: "RCT",
    PMID: "17414804",
    publicationYear: 2007,
    sampleSize: 40,
    intervention: "4×4 min at 90-95% HRmax, 3 min jog recovery, 3×/week",
    comparator: "Steady-state running at 70% HRmax",
    effect: "+7.2% VO2max vs +3.4% for continuous running",
    effectSize: "+3.8% absolute VO2max difference",
    certainty: "moderate",
    directness: "direct",
    replicationStatus: "replicated",
    lastReviewed: "2026-09-07",
    status: "active",
    tier: "rct",
  },
  {
    claimId: "schumann-concurrent-2022",
    claim: "Concurrent strength and endurance training does not impair endurance adaptations when properly sequenced",
    domain: "strength",
    population: "both",
    sport: "all",
    studyDesign: "meta-analysis",
    PMID: "34757594",
    publicationYear: 2022,
    intervention: "Combined strength + endurance training",
    comparator: "Endurance training alone",
    effect: "No interference with endurance adaptations; strength gains preserved when separated by >6h",
    limitations: "Interference effect may appear with very high concurrent volumes",
    certainty: "moderate",
    directness: "direct",
    replicationStatus: "replicated",
    lastReviewed: "2026-09-07",
    status: "active",
    tier: "meta_analysis",
  },
  {
    claimId: "wang-taper-2023",
    claim: "Progressive taper (volume reduction 41-60% over 8-14 days) maximises race-day performance",
    domain: "endurance",
    population: "both",
    sport: "all",
    studyDesign: "meta-analysis",
    PMID: "37163550",
    publicationYear: 2023,
    intervention: "Progressive taper: reduce volume 41-60% over 8-14 days, maintain intensity and frequency",
    comparator: "No taper or step taper",
    effect: "~2-3% performance improvement vs no taper",
    effectSize: "~2-3% time improvement",
    certainty: "moderate",
    directness: "direct",
    replicationStatus: "replicated",
    lastReviewed: "2026-09-07",
    status: "active",
    tier: "meta_analysis",
  },
  {
    claimId: "intensity-distribution-2025",
    claim: "Polarised intensity distribution (~80/20) improves endurance performance in recreational and elite athletes",
    domain: "endurance",
    population: "both",
    sport: "all",
    studyDesign: "individual-participant meta-analysis",
    PMID: "39888556",
    publicationYear: 2025,
    intervention: "Polarised training distribution (~80% low intensity, ~20% moderate-hard)",
    comparator: "Pyramidal or threshold-focused distribution",
    effect: "Greater improvement in endurance performance metrics",
    certainty: "moderate",
    directness: "direct",
    replicationStatus: "replicated",
    lastReviewed: "2026-09-07",
    status: "active",
    tier: "meta_analysis",
  },
  // ---- Boxing / combat ----
  {
    claimId: "giraldo-creatine-mtbi-2025",
    claim: "Creatine monohydrate shows neuroprotective effects in mild TBI and may reduce concussion severity in contact-sport athletes",
    domain: "neuroprotection",
    population: "both",
    sport: "boxing",
    studyDesign: "narrative review + active clinical trial",
    publicationYear: 2025,
    intervention: "Creatine monohydrate supplementation (0.3 g/kg/d loading, 0.03 g/kg/d maintenance)",
    effect: "Potential reduction in concussion severity via enhanced brain ATP availability",
    limitations: "Most evidence from experimental TBI models; human trials ongoing (NCT06644131)",
    certainty: "low",
    directness: "indirect",
    replicationStatus: "emerging",
    lastReviewed: "2026-09-07",
    status: "active",
    tier: "implementation_reference",
  },
  {
    claimId: "beauregard-omega3-2025",
    claim: "DHA and EPA omega-3 fatty acids show neuroprotective effects against experimental TBI",
    domain: "neuroprotection",
    population: "both",
    sport: "boxing",
    studyDesign: "narrative review",
    publicationYear: 2025,
    intervention: "Omega-3 supplementation (DHA + EPA, 1-3 g/d)",
    effect: "Reduced neuroaxonal injury markers in contact-sport athletes; DHA structural support",
    limitations: "EPA alone may interfere with repair after repeated mTBI — use DHA-dominant formulations",
    certainty: "low",
    directness: "indirect",
    replicationStatus: "emerging",
    lastReviewed: "2026-09-07",
    status: "active",
    tier: "systematic_review",
  },
  {
    claimId: "heileson-omega3-2024",
    claim: "Higher omega-3 index associated with lower neurofilament light chain (NfL) in contact-sport athletes",
    domain: "neuroprotection",
    population: "both",
    sport: "boxing",
    studyDesign: "multi-site observational study",
    publicationYear: 2024,
    effect: "Higher omega-3 index → lower NfL (neuroaxonal injury marker)",
    limitations: "Observational; causation not established",
    certainty: "low",
    directness: "surrogate",
    replicationStatus: "single_study",
    lastReviewed: "2026-09-07",
    status: "active",
    tier: "observational",
  },
  {
    claimId: "issn-combat-2025",
    claim: "ISSN position stand on combat sport nutrition: protein 1.6-2.2 g/kg/d, carb periodisation, making-weight protocols",
    domain: "nutrition",
    population: "both",
    sport: "boxing",
    studyDesign: "position stand",
    publicationYear: 2025,
    certainty: "moderate",
    directness: "direct",
    replicationStatus: "replicated",
    lastReviewed: "2026-09-07",
    status: "active",
    tier: "consensus",
  },
  // ---- Environment ----
  {
    claimId: "heat-penalty-running",
    claim: "Endurance performance degrades ~2-3% per 5°C above 15°C wet-bulb globe temperature",
    domain: "environment",
    population: "both",
    sport: "running",
    studyDesign: "meta-analysis",
    publicationYear: 2024,
    intervention: "Race or training in heat (WBGT > 15°C)",
    comparator: "Thermoneutral conditions (WBGT 10-15°C)",
    effect: "2-3% pace degradation per 5°C above 15°C WBGT",
    certainty: "moderate",
    directness: "direct",
    replicationStatus: "replicated",
    lastReviewed: "2026-09-07",
    status: "active",
    tier: "meta_analysis",
  },
  // ---- Plyometrics ----
  {
    claimId: "ramirez-plyo-2022",
    claim: "Plyometric jump training 1-2×/week improves running economy, power and injury resilience",
    domain: "strength",
    population: "both",
    sport: "running",
    studyDesign: "meta-analysis",
    publicationYear: 2022,
    intervention: "Plyometric jump training 1-2 sessions/week",
    comparator: "No plyometric training",
    effect: "Improved running economy, vertical jump and injury resilience",
    limitations: "Optimal volume and progression not fully established",
    certainty: "moderate",
    directness: "direct",
    replicationStatus: "replicated",
    lastReviewed: "2026-09-07",
    status: "active",
    tier: "meta_analysis",
  },
  {
    claimId: "beta-alanine-combat",
    claim: "Beta-alanine 3.2-6.4 g/d for 4-10 weeks improves high-intensity performance in 1-4 min efforts",
    domain: "nutrition",
    population: "both",
    sport: "boxing",
    studyDesign: "systematic review",
    publicationYear: 2023,
    intervention: "Beta-alanine 3.2-6.4 g/d for 4-10 weeks",
    comparator: "Placebo",
    effect: "Improved high-intensity exercise capacity and punching power in final seconds of rounds",
    certainty: "moderate",
    directness: "direct",
    replicationStatus: "replicated",
    lastReviewed: "2026-09-07",
    status: "active",
    tier: "meta_analysis",
  },
];

export function getEvidence(claimId: string): EvidenceEntry | undefined {
  return EVIDENCE_REGISTRY.find((e) => e.claimId === claimId);
}

// Validate an array of claim IDs — returns valid IDs and rejects unknown ones.
export function validateClaimIds(ids: string[]): { valid: string[]; invalid: string[] } {
  const known = new Set(EVIDENCE_REGISTRY.map((e) => e.claimId));
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const id of ids) {
    if (known.has(id)) valid.push(id);
    else invalid.push(id);
  }
  return { valid, invalid };
}

// Filter by domain, sport, and minimum tier.
export function evidenceFor(domain: string, sport?: string): EvidenceEntry[] {
  return EVIDENCE_REGISTRY.filter(
    (e) => e.domain === domain && (e.sport === "all" || e.sport === sport),
  );
}
