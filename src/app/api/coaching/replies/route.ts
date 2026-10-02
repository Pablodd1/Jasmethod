import { coachingBody, coachingError } from "@/lib/coaching-route";
import { receiveCoachingReply, confirmCoachingReply } from "@/lib/coaching-service";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try { const { actor, body } = await coachingBody(req); return Response.json(await receiveCoachingReply(actor, body)); } catch (e) { return coachingError(e); }
}
export async function PUT(req: Request) {
  try { const { actor, body } = await coachingBody(req); return Response.json(await confirmCoachingReply(actor, body)); } catch (e) { return coachingError(e); }
}
