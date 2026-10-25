import { ApiError, errorResponse } from "@/lib/access";
import {appMutationOriginAllowed} from "@/lib/request-origin";
import {rateLimit} from "@/lib/ratelimit";
import { assistantAccess, readConversationBody } from "@/lib/coach-conversation-service";
import { commanderPlan, getCommanderState } from "@/lib/coach-commander-service";
import { POST as generate } from "@/app/api/plan/generate/route";
export const dynamic="force-dynamic";
const privateResponse=(response:Response)=>{response.headers.set("Cache-Control","private, no-store");return response;};
export async function GET(req:Request) {
  try { return Response.json(await getCommanderState(await assistantAccess(req)),{headers:{"Cache-Control":"private, no-store"}}); }
  catch(error){return privateResponse(errorResponse(error));}
}
export async function POST(req:Request) {
  try {
    const actor=await assistantAccess(req);
    if(!appMutationOriginAllowed(req))throw new ApiError("Review plans from this application only",403);
    if(!rateLimit(`coach-plan:${actor.id}`,12,60000).ok)throw new ApiError("Please wait before reviewing another plan",429);
    return privateResponse(await commanderPlan(req,actor,await readConversationBody(req,4096),generate));
  }catch(error){return privateResponse(errorResponse(error));}
}
