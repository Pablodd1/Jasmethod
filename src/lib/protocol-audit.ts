import matrix from '../../docs/research/2026-10-11/protocol-matrix.json';
// Research rows and selectable workouts have deliberately different identities.
// Comparator arms, specialist research and coaching principles are not counted
// as executable recipes simply because they appear in the audit.
const available: Record<string, string> = {
  P01: 'aerobic-power', P03: 'aerobic-base', P05: 'running-10-20-30',
  P07: 'cycling-4x8', P12: 'cycling-60-75', P15: 'aerobic-base', P24: 'strength',
  P25: 'hypertrophy', P26: 'power', P27: 'muscular-endurance',
  P28: 'speed', P31: 'aerobic-base', P36: 'aerobic-base',
};
const reasons: Record<string, string> = {
  P02: 'The 47-repeat primary main set is verified, but its 5.3% treadmill context and trial-specific target translation are not a flat-running prescription.',
  P04: 'The primary session duration is verified. Its 85% HRmax treadmill target does not establish an individual threshold or a flat-running equivalent.',
  P06: 'Primary work/rest is verified, but this exact cycling arm is not a separate selectable recipe. The existing aerobic-power template is a different coaching adaptation.',
  P08: 'Primary work/rest is verified. The long 73-minute main set requires a separate athlete-specific load and baseline review; no automatic assignment.',
  P09: 'Primary work/rest is verified, but the national-level training history and supervision cannot be assumed. Legacy 30/15 intervals are not this complete advanced protocol.',
  P10: 'Primary work/rest is verified, but this national-level study comparator is not separately assigned. Training history, load and supervision require review.',
  P11: 'All-out laboratory exercise requires specialty screening, familiarization and equipment; no automatic assignment.',
  P13: 'Original supramaximal cycling requires a measured original test anchor and specialist supervision.',
  P14: 'All-out trial work and study-apparatus watts are not a general novice starting dose.',
  P16: 'Large laboratory uphill threshold workload; no validated individual starting dose or flat-running conversion.',
  P17: 'Acute split-session evidence does not justify automatic double-threshold programming. Coach review and between-session checks remain required.',
  P18: 'Elite maximal pool work and a null between-group result do not establish a general performance upgrade; specialty water-safety review required.',
  P19: 'Primary main-set details are verified. Lift-specific technique and load familiarity still need review; no automatic 4RM assignment.',
  P20: 'Existing strength principles do not reproduce the complete study program; no running-performance guarantee.',
  P21: 'Movement/impact tolerance and full specialty programming need review before assigning high-fatigue circuits.',
  P22: 'Judo-specific technique, partner safety and qualified supervision cannot be assumed for boxing or general athletes.',
  P23: 'All-out boxing requires specialty technique and load review. The correction concerns an image disclosure, not study results; exact bout timing also differs from the rounded block label.',
  P29: 'Maximal sprint skill, measured speed and technical supervision need a specialist review.',
  P30: 'A CSS measurement study does not validate the illustrative repeat dose or establish a measured lactate threshold.',
  P32: 'Existing HYROX movement blocks are coaching allocations, not an independently validated exact station dose.',
  P33: 'Illustrative brick requires explicit component and transition design; not a selectable audited recipe.',
  P34: 'Distribution is a programming principle, not a separately executable workout or universal 80/20 quota.',
  P35: 'Taper is an individualized planning principle, not a standalone workout recipe.',
  P37: 'All-out cycling and the studied one-minute recovery require specialized prior tolerance; no automatic sprint prescription.',
  P38: 'All-out cycling with longer recovery remains specialist research; no universal safe starting dose is inferred.',
  P39: 'Arm-crank conditioning from judo athletes requires equipment, modality-specific tolerance and specialist programming.',
  P40: 'Cycling conditioning from judo athletes does not automatically transfer to endurance or novice programming.',
  P41: 'Repeated short court sprints require team-sport movement and acceleration tolerance; no endurance-training default.',
  P42: 'Repeated longer court sprints require sprint and deceleration tolerance; no automatic cross-sport transfer.',
  P43: 'Supramaximal motorized-treadmill exercise had no VO2max improvement in this arm; familiarization and specialist review are required.',
  P44: 'All-out motorized-treadmill running had a material study-specific injury signal and is excluded from automatic prescribing.',
  P45: 'An expert distance challenge is not efficacy-validated or a fixed-duration main set; retain educational context only.',
};
export const PROTOCOL_AUDIT = {
  reviewDate: matrix.review_date, baselineCommit: matrix.baseline_commit,
  scope: matrix.scope, counting: matrix.counting, counts: matrix.count_summary,
  rows: matrix.protocols.map(row => ({ ...row, protocolId: available[row.id] ?? null,
    runtimeStatus: available[row.id] ? 'adapted-template-available' as const : 'not-selectable' as const,
    runtimeReason: reasons[row.id] ?? (['P05', 'P07', 'P12'].includes(row.id)
      ? 'Reviewed main-set work/rest with explicitly labeled JMM effort, warm-up and cool-down adaptations; subject to athlete and session gates.'
      : available[row.id] ? 'Existing JMM coaching template supports the general goal. It does not reproduce or validate the exact audited study dose.' : 'Not implemented as a selectable recipe. Complete source, athlete, equipment and dose review is required before assignment.'),
  })),
};
