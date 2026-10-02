import { telegramCoachingConfigured } from "@/lib/telegram-coaching-transport";
import { prisma } from "@/lib/db";
import { coachingActor, coachingError } from "@/lib/coaching-route";
import { mockCoachingEnabled } from "@/lib/coaching-communication";
export async function GET(req: Request) {
  try { const user = await coachingActor(req);
    const [deliveries, prompts] = await Promise.all([
      prisma.reminderDelivery.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 }),
      prisma.coachingPrompt.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, transport: true, channel: true, observationDate: true, status: true, replyStatus: true, attempts: true, nextAttemptAt: true, error: true, receiptId: true, createdAt: true } }),
    ]);
    return Response.json({ cronConfigured: Boolean(process.env.CRON_SECRET) && (mockCoachingEnabled() || telegramCoachingConfigured()), automatedDeliveryEnabled: telegramCoachingConfigured(),
      mockEnabled: mockCoachingEnabled(), receiptAvailable: false, telegramConfigured: telegramCoachingConfigured(), smtpConfigured: false,
      recentProviderAcceptances: prompts.filter(p => p.transport === "telegram" && p.status === "sent").length, prompts, legacyDeliveries: deliveries, reason: "Mock acceptance is not a send, read receipt or athlete answer. Unknown attempts are never automatically resent." });
  } catch (e) { return coachingError(e); }
}
