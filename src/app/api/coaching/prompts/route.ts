import { coachingActor, coachingBody, coachingError } from "@/lib/coaching-route";
import { createCoachingPrompt, listCoachingPrompts } from "@/lib/coaching-service";
import type { Purpose, MockOutcome } from "@/lib/coaching-communication";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try { return Response.json({ prompts: await listCoachingPrompts((await coachingActor(req)).id) }); } catch (e) { return coachingError(e); }
}
export async function POST(req: Request) {
  try { const { actor, body } = await coachingBody(req); return Response.json(await createCoachingPrompt(actor, { sessionId: body.sessionId as string, purpose: body.purpose as Purpose, mockOutcome: body.mockOutcome as MockOutcome })); }
  catch (e) { return coachingError(e); }
}
