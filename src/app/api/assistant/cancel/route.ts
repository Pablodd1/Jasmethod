import { errorResponse } from "@/lib/access";
import { assistantAccess, readConversationBody, cancelConversationProposal } from "@/lib/coach-conversation-service";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try { const actor = await assistantAccess(req); return Response.json(await cancelConversationProposal(actor, await readConversationBody(req, 4096)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error); }
}
