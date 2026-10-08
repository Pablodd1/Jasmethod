import {appMutationOriginAllowed} from '@/lib/request-origin';
import {trainingAccess,ApiError} from '@/lib/access';
import {prisma} from '@/lib/db';
import {rateLimit} from '@/lib/ratelimit';
import {readRaceScenarioState,RACE_SCENARIO_ACTION} from '@/lib/race-scenario-store';
import {prepareRaceScenario} from '@/lib/race-scenario-request';
import {readScenarioJson,scenarioError,SCENARIO_HEADERS} from '@/lib/race-scenario-http';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{const {athlete}=await trainingAccess(req);return Response.json(await readRaceScenarioState(athlete.id),{headers:SCENARIO_HEADERS});}catch(e){return scenarioError(e);}}
export async function POST(req:Request){try{
 const {actor,athlete}=await trainingAccess(req);
 if(!appMutationOriginAllowed(req))throw new ApiError('Save scenarios from this application only',403);
 if(req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new ApiError('Expected JSON',415);
 if(!rateLimit(`race-scenario-save:${actor.id}`,30,60000).ok)throw new ApiError('Please wait before saving another scenario',429);
 const body=await readScenarioJson(req);
 const saved=await prisma.$transaction(async tx=>{
  const state=await readRaceScenarioState(athlete.id,tx);
  if(typeof body.expectedRevision!=='string'||body.expectedRevision!==state.revision)throw new ApiError('Race details, references or saved scenarios changed. Reload and review before saving.',409);
  const prepared=prepareRaceScenario(body,state);
  const row=await tx.auditLog.create({data:{actorId:actor.id,subjectId:athlete.id,action:RACE_SCENARIO_ACTION,after:JSON.stringify({version:'race-scenario-snapshot-v1',modelVersion:prepared.result.modelVersion,evidenceRevision:state.evidenceRevision,...prepared}),note:'Explicit execution scenario only. No profile, training plan or validated forecast changed.'}});
  return {id:row.id,createdAt:row.createdAt.toISOString(),...prepared};
 },{isolationLevel:'Serializable'});
 return Response.json({ok:true,...saved},{status:201,headers:SCENARIO_HEADERS});
 }catch(e){if((e as {code?:string})?.code==='P2034')return scenarioError(new ApiError('Another change was saved. Reload and review before retrying.',409));return scenarioError(e);}}
