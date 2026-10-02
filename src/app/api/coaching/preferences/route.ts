import { telegramCoachingConfigured } from "@/lib/telegram-coaching-transport";
import { prisma } from "@/lib/db";
import { coachingActor, coachingBody, coachingError } from "@/lib/coaching-route";
import { publicPreference, saveCommunicationSettings } from "@/lib/coaching-service";
import { mockCoachingEnabled, CONSENT_VERSION, TELEGRAM_CONSENT_VERSION } from "@/lib/coaching-communication";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try { const actor = await coachingActor(req); const pref = await prisma.communicationPreference.findUnique({ where: { userId: actor.id } });
    return Response.json({ preferences: publicPreference(pref, actor.timezone), enabled: mockCoachingEnabled() || telegramCoachingConfigured(), transport: telegramCoachingConfigured() ? "telegram" : "mock", externalDeliveryEnabled: telegramCoachingConfigured(), consentVersion: telegramCoachingConfigured() ? TELEGRAM_CONSENT_VERSION : CONSENT_VERSION });
  } catch (e) { return coachingError(e); }
}
export async function PUT(req: Request) {
  try { const { actor, body } = await coachingBody(req); return Response.json({ ok: true, preferences: await saveCommunicationSettings(actor, body), externalDeliveryEnabled: telegramCoachingConfigured() }); }
  catch (e) { return coachingError(e); }
}
