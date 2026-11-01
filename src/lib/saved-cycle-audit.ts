/** Optional audit metadata is separate from the authoritative saved schedule.
 * Legacy envelopes without a cycle are normal; malformed JSON/shape requires
 * review and is never returned as usable cycle context. */
export function readSavedCycleAudit(after: string | null | undefined): { cycle: Record<string, unknown> | null; cycleSummaryNeedsReview: boolean } {
  if (after == null) return { cycle: null, cycleSummaryNeedsReview: false };
  try {
    const envelope: unknown = JSON.parse(after);
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) throw new Error("Invalid audit envelope");
    const cycle = (envelope as Record<string, unknown>).cycle;
    if (cycle == null) return { cycle: null, cycleSummaryNeedsReview: false };
    if (typeof cycle !== "object" || Array.isArray(cycle)) throw new Error("Invalid cycle summary");
    return { cycle: cycle as Record<string, unknown>, cycleSummaryNeedsReview: false };
  } catch {
    return { cycle: null, cycleSummaryNeedsReview: true };
  }
}
