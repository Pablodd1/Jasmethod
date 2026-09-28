export type PaceRef = { secondsPerMile: number | null; measuredAt: string | null; status: 'measured' | 'coach_set' | 'missing'; missingReason?: string | null };
export type PaceKey = 'mile' | '5k' | '10k' | 'half' | 'marathon' | 'easy';
export type Target = { label: string; paceLowSecondsPerMile: number | null; paceHighSecondsPerMile: number | null; rpeLow: number | null; rpeHigh: number | null; heartRateBpm: number | null; note?: string };
export type Segment = { id: string; seconds: number; kind: 'easy' | 'prep' | 'work' | 'recover' | 'cool' | 'other'; title: string; instruction: string; target: Target };
export type Block = { id: string; title: string; repeat: number; segments: Segment[] };
export type Guidance = { title: string; items: string[]; note?: string; sourceIds?: string[] };
export type DailyTraining = {
  schemaVersion: 1;
  session: { id: string; revision: number; dateLocal: string; timezone: string; sport: string; title: string; subtitle: string; planStatus: 'planned' | 'in_progress' | 'completed'; totalMinutes: number; density: { score: number; label: string; method: 'coach_planning' }; calories: { kcal: number | null; method: 'wearable' | 'estimate' | 'none'; asOf: string | null; missingReason: string | null } };
  profile: { paces: Record<PaceKey, PaceRef>; thresholdHeartRate: { bpm: number | null; status: 'measured' | 'coach_set' | 'missing'; measuredAt: string | null }; unitSystem: 'imperial' | 'metric'; updatedAt: string };
  blocks: Block[];
  guidance: { focus: Guidance; preFuel: Guidance; postFuel: Guidance; downshift: Guidance & { timerSeconds: number | null; inhaleSeconds: number | null; exhaleSeconds: number | null }; checkIn: Guidance };
  completion: { focusReady: boolean; submittedAt: string | null; actual: null | { durationMinutes: number | null; sessionRpe: number | null; comments: string | null } };
  links: { editProfile: string };
};

export function plannedSeconds(blocks: Block[]): number {
  return blocks.reduce((sum, b) => sum + b.repeat * b.segments.reduce((n, s) => n + s.seconds, 0), 0);
}

// Guard untrusted network responses before showing a training prescription.
export function isDailyTraining(v: unknown): v is DailyTraining {
  if (!v || typeof v !== 'object') return false;
  const x = v as Partial<DailyTraining>;
  if (x.schemaVersion !== 1 || !x.session || !x.profile || !x.guidance || !x.completion || !x.links || !Array.isArray(x.blocks)) return false;
  if (typeof x.session.id !== 'string' || !Number.isInteger(x.session.revision) || typeof x.session.title !== 'string' || typeof x.session.subtitle !== 'string' || typeof x.session.sport !== 'string' || typeof x.session.dateLocal !== 'string' || !Number.isFinite(x.session.totalMinutes)) return false;
  if (!x.session.density || !Number.isInteger(x.session.density.score) || x.session.density.score < 1 || x.session.density.score > 10 || typeof x.session.density.label !== 'string' || !x.session.calories || !(x.session.calories.kcal === null || Number.isFinite(x.session.calories.kcal))) return false;
  if (!x.profile.paces || !['mile','5k','10k','half','marathon','easy'].every(k => { const p=x.profile?.paces?.[k as PaceKey]; return p && (p.secondsPerMile===null || Number.isFinite(p.secondsPerMile)) && ['measured','coach_set','missing'].includes(p.status); })) return false;
  if (!x.profile.thresholdHeartRate || !['imperial','metric'].includes(x.profile.unitSystem) || typeof x.profile.updatedAt !== 'string') return false;
  if (!x.guidance.focus || !x.guidance.preFuel || !x.guidance.postFuel || !x.guidance.downshift || !x.guidance.checkIn) return false;
  if (![x.guidance.focus,x.guidance.preFuel,x.guidance.postFuel,x.guidance.downshift,x.guidance.checkIn].every(g => typeof g.title === 'string' && Array.isArray(g.items) && g.items.every(item=>typeof item==='string'))) return false;
  if (typeof x.completion.focusReady !== 'boolean' || typeof x.links.editProfile !== 'string') return false;
  return x.blocks.every(b => typeof b.id==='string' && typeof b.title==='string' && Number.isInteger(b.repeat) && b.repeat >= 1 && b.repeat <= 100 && Array.isArray(b.segments) && b.segments.length > 0 && b.segments.every(s => typeof s.id === 'string' && typeof s.kind==='string' && typeof s.title==='string' && Number.isInteger(s.seconds) && s.seconds > 0 && typeof s.instruction === 'string' && !!s.target && typeof s.target.label==='string'));
}
