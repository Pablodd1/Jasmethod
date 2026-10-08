import {trainingAccess,ApiError} from '@/lib/access';
import {rateLimit} from '@/lib/ratelimit';
import {parseRaceCourseGpx} from '@/lib/race-course';
import {readScenarioJson,scenarioError,SCENARIO_HEADERS} from '@/lib/race-scenario-http';
export const dynamic='force-dynamic';
export async function POST(req:Request){try{const {actor}=await trainingAccess(req);if(!rateLimit(`race-course:${actor.id}`,10,60000).ok)throw new ApiError('Please wait before parsing another course',429);const body=await readScenarioJson(req,6*1024*1024);if(Object.keys(body).some(k=>k!=='gpx')||typeof body.gpx!=='string')throw new ApiError('Supply one course GPX string only');let course;try{course=parseRaceCourseGpx(body.gpx);}catch(e){throw new ApiError((e as Error).message);}return Response.json(course,{headers:SCENARIO_HEADERS});}catch(e){return scenarioError(e);}}
