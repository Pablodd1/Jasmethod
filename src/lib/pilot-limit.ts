import type { Prisma } from "@prisma/client";

// All roles count. This is an app enrollment limit, independent of provider
// athlete capacity. Raising it requires an owner-reviewed rollout decision.
export const DEFAULT_PILOT_USER_LIMIT = 50;
export const MAX_PILOT_USER_LIMIT = 100;
export function parsePilotUserLimit(value: string | undefined): number {
  if (value === undefined || value === "") return DEFAULT_PILOT_USER_LIMIT;
  if (!/^[1-9]\d{0,2}$/.test(value) || Number(value) > MAX_PILOT_USER_LIMIT) {
    throw new Error("PILOT_USER_LIMIT must be a whole number from 1 to 100. Enrollment configuration is invalid.");
  }
  return Number(value);
}
export function configuredPilotUserLimit(value: string | undefined): number {
  try { return parsePilotUserLimit(value); }
  // Zero means no new seats, never unlimited. Keep existing sign-in/recovery
  // available even when the operator supplied an invalid enrollment setting.
  catch { return 0; }
}
export const PILOT_USER_LIMIT = configuredPilotUserLimit(process.env.PILOT_USER_LIMIT);
export const PILOT_FULL_MESSAGE = PILOT_USER_LIMIT === 0
  ? "New-account registration is paused because the pilot capacity setting is invalid. Existing users can still sign in, recover access and link Google. Contact support about joining."
  : `The free pilot has reached its ${PILOT_USER_LIMIT}-account limit. Existing users can still sign in, recover access and link Google. Contact support about joining.`;
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
