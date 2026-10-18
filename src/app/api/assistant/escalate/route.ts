import { errorResponse } from '@/lib/access';
import { assistantAccess,readConversationBody } from '@/lib/coach-conversation-service';
import { requestCoachReview } from '@/lib/coach-review';
export const dynamic='force-dynamic';
export async function POST(req:Request) {
  try {const actor=await assistantAccess(req);return Response.json(await requestCoachReview(actor,await readConversationBody(req,8192)),{headers:{'Cache-Control':'private, no-store'}});}
  catch(error){return errorResponse(error);}
}
