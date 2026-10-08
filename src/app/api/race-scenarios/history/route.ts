import {trainingAccess,ApiError} from '@/lib/access';
import {rateLimit} from '@/lib/ratelimit';
import {getRaceScenarioHistory,validateRaceHistoryRequest} from '@/lib/race-weather';
import {readScenarioJson,scenarioError,SCENARIO_HEADERS} from '@/lib/race-scenario-http';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{const {actor}=await trainingAccess(req);if(!rateLimit(`race-history:${actor.id}`,8,60000).ok)throw new ApiError('Please wait before requesting history again',429);const body=await readScenarioJson(req,4096);let input;try{input=validateRaceHistoryRequest(body);}catch(e){throw new ApiError((e as Error).message);}return Response.json(await getRaceScenarioHistory(input),{headers:SCENARIO_HEADERS});}catch(e){return scenarioError(e);}}
