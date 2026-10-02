import type { TargetProfile } from "./canonical-session";
// Conservative launch validity policy, pending coaching sign-off. No age/sex
// inference and no test is required: missing evidence simply leaves effort open.
export const ANCHOR_MAX_AGE_DAYS = 90;
export interface AnchorTest { id: string; date: Date; type: string; result: number | null; skipped: boolean; completed: boolean }
export function evidencedTargetProfile(profile: TargetProfile | null | undefined, tests: AnchorTest[], appliedIds: string[], now = new Date()) {
  const valid = tests.filter(t => appliedIds.includes(t.id) && t.completed && !t.skipped && t.result != null && Number.isFinite(t.result) && t.result > 0 && now.getTime() >= t.date.getTime() && now.getTime() - t.date.getTime() <= ANCHOR_MAX_AGE_DAYS * 86400000);
  const matches = (type: string, value: number | null | undefined, derive = (n: number) => n) => value != null && valid.some(t => t.type === type && Math.abs(derive(t.result!) - value) < .01);
  return { ...profile,
    ftp: matches("ftp", profile?.ftp) ? profile?.ftp : null,
    // LTHR test records have no sport context. Do not assume run and bike match.
    lthr: null,
    runPaceBase: matches("run5k", profile?.runPaceBase, n => Math.round(n / 5 * 1.06)) ? profile?.runPaceBase : null,
    swimPaceBase: matches("swim", profile?.swimPaceBase) ? profile?.swimPaceBase : null,
  };
}
