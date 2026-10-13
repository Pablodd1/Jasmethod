// Deferred until the race-history integration has its own acceptance review.
// A stored API key must not silently activate searches, imports or daily sync.
// Existing records and the athlete's explicit unlink operation remain available.
export const ATHLINKS_DEFERRED = true;
export const ATHLINKS_DEFERRED_MESSAGE = "Athlinks race-history imports are deferred. Add races and personal bests manually; existing imported records are preserved.";
