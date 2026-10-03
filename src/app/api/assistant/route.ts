import { errorResponse } from "@/lib/access";
import { assistantAccess, readConversationBody, getConversation, appendConversation, clearConversation } from "@/lib/coach-conversation-service";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try { return Response.json(await getConversation(await assistantAccess(req)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(req: Request) {
  try { const actor = await assistantAccess(req); return Response.json(await appendConversation(actor, await readConversationBody(req)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error); }
}
export async function DELETE(req: Request) {
  try { const actor = await assistantAccess(req); return Response.json(await clearConversation(actor, await readConversationBody(req, 4096)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error); }
}
