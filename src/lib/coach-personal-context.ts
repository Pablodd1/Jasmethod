import { genericExternalContext, AI_DATA_POLICY_VERSION } from "./ai-data-policy";
import type { CoachReplyContext } from "./coach-conversation";

export const COACH_CONTEXT_VERSION = AI_DATA_POLICY_VERSION;
export interface ManualCoachActual {
  date: Date | string; source: string | null; planned: boolean; completed: boolean; matchedPlanId: string | null; externalId: string | null;
  actualDurationMin: number | null; durationMin: number; actualSport: string | null; sport: string; rpe: number | null;
}
export interface PersonalCoachFacts {
  version: typeof COACH_CONTEXT_VERSION;
  profile: { goal: string | null; experience: string | null; weightKg: number | null; source: "athlete_intent_and_explicit_manual_fields" };
  recentManualActuals: { date: string; sport: string | null; actualMinutes: number | null; reportedRpe: number | null; source: "manual_unmatched_activity" }[];
  historyDays: 30;
  excluded: string[];
}
const sports = new Set(["run", "bike", "swim", "hyrox", "strength", "mobility", "recovery", "brick", "other"]);
const goals = new Set(["sprint", "olympic", "half", "full", "hyrox", "cycle", "swim-only", "run-only", "track-sprint", "5k", "10k", "half-marathon", "marathon"]);
const levels = new Set(["beginner", "amateur", "advanced", "pro"]);
const finite = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
export function personalCoachFacts(profile: { goal?: string | null; experience?: string | null; weightKg?: number | null; weightSource?: string | null } | null,
  explicitExperience: boolean, rows: ManualCoachActual[], today: string): PersonalCoachFacts {
  const current = Date.parse(`${today}T23:59:59Z`);
  const recentManualActuals = rows.filter(row => row.source === "manual" && !row.planned && row.completed && row.matchedPlanId == null && row.externalId == null)
    .filter(row => { const when = new Date(row.date).getTime(); return Number.isFinite(when) && when <= current && current - when <= 30 * 86400000; })
    .sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0,10).map(row => ({
      date: new Date(row.date).toISOString().slice(0,10), sport: sports.has(row.actualSport || row.sport) ? row.actualSport || row.sport : null,
      actualMinutes: finite(row.actualDurationMin ?? row.durationMin, 0,1440), reportedRpe: finite(row.rpe,0,10), source: "manual_unmatched_activity" as const,
    }));
  return { version: COACH_CONTEXT_VERSION,
    profile: { goal: goals.has(profile?.goal || "") ? profile!.goal! : null,
      experience: explicitExperience && levels.has(profile?.experience || "") ? profile!.experience! : null,
      weightKg: profile?.weightSource === "manual" ? finite(profile.weightKg,20,300) : null, source: "athlete_intent_and_explicit_manual_fields" },
    recentManualActuals, historyDays: 30,
    excluded: ["identity_and_contact", "device_and_imported_data", "strava_and_derived_values", "generated_plans_with_unverified_ancestry", "biometrics", "race_predictions", "raw_profile_notes", "credentials", "images", "local_or_unverified_assistant_messages"],
  };
}
/** Strip common credentials/contact details from opt-in typed text; never export arbitrary profile blobs. */
export function minimizedCoachText(text: string): string {
  return text.replace(/\b(?:Bearer\s+)[A-Za-z0-9._~-]+/gi,"[credential removed]")
    .replace(/\b(?:sk-|sk_)[A-Za-z0-9_-]{8,}/g,"[credential removed]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,"[credential removed]")
    .replace(/\b(?:password|api[_ -]?key|client[_ -]?secret|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+/gi,"[credential removed]")
    .replace(/https?:\/\/\S+/gi,"[link removed]").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,"[email removed]")
    .replace(/(?<!\w)(?:\+?\d[\d ().-]{7,}\d)(?!\w)/g,"[contact number removed]");
}
/** Compatibility boundary: legacy callers cannot export personal facts or memory. */
export function externalCoachContext(context: CoachReplyContext, _includeAiReplies=false) {
  return genericExternalContext(context.language);
}
