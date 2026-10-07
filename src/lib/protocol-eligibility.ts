// Product review gates, not a validated medical clearance algorithm.
import type { ProtocolId } from './protocols';
export type Eligibility = { status: 'eligible' | 'blocked' | 'insufficient-data'; reasons: { code: string; message: string }[] };
export function reviewProtocolAthlete(input: {
  protocolId: ProtocolId; birthYear?: number | null; injured?: boolean | null;
  experience?: string | null; goal?: string | null; now?: Date;
}): Eligibility {
  const missing: Eligibility['reasons'] = [], blocked: Eligibility['reasons'] = [];
  const year = (input.now ?? new Date()).getUTCFullYear();
  if (!Number.isInteger(input.birthYear) || input.birthYear! < 1900 || input.birthYear! > year)
    missing.push({ code: 'adult_status_missing', message: 'Add a valid birth year before using adult training protocols.' });
  else if (year - input.birthYear! < 18)
    blocked.push({ code: 'youth_plan_required', message: 'These adult protocols require a separate youth coaching plan.' });
  else if (year - input.birthYear! === 18)
    missing.push({ code: 'adult_status_uncertain', message: 'Birth year alone does not confirm that your eighteenth birthday has passed. Adult protocol assignment needs age review.' });
  if (input.injured === true) blocked.push({ code: 'injury_review', message: 'The injury flag is active. Review recovery with your clinician or coach before assigning training.' });
  else if (input.injured !== false) missing.push({ code: 'injury_status_missing', message: 'Review your injury status before assigning training.' });
  if (!['beginner', 'amateur', 'advanced', 'pro'].includes(input.experience || '')) missing.push({ code: 'history_missing', message: 'Add your training experience before choosing a protocol dose.' });
  if (!input.goal) missing.push({ code: 'goal_missing', message: 'Choose the sport/event goal this protocol supports.' });
  if (['speed', 'anaerobic-capacity'].includes(input.protocolId) && input.experience === 'beginner') blocked.push({ code: 'advanced_work_review', message: 'Build a training base and review prior tolerance with a coach before maximal speed or anaerobic-capacity work.' });
  return { status: blocked.length ? 'blocked' : missing.length ? 'insufficient-data' : 'eligible', reasons: [...blocked, ...missing] };
}
