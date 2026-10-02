// Pilot scope exclusion: enabling requires dated anchor provenance, event/course
// validation, empirically evaluated errors and release-owner approval. This is
// deliberately not an environment toggle that can silently re-enable guesses.
export const FORECAST_AVAILABILITY = {
  enabled: false,
  reason: "personalized_forecasts_disabled",
  message: "Personalized numeric race forecasts are unavailable in this pilot. Dated sport-specific evidence, training history, course details and model error have not been validated. Your goal time is a goal, not a prediction or measured capacity.",
  modelVersion: "pilot-disabled-2026-10-02",
} as const;
