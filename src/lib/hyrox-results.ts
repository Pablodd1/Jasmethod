/** Explicit athlete-reported HYROX results. Immutable snapshots; never training capacity. */
import { createHash } from 'node:crypto';
import { prisma } from './db';
import { ApiError } from './access';
import { dateKey, localDate } from './dates';
import { analyzeHyroxSplits, planHyroxSplits, resolveHyroxPace } from './hyrox';
export const HYROX_RESULTS_ACTION = 'hyrox.actual_splits.v1';
export const HYROX_RESULTS_VERSION = 1;
type ResultsDb = Pick<typeof prisma, 'auditLog' | 'athleteProfile'>;
type Context = { timezone: string; profilePace: number | null; now?: Date };
export type HyroxResultInput = { observedDate: string; eventName: string | null; target: number; pace: number; sex: 'male' | 'female'; pro: boolean; actualSecs: (number | null)[]; transitionSeconds: number | null };
function number(value: unknown, label: string, min: number, max: number) {
 if ((typeof value !== 'number' && typeof value !== 'string') || !String(value).trim()) throw new ApiError(`Enter ${label}`);
 const n = Number(value); if (!Number.isFinite(n) || n < min || n > max) throw new ApiError(`${label} must be between ${min} and ${max}`); return n;
}
export function prepareHyroxResult(body: Record<string, unknown>, context: Context) {
 if (body.confirmed !== true) throw new ApiError('Review and explicitly confirm the actual splits before saving');
 if (typeof body.observedDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.observedDate)) throw new ApiError('Enter the actual local race date');
 try { localDate(body.observedDate, context.timezone); } catch { throw new ApiError('Enter a valid local race date'); }
 if (body.observedDate > dateKey(context.now ?? new Date(), context.timezone)) throw new ApiError('Actual results cannot be dated in the future');
 if (body.sex !== 'male' && body.sex !== 'female') throw new ApiError('Choose a supported Singles division');
 if (typeof body.pro !== 'boolean') throw new ApiError('Choose Open or Pro');
 if (body.eventName != null && (typeof body.eventName !== 'string' || body.eventName.length > 200)) throw new ApiError('Event name must be text of at most 200 characters');
 if (!Array.isArray(body.actualSecs) || body.actualSecs.length !== 16) throw new ApiError('Provide 16 split entries; leave missing times blank');
 const actualSecs = body.actualSecs.map((value: unknown) => value === null || value === '' ? null : number(value, 'actual split seconds', 1, 14400));
 if (!actualSecs.some(value => value !== null)) throw new ApiError('Enter at least one actual split before saving a result');
 const transitionSeconds = body.transitionSeconds == null || body.transitionSeconds === '' ? null : number(body.transitionSeconds, 'actual total transition seconds', 0, 14400);
 const target = number(body.target, 'target minutes', 1, 1440);
 let resolved: ReturnType<typeof resolveHyroxPace>;
 try { resolved = resolveHyroxPace(body.pace, context.profilePace); } catch (e) { throw new ApiError((e as Error).message); }
 const pace = number(resolved.pace, 'scenario running pace', 1, 3600);
 const input: HyroxResultInput = { observedDate: body.observedDate, eventName: typeof body.eventName === 'string' ? body.eventName.trim() || null : null, target, pace, sex: body.sex, pro: body.pro, actualSecs, transitionSeconds };
 let plan; try { plan = planHyroxSplits({ targetTotalMin: target, runPaceSecPerKm: pace, sex: input.sex, pro: input.pro }); } catch (e) { throw new ApiError((e as Error).message); }
 const analysis = analyzeHyroxSplits(plan, actualSecs);
 const loggedSegments = actualSecs.filter(value => value !== null).length;
 return { version: HYROX_RESULTS_VERSION, source: 'athlete_report' as const, timezone: context.timezone, paceSource: resolved.source, input, plan, analysis,
  completeness: { loggedSegments, missingSegments: 16 - loggedSegments, transitionStatus: transitionSeconds === null ? 'missing' as const : 'athlete_reported' as const,
   actualFinishSeconds: loggedSegments === 16 && transitionSeconds !== null ? analysis.actualTotalSec + transitionSeconds : null },
  limitations: ['Actuals are athlete-reported, not verified device or official race results.', 'Blank segments and unreported transitions remain missing; no finish total is inferred from partial data.', 'Target allocations are illustrative scenarios, not measured capacity or validated predictions.', 'Saving does not change a profile, training plan or workout.'] };
}
export async function readHyroxResults(athleteId: string, db: ResultsDb = prisma) {
 const [audits, profile] = await Promise.all([
  db.auditLog.findMany({ where: { subjectId: athleteId, action: HYROX_RESULTS_ACTION }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50, select: { id: true, createdAt: true, after: true } }),
  db.athleteProfile.findUnique({ where: { userId: athleteId }, select: { runPaceBase: true } }),
 ]);
 let unreadableResults = 0;
 const results = audits.flatMap(row => { try {
  const saved = JSON.parse(row.after || 'null');
  if (saved?.version !== HYROX_RESULTS_VERSION || saved.source !== 'athlete_report' || typeof saved.timezone !== 'string' || !['entered', 'profile_threshold_scenario'].includes(saved.paceSource)) throw Error();
  // Recompute comparisons from the immutable reported values, never a changed profile.
  const result = prepareHyroxResult({ ...saved.input, confirmed: true }, { timezone: saved.timezone, profilePace: null, now: row.createdAt });
  return [{ id: row.id, createdAt: row.createdAt.toISOString(), ...result, paceSource: saved.paceSource as 'entered' | 'profile_threshold_scenario' }];
 } catch { unreadableResults++; return []; } });
 const revision = createHash('sha256').update(JSON.stringify({ audits, profile })).digest('hex');
 return { revision, results, unreadableResults, profilePace: profile?.runPaceBase ?? null, source: 'athlete_report' as const, historyLimit: 50 };
}
export async function saveHyroxResult(athlete: { id: string; timezone: string }, body: Record<string, unknown>, tx: ResultsDb) {
 const state = await readHyroxResults(athlete.id, tx);
 if (typeof body.expectedRevision !== 'string' || body.expectedRevision !== state.revision) throw new ApiError('Saved results or profile references changed. Reload and review before saving.', 409);
 const prepared = prepareHyroxResult(body, { timezone: athlete.timezone, profilePace: state.profilePace });
 const row = await tx.auditLog.create({ data: { actorId: athlete.id, subjectId: athlete.id, action: HYROX_RESULTS_ACTION, after: JSON.stringify(prepared), note: 'Explicitly confirmed athlete-reported HYROX splits. No training, profile or capacity changed.' } });
 const updated = await readHyroxResults(athlete.id, tx);
 return { ok: true, id: row.id, ...updated };
}
