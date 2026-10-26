import { prisma } from "./db";
import { encryptSecret, decryptSecret } from "./crypto";
import { GarminError } from "./garmin-config";
import { createGarminProtocol, type GarminPermission } from "./garmin-protocol";
import { createGarminOAuthService, type GarminStore } from "./garmin-oauth-service";

const provider = "garmin_direct";
export const garminOAuthStore: GarminStore = {
  get: userId => prisma.connector.findUnique({ where: { userId_provider: { userId, provider } } }),
  async begin(userId, marker, txn) {
    await prisma.$transaction(async tx => {
      const row = await tx.connector.findUnique({ where: { userId_provider: { userId, provider } } });
      if (row && (row.tokenEnc || row.status !== "disconnected"))
        throw new GarminError("disconnect_previous_account", "Disconnect the previous Garmin authorization before starting again.", 409);
      await tx.oAuthTransaction.updateMany({ where: { userId, provider, usedAt: null }, data: { usedAt: new Date() } });
      await tx.oAuthTransaction.create({ data: { ...txn, provider } });
      await tx.connector.upsert({ where: { userId_provider: { userId, provider } },
        create: { userId, provider, tokenEnc: marker, status: "authorizing" },
        update: { tokenEnc: marker, refreshEnc: null, expiresAt: null, externalRef: null, scope: null, status: "authorizing", lastError: null, lastSyncAt: null, lastSyncCount: null, syncStartedAt: null } });
    }, { isolationLevel: "Serializable" });
  },
  transaction: state => prisma.oAuthTransaction.findFirst({ where: { state, provider } }),
  async consume(state, userId, now) {
    return (await prisma.oAuthTransaction.updateMany({ where: { state, userId, provider, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } })).count === 1;
  },
  async replace(expected, patch, uniqueIdentity, invalidateAt) {
    return prisma.$transaction(async tx => {
      if (uniqueIdentity && patch.externalRef) {
        const other = await tx.connector.findFirst({ where: { provider, externalRef: patch.externalRef, userId: { not: expected.userId }, tokenEnc: { not: null } } });
        if (other) throw new GarminError("provider_account_already_linked", "This Garmin account is already connected to another athlete.", 409);
      }
      const result = await tx.connector.updateMany({ where: { id: expected.id, userId: expected.userId, provider,
        status: expected.status, tokenEnc: expected.tokenEnc, refreshEnc: expected.refreshEnc }, data: { ...patch, syncStartedAt: null } });
      if (result.count && invalidateAt)
        await tx.oAuthTransaction.updateMany({ where: { userId: expected.userId, provider, usedAt: null }, data: { usedAt: invalidateAt } });
      return result.count === 1;
    }, { isolationLevel: "Serializable" });
  },
};
const service = () => createGarminOAuthService({ store: garminOAuthStore, protocol: createGarminProtocol(), encrypt: encryptSecret, decrypt: decryptSecret });
export const beginGarminAuthorization = (userId: string) => service().begin(userId);
export const completeGarminAuthorization = (userId: string, params: URLSearchParams, binding: string | undefined) => service().complete(userId, params, binding);
export const disconnectGarmin = (userId: string) => service().disconnect(userId);
export const getGarminConnectionStatus = (userId: string) => service().status(userId);
/** Internal server use only; establish the authenticated athlete before calling. */
export const getGarminAuthorization = (userId: string, permissions: GarminPermission[] = []) => service().authorization(userId, permissions);
