import { prismaStreamRepo, purgeExpired, type StreamDelegate } from "./activity-stream-store";

/** Independent from the storage flag: disabling collection must not suspend erasure. */
export async function cleanupActivityStreams(delegate: StreamDelegate, now = new Date()) {
  try { return { status: "ok", deleted: await purgeExpired(prismaStreamRepo(delegate), now) }; }
  catch (error) {
    // An unapplied optional migration is expected while this feature remains disabled.
    if (error && typeof error === "object" && "code" in error && error.code === "P2021") return { status: "not_migrated", deleted: 0 };
    console.error("Activity stream expiration cleanup failed");
    return { status: "failed", deleted: 0 };
  }
}
