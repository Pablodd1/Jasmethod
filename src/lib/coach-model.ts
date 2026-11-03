/** Explicit model selection. A provider error never switches models or providers. */
export const DEFAULT_COACH_MODEL = "gpt-6-astra";
export const COACH_TEXT_MODELS = new Set([DEFAULT_COACH_MODEL, "gpt-4.1-mini-2025-04-14", "gpt-4.1-mini"]);
export const coachModelTimeout = (model: string, legacyTimeout: number) => model === DEFAULT_COACH_MODEL ? 45000 : legacyTimeout;

export function coachModelParameters(model: string, legacyOutputTokens: number) {
  return model === DEFAULT_COACH_MODEL
    ? { reasoning_effort: "low" as const, max_completion_tokens: 8192 }
    : { temperature: 0.2, max_tokens: legacyOutputTokens };
}
