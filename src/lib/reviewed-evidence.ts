// Curated claim-to-source lineage. A verified source is not an executable dose.
export const EVIDENCE_REVIEW_VERSION = '2026-10-07';
export interface ReviewedClaim {
  id: string; sourceId: string; sourceUrl: string;
  classification: 'trial' | 'synthesis' | 'consensus' | 'expert_education';
  status: 'active' | 'needs_review' | 'superseded' | 'withdrawn';
  verification: 'reviewed' | 'unverified'; reviewedOn: string;
  claim: string; applicability: string; limitation: string;
  numericAuthority: 'principle_only';
}
const claim = (entry: Omit<ReviewedClaim, 'status' | 'verification' | 'reviewedOn' | 'numericAuthority'>): ReviewedClaim => ({ ...entry, status: 'active', verification: 'reviewed', reviewedOn: EVIDENCE_REVIEW_VERSION, numericAuthority: 'principle_only' });
export const REVIEWED_CLAIMS: ReviewedClaim[] = [
  claim({ id: 'running-aerobic-intervals', sourceId: 'intervals', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/17414804/', classification: 'trial', claim: 'Long and short aerobic running intervals improved VO2max in this small trial.', applicability: '40 healthy moderately trained men; running, eight weeks.', limitation: 'The tested 4 × 4-minute running protocol does not establish an individualized entry dose, race-performance superiority, or a tested swim/bike prescription.' }),
  claim({ id: 'resistance-training-adaptations', sourceId: 'strength', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/37414459/', classification: 'synthesis', claim: 'Resistance training improved strength and hypertrophy in healthy adults.', applicability: 'Healthy-adult resistance training; load, sets and frequency varied.', limitation: 'Ranking effects are population averages. This does not validate every JMM exercise, dose or progression.' }),
  claim({ id: 'resistance-volume-association', sourceId: 'volume', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/27433992/', classification: 'synthesis', claim: 'Greater weekly set volume was associated with greater hypertrophy.', applicability: 'Resistance-training studies grouped as fewer than 5, 5–9 and 10 or more sets.', limitation: 'No universal 10–20-set optimum or plateau above 20 was established.' }),
  claim({ id: 'concurrent-training-compatibility', sourceId: 'concurrent', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/34757594/', classification: 'synthesis', claim: 'Concurrent aerobic and strength training was compatible with maximal strength and hypertrophy; explosive strength may be attenuated.', applicability: 'Concurrent training versus strength-only; heterogeneous populations and designs.', limitation: 'Separation subgroup findings are not a universal recovery interval, endurance-outcome guarantee, or permission for double-hard days.' }),
  claim({ id: 'sprint-quality-practice', sourceId: 'sprint', sourceUrl: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6872694/', classification: 'synthesis', claim: 'Sprint preparation combines evidence with established coaching practice, emphasizing specificity and quality.', applicability: 'Sprint running, especially trained athletes; not all recommendations are randomized evidence.', limitation: 'Cannot directly validate cycling sprints, novice maximal work or an exact JMM menu.' }),
  claim({ id: 'endurance-distribution-context', sourceId: 'distribution', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/39888556/', classification: 'synthesis', claim: 'Endurance intensity distribution should be interpreted in population and training context.', applicability: 'Endurance athletes and trial-specific distribution definitions.', limitation: 'No compulsory universal 80/20 split; session labels are not measured physiological time-in-zone.' }),
  claim({ id: 'talk-test-effort', sourceId: 'talk', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/25536539/', classification: 'trial', claim: 'Comfortable speech can support practical effort regulation during land exercise.', applicability: 'Land-based exercise with study-specific talk-test assessment.', limitation: 'Not a swimming speech test or a substitute for a measured sport-specific physiological threshold.' }),
  claim({ id: 'galpin-strength-framework', sourceId: 'galpinResistance', sourceUrl: 'https://www.hubermanlab.com/episode/dr-andy-galpin-optimal-protocols-to-build-strength-and-grow-muscles', classification: 'expert_education', claim: 'Distinguish strength, hypertrophy, speed and power goals; preserve execution quality.', applicability: 'Andy Galpin teaching in the Andrew Huberman-hosted 2023 expert series.', limitation: 'Educational framework, not a trial or endorsement. The 3–5 mnemonic is an example, not a required weekly frequency or a validated endurance-athlete dose.' }),
  claim({ id: 'galpin-endurance-framework', sourceId: 'galpinEndurance', sourceUrl: 'https://www.hubermanlab.com/episode/dr-andy-galpin-how-to-build-physical-endurance-and-lose-fat', classification: 'expert_education', claim: 'Separate local muscular endurance, anaerobic capacity and aerobic adaptations when choosing a goal.', applicability: 'Andy Galpin teaching in the Andrew Huberman-hosted 2023 expert series.', limitation: 'No universal all-sport dose. All-out efforts with very short recovery are not automatic novice or endurance prescriptions.' }),
  claim({ id: 'huberman-galpin-recovery', sourceId: 'galpinRecovery', sourceUrl: 'https://www.hubermanlab.com/episode/guest-series-dr-andy-galpin-maximize-recovery-to-achieve-fitness-and-performance-goals', classification: 'expert_education', claim: 'Consider sleep, fatigue and recovery alongside performance and the training plan.', applicability: 'Public educational discussion; specific tools need their own evidence and athlete context.', limitation: 'No recovery-score bonus from breathing, no sleep replacement by NSDR, and no biological guarantee from an arbitrary separation interval.' }),

];
export function reviewClaimIds(ids: readonly string[], registry: readonly ReviewedClaim[] = REVIEWED_CLAIMS) {
  const reasons: string[] = [];
  for (const id of ids) {
    const row = registry.find(r => r.id === id);
    if (!row) reasons.push(`Unknown claim: ${id}`);
    else if (row.status !== 'active' || row.verification !== 'reviewed') reasons.push(`Claim needs review: ${id}`);
  }
  if (!ids.length) reasons.push('No reviewed claim is attached.');
  return { status: reasons.length ? 'insufficient-data' as const : 'eligible' as const, reasons };
}
// Eligibility here means eligible for use as explanatory support, never dose authority.
export const PROTOCOL_CLAIMS: Record<string, readonly string[]> = {
  speed: ['sprint-quality-practice', 'galpin-strength-framework'], power: ['resistance-training-adaptations', 'concurrent-training-compatibility'],
  strength: ['resistance-training-adaptations', 'galpin-strength-framework'], hypertrophy: ['resistance-training-adaptations', 'resistance-volume-association'],
  'muscular-endurance': ['resistance-training-adaptations', 'galpin-endurance-framework'], 'anaerobic-capacity': ['galpin-endurance-framework'],
  'aerobic-power': ['running-aerobic-intervals'], 'aerobic-base': ['talk-test-effort', 'endurance-distribution-context'],
};
export function protocolEvidence(id: string, registry: readonly ReviewedClaim[] = REVIEWED_CLAIMS) {
  const ids = Object.prototype.hasOwnProperty.call(PROTOCOL_CLAIMS, id) ? PROTOCOL_CLAIMS[id] : [];
  const eligibility = reviewClaimIds(ids, registry);
  return { ...eligibility, version: EVIDENCE_REVIEW_VERSION, claimIds: [...ids],
    doseOrigin: 'jmm_starting_template' as const,
    limitation: 'Exact repetitions, work/rest durations, progression and zone labels are JMM coaching choices. Citations support principles and do not establish an individually validated dose. Zones here are effort labels; numeric targets require verified sport-specific anchors.',
    claims: registry.filter(r => ids.includes(r.id) && r.status === 'active' && r.verification === 'reviewed') };
}
