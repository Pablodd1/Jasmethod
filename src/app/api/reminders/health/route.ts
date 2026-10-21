import { telegramCoachingConfigured } from "@/lib/telegram-coaching-transport";
import { prisma } from "@/lib/db";
import { coachingActor, coachingError } from "@/lib/coaching-route";
import { mockCoachingEnabled } from "@/lib/coaching-communication";
import { manualEmailConfigured, MANUAL_EMAIL_CONSENT } from "@/lib/manual-workout-email";
import { manualEmailLanguage } from "@/lib/manual-workout-email-locale";
import { workoutEmailBlockers } from "@/lib/reminder-readiness";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try { const user = await coachingActor(req);
    const [deliveries, prompts, email] = await Promise.all([
      prisma.reminderDelivery.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 }),
      prisma.coachingPrompt.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, transport: true, channel: true, observationDate: true, status: true, replyStatus: true, attempts: true, nextAttemptAt: true, error: true, receiptId: true, createdAt: true } }),
      Promise.all([
        prisma.manualWorkoutEmailPreference.findUnique({ where: { userId: user.id } }),
        prisma.manualWorkoutEmailOutbox.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10,
          select: { id: true, sessionId: true, kind: true, status: true, revision: true, receiptId: true, attemptedAt: true, acceptedAt: true, createdAt: true } }),
      ]).then(([preference, outbox]) => ({ preference, outbox, available: true })).catch((error: unknown) => {
        if (["P2021", "P2022"].includes((error as { code?: string })?.code ?? "")) return { preference: null, outbox: [], available: false };
        throw error;
      }),
    ]);
    const pref = email.preference, configured = manualEmailConfigured(), cronConfigured = Boolean(process.env.CRON_SECRET);
    const blockers = workoutEmailBlockers({ configured, cronConfigured, storageAvailable: email.available,
      enabled: pref?.enabled === true, verified: !!pref?.verifiedAt && pref.recipient === user.email,
      consent: !!pref?.consentAt && pref.consentVersion === MANUAL_EMAIL_CONSENT,
      purposes: !!pref && (pref.daily || pref.revisions), timezoneMatches: !pref || pref.timezone === user.timezone,
      languageSupported: !!manualEmailLanguage(user.language) });
    return Response.json({ cronConfigured, automatedDeliveryEnabled: telegramCoachingConfigured(),
      mockEnabled: mockCoachingEnabled(), receiptAvailable: false, telegramConfigured: telegramCoachingConfigured(), smtpConfigured: !!process.env.SMTP_HOST && !!process.env.SMTP_FROM,
      workoutEmail: { configured, storageAvailable: email.available, scheduler: "/api/cron/worker", blockers, recentLimit:10,
        timezone: pref?.timezone ?? user.timezone, minuteOfDay: pref?.minuteOfDay ?? null,
        statuses: { queued: email.outbox.filter(row => row.status === "queued").length,
          providerAccepted: email.outbox.filter(row => row.status === "accepted").length,
          outcomeUnknown: email.outbox.filter(row => row.status === "unknown" || row.status === "sending").length,
          rejected:email.outbox.filter(row=>row.status==="rejected").length },
        recentAttempts: email.outbox, received: null,
        reason: "Email uses separate verified consent and its existing outbox. Calendar connection is not required. SMTP acceptance is not inbox receipt; unknown outcomes are never automatically resent." },
      recentProviderAcceptances: prompts.filter(p => p.transport === "telegram" && p.status === "sent").length, prompts, legacyDeliveries: deliveries, reason: "Mock acceptance is not a send, read receipt or athlete answer. Unknown attempts are never automatically resent." }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return coachingError(e); }
}
