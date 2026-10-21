// Browser-safe: no transport, credentials or athlete health information.
export function reminderBlockers(settings: { primaryChannel: string; paused: boolean; dailyPlan: boolean;
  sessionFeedback: boolean; missingData: boolean; minuteOfDay: number; quietStart: number; quietEnd: number },
  externalEnabled: boolean, verifiedTelegram: boolean) {
  const blockers: string[] = [];
  if (!externalEnabled) blockers.push("transport_disabled");
  if (settings.paused) blockers.push("paused");
  if (!settings.dailyPlan && !settings.sessionFeedback && !settings.missingData) blockers.push("no_purposes");
  if (settings.primaryChannel !== "telegram") blockers.push("unsupported_channel");
  else if (!verifiedTelegram) blockers.push("telegram_unverified");
  const { minuteOfDay: minute, quietStart: start, quietEnd: end } = settings;
  if (start < end ? minute >= start && minute < end : minute >= start || minute < end) blockers.push("quiet_hours");
  return blockers;
}

/** Workout email has its own outbox/consent and worker, independent of Calendar and Telegram. */
export function workoutEmailBlockers(input: { configured: boolean; cronConfigured: boolean; storageAvailable: boolean;
  enabled: boolean; verified: boolean; consent: boolean; purposes: boolean; timezoneMatches: boolean; languageSupported: boolean }) {
  return Object.entries({ email_unconfigured: !input.configured, scheduler_unconfigured: !input.cronConfigured,
    email_storage_unavailable: !input.storageAvailable, email_paused: !input.enabled, email_unverified: !input.verified,
    email_consent_required: !input.consent, email_no_purposes: !input.purposes, email_timezone_changed: !input.timezoneMatches,
    email_language_unsupported: !input.languageSupported }).filter(([, blocked]) => blocked).map(([key]) => key);
}
