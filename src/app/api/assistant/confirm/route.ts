import { errorResponse } from "@/lib/access";
import { assistantAccess, readConversationBody, confirmConversation } from "@/lib/coach-conversation-service";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try { const actor = await assistantAccess(req); return Response.json(await confirmConversation(actor, await readConversationBody(req, 100000)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error); }
}
