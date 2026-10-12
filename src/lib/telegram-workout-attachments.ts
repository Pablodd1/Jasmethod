import type { CanonicalSession } from "./canonical-session";
import type { SessionNutrition } from "./session-nutrition";
import { buildUniversalWorkoutCard } from "./universal-workout-card-server";
import { renderUniversalWorkoutPng } from "./universal-workout-render";
import { buildPrivateSafeSessionDownload } from "./fit-export";
import { manualEmailActionable, manualEmailDue } from "./manual-workout-email";
import type { TelegramWorkoutAttachment } from "./telegram-coaching-transport";

/** Same athlete-approved, effective revision as manual delivery. Neither a
 * ready verdict alone nor channel consent authorizes an unapproved workout. */
export function telegramWorkoutActionable(session: CanonicalSession, workout: { approved: boolean; planned: boolean; completed: boolean; feedbackStatus?: string | null; startTime?: string | null }, confirmedRevision: string | null, now = new Date()) {
  return manualEmailActionable(session, workout, confirmedRevision) &&
    manualEmailDue({ dateLocal: session.dateLocal, timezone: session.timezone, startTime: workout.startTime || null, minuteOfDay: 0, leadMinutes: 0 }, now);
}

export function telegramWorkoutAttachments(session: CanonicalSession, nutrition:SessionNutrition=null,language:"en"|"es"="en"): TelegramWorkoutAttachment[] {
  if (session.verdict !== "ready" || !session.capability.available || session.capability.downloadFormat !== "fit") return [];
  const download = buildPrivateSafeSessionDownload(session);
  const caption = `JMM ${session.sport} · ${session.dateLocal} · revision ${session.revision.slice(0, 8)}. Review the current plan in the app before training. Manual device transfer required; compatibility and watch delivery unverified.`;
  const attachments: TelegramWorkoutAttachment[] = [{ kind: "fit", bytes: download.bytes, filename: download.filename, caption }];
  // A time-width chart cannot honestly represent distance, reps or open laps.
  if (session.steps.length && session.steps.every(s => s.endpoint.type === "time" && s.endpoint.seconds > 0)) {
    attachments.push({ kind: "graphic", filename: "workout-profile.png", caption: `Workout effort profile; bar width represents prescribed time. ${caption}`,
      bytes: renderUniversalWorkoutPng(buildUniversalWorkoutCard(session,nutrition,language)) });
  }
  return attachments;
}
