import { appMutationOriginAllowed } from "@/lib/request-origin";
import { ApiError, errorResponse } from "@/lib/access";
import { assistantAccess, readConversationBody, getConversation, appendConversation, clearConversation } from "@/lib/coach-conversation-service";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try { return Response.json(await getConversation(await assistantAccess(req)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error); }
}
export async function POST(req: Request) {
  try {
    const actor = await assistantAccess(req), body = await readConversationBody(req);
    if (body.manualDialogueConsent === true) {
      if (!appMutationOriginAllowed(req)) throw new ApiError("Use personal Coach from the JMM application only", 403);
      if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ApiError("Expected JSON", 415);
    }
    return Response.json(await appendConversation(actor, body), { headers: { "Cache-Control": "private, no-store" } });
  }
  catch (error) { return errorResponse(error); }
}
export async function DELETE(req: Request) {
  try { const actor = await assistantAccess(req); return Response.json(await clearConversation(actor, await readConversationBody(req, 4096)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return errorResponse(error); }
}
