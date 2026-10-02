import { coachingActor, coachingBody, coachingError } from "@/lib/coaching-route";
import { startMockPairing, finishMockPairing, startTelegramPairing, disconnectCoaching } from "@/lib/coaching-service";
import { telegramCoachingConfigured } from "@/lib/telegram-coaching-transport";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  try { return Response.json(await (telegramCoachingConfigured() ? startTelegramPairing : startMockPairing)(await coachingActor(req))); } catch (e) { return coachingError(e); }
}
export async function PUT(req: Request) {
  try { const { actor, body } = await coachingBody(req); return Response.json(await finishMockPairing(actor, body)); } catch (e) { return coachingError(e); }
}

export async function DELETE(req: Request) {
  try { return Response.json(await disconnectCoaching(await coachingActor(req))); } catch (e) { return coachingError(e); }
}
