import {trainingAccess,ApiError} from '@/lib/access';
import {rateLimit} from '@/lib/ratelimit';
import {readRaceScenarioState} from '@/lib/race-scenario-store';
import {prepareRaceScenario} from '@/lib/race-scenario-request';
import {readScenarioJson,scenarioError,SCENARIO_HEADERS} from '@/lib/race-scenario-http';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{const {actor,athlete}=await trainingAccess(req);if(!rateLimit(`race-scenario-preview:${actor.id}`,60,60000).ok)throw new ApiError('Please wait before calculating again',429);const [body,state]=await Promise.all([readScenarioJson(req),readRaceScenarioState(athlete.id)]);return Response.json({...prepareRaceScenario(body,state),revision:state.revision,evidenceRevision:state.evidenceRevision},{headers:SCENARIO_HEADERS});}catch(e){return scenarioError(e);}}
