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
