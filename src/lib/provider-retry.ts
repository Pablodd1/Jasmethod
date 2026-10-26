/** Bounded provider-directed cooldown, never an immediate retry after a 429. */
export function providerRetryAfterMs(value: string | null, now = Date.now()): number {
  const seconds = value && /^\d+$/.test(value.trim()) ? Number(value) * 1000 : value ? Date.parse(value) - now : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(86400000, Math.max(1000, seconds)) : 60000;
}
