import { trainingAccess, ApiError, errorResponse } from "@/lib/access";
import { appMutationOriginAllowed } from "@/lib/request-origin";
import { ensureFirstPlan } from "@/lib/first-plan-store";
import { rateLimit } from "@/lib/ratelimit";
import { readScenarioJson } from "@/lib/race-scenario-http";
export const dynamic="force-dynamic";
/** Owner-only app entry mutation, never a side-effecting GET or admin backfill. */
export async function POST(req:Request){
  try{
    const {actor,athlete}=await trainingAccess(req);
    if(actor.id!==athlete.id)throw new ApiError("Open your own training account.",403);
    if(!appMutationOriginAllowed(req))throw new ApiError("Open training from this application.",403);
    if(req.headers.get("content-type")?.split(";")[0].trim().toLowerCase()!=="application/json")throw new ApiError("Expected JSON",415);
    // Entry has no client-controlled athlete, physiology or plan parameters.
    const body=await readScenarioJson(req,32);
    if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).length)throw new ApiError("Expected an empty entry request");
    if(!rateLimit(`first-plan:${athlete.id}`,30,60000).ok)throw new ApiError("Please wait before retrying.",429);
    const plan=await ensureFirstPlan(athlete.id);
    return Response.json({ok:true,plan},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){return errorResponse(error);}
}
