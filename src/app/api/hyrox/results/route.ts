import { ApiError, trainingAccess } from '@/lib/access';
import { prisma } from '@/lib/db';
import { appMutationOriginAllowed } from '@/lib/request-origin';
import { rateLimit } from '@/lib/ratelimit';
import { readScenarioJson, scenarioError, SCENARIO_HEADERS } from '@/lib/race-scenario-http';
import { readHyroxResults, saveHyroxResult } from '@/lib/hyrox-results';
export const dynamic = 'force-dynamic';
async function owner(req: Request) { const { actor, athlete } = await trainingAccess(req); if (actor.id !== athlete.id) throw new ApiError('HYROX actual results are private to their athlete', 403); return athlete; }
export async function GET(req: Request) { try { const athlete = await owner(req); return Response.json(await readHyroxResults(athlete.id), { headers: SCENARIO_HEADERS }); } catch (e) { return scenarioError(e); } }
export async function POST(req: Request) { try {
 const athlete = await owner(req);
 if (!appMutationOriginAllowed(req)) throw new ApiError('Save results from this application only', 403);
 if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new ApiError('Expected JSON', 415);
 if (!rateLimit(`hyrox-results:${athlete.id}`, 30, 60000).ok) throw new ApiError('Please wait before saving another result', 429);
 const body = await readScenarioJson(req, 16384);
 const result = await prisma.$transaction(tx => saveHyroxResult(athlete, body, tx), { isolationLevel: 'Serializable' });
 return Response.json(result, { status: 201, headers: SCENARIO_HEADERS });
 } catch (e) { return scenarioError((e as { code?: string })?.code === 'P2034' ? new ApiError('Another result was saved. Reload and review before retrying.', 409) : e); }
}
