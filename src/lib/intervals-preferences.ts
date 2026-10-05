import { prisma } from "./db";

// Reuse the immutable settings audit pattern; never infer consent from OAuth scopes.
export async function readIntervalsAutoPublish(userId: string, externalRef: string, db: Pick<typeof prisma, "auditLog"> = prisma): Promise<boolean> {
  const entry = await db.auditLog.findFirst({
    where: { subjectId: userId, actorId: userId, action: "intervals.auto_publish" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { after: true },
  });
  try {
    const value = JSON.parse(entry?.after || "null");
    return value?.version === 1 && value.enabled === true && value.externalRef === externalRef;
  } catch { return false; }
}
