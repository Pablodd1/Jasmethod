import type { Prisma } from "@prisma/client";

// All roles count. This is the pilot enrollment limit, not a sign-in limit.
export const PILOT_USER_LIMIT = 50;
export const PILOT_FULL_MESSAGE = "The free pilot has reached its 50-account limit. Existing users can still sign in, recover access and link Google. Contact support about joining.";
export class PilotFullError extends Error {
  readonly code = "pilot_full";
  constructor() { super(PILOT_FULL_MESSAGE); this.name = "PilotFullError"; }
}

/** Must run inside an interactive READ COMMITTED transaction. Lock lifetime is
 * the transaction, including the subsequent insert, across all server instances.
 * Use a stable key independent of the configurable business limit. */
export async function lockPilotAccounts(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(1246571856, 1)`;
}

/** Only call when creating a NEW User. Existing sign-in/link/reset needs no seat. */
export async function assertPilotCapacity(tx: Prisma.TransactionClient) {
  await lockPilotAccounts(tx);
  if (await tx.user.count() >= PILOT_USER_LIMIT) throw new PilotFullError();
}
