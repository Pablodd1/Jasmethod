import { prisma } from "./db";
import { SMOKE_CONSENT, type SmokeStore } from "./account-smoke-test";
export const accountSmokeStore: SmokeStore = {
  async snapshot(userId) {
    const [user, telegram, emailPreference, calendar, smokeTelegram] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true } }),
      prisma.communicationPreference.findUnique({ where: { userId } }),
      prisma.manualWorkoutEmailPreference.findUnique({ where: { userId } }),
      prisma.connector.findUnique({ where: { userId_provider: { userId, provider: "google_cal_smoke" } } }),
      prisma.accountSmokeTelegram.findUnique({ where: { userId } }),
    ]);
    return { userId: user.id, email: user.email, telegram, emailPreference, calendar, smokeTelegram };
  },
  async claim(userId, channel, key, revision, verification) {
    try {
      const receipt = await prisma.accountSmokeReceipt.create({ data: { id: key, userId, channel, consentVersion: SMOKE_CONSENT, destinationRevision: revision, ...verification } });
      return { claimed: true, receipt };
    } catch (e) {
      if (!e || typeof e !== "object" || !("code" in e) || e.code !== "P2002") throw e;
      const receipt = await prisma.accountSmokeReceipt.findUniqueOrThrow({ where: { userId_channel_consentVersion: { userId, channel, consentVersion: SMOKE_CONSENT } } });
      return { claimed: false, receipt };
    }
  },
  async finish(userId, channel, result) {
    // Conditional completion prevents a stale writer from replacing an accepted receipt.
    await prisma.accountSmokeReceipt.updateMany({ where: { userId, channel, consentVersion: SMOKE_CONSENT, status: "processing" }, data: result });
    return prisma.accountSmokeReceipt.findUniqueOrThrow({ where: { userId_channel_consentVersion: { userId, channel, consentVersion: SMOKE_CONSENT } } });
  },
};
