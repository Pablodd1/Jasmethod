import { prisma } from "./db";
import { encryptSecret, decryptSecret } from "./crypto";
import { CorosOAuthError } from "./coros-oauth-config";
import { createCorosOAuthProtocol } from "./coros-oauth-protocol";
import { createCorosOAuthService, COROS_MANUAL_REVOCATION_MESSAGE, type CorosOAuthStore } from "./coros-oauth-service";
export { corosOAuthConfigured, CorosOAuthError } from "./coros-oauth-config";

const provider = "coros";
const store: CorosOAuthStore = {
  get: userId => prisma.connector.findUnique({ where: { userId_provider: { userId, provider } } }),
  async begin(userId, pendingEnc, transaction) {
    await prisma.$transaction(async tx => {
      const existing = await tx.connector.findUnique({ where: { userId_provider: { userId, provider } } });
      if (existing?.tokenEnc || (existing && !["disconnected", "revocation_required"].includes(existing.status)))
        throw new CorosOAuthError("disconnect_previous_account", "Disconnect the previous COROS authorization before connecting again.", 409);
      await tx.oAuthTransaction.updateMany({ where: { userId, provider, usedAt: null }, data: { usedAt: new Date() } });
      await tx.oAuthTransaction.create({ data: { ...transaction, provider } });
      await tx.connector.upsert({ where: { userId_provider: { userId, provider } },
        create: { userId, provider, tokenEnc: pendingEnc, status: "authorizing" },
        update: { tokenEnc: pendingEnc, refreshEnc: null, externalRef: null, expiresAt: null, scope: null, status: "authorizing", lastError: existing?.lastError?.includes(COROS_MANUAL_REVOCATION_MESSAGE) ? COROS_MANUAL_REVOCATION_MESSAGE : null, syncStartedAt: null, lastSyncAt: null, lastSyncCount: null } });
    }, { isolationLevel: "Serializable" });
  },
  transaction: state => prisma.oAuthTransaction.findFirst({ where: { state, provider } }),
  async consume(state, userId, now) {
    const claim = await prisma.oAuthTransaction.updateMany({ where: { state, userId, provider, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    return claim.count === 1;
  },
  async replace(expected, patch, uniqueIdentity, invalidateTransactionsAt) {
    return prisma.$transaction(async tx => {
      if (uniqueIdentity && patch.externalRef) {
        const other = await tx.connector.findFirst({ where: { provider, externalRef: patch.externalRef, userId: { not: expected.userId }, tokenEnc: { not: null } } });
        if (other) throw new CorosOAuthError("provider_account_already_linked", "This COROS account is already authorized for another athlete.", 409);
      }
      const changed = await tx.connector.updateMany({ where: { id: expected.id, userId: expected.userId, provider, status: expected.status, tokenEnc: expected.tokenEnc, refreshEnc: expected.refreshEnc }, data: { ...patch, syncStartedAt: null } });
      if (changed.count === 1 && invalidateTransactionsAt) {
        await tx.oAuthTransaction.updateMany({ where: { userId: expected.userId, provider, usedAt: null }, data: { usedAt: invalidateTransactionsAt } });
      }
      return changed.count === 1;
    }, { isolationLevel: "Serializable" });
  },
};
const service = () => createCorosOAuthService({ store, protocol: createCorosOAuthProtocol(), encrypt: encryptSecret, decrypt: decryptSecret });
export const beginCorosAuthorization = (userId: string) => service().begin(userId);
export const completeCorosAuthorization = (userId: string, params: URLSearchParams, browserBinding: string | undefined) => service().complete(userId, params, browserBinding);
export const refreshCorosAuthorization = (userId: string) => service().refresh(userId);
export const disconnectCoros = (userId: string) => service().disconnect(userId);
export const getCorosConnectionStatus = (userId: string) => service().status(userId);
/** Internal only. Authenticate the actor and establish their own userId first. */
export const getCorosAuthorization = (userId: string) => service().authorization(userId);
