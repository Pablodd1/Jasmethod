import { reportedAnchor } from "./reported-anchors";
import type { TargetProfile } from "./canonical-session";
// Conservative launch validity policy, pending coaching sign-off. No age/sex
// inference and no test is required: missing evidence simply leaves effort open.
export const ANCHOR_MAX_AGE_DAYS = 90;
export interface AnchorTest { id: string; date: Date; type: string; result: number | null; skipped: boolean; completed: boolean }
export function evidencedTargetProfile(profile: TargetProfile | null | undefined, tests: AnchorTest[], appliedIds: string[], now = new Date(), timezone="UTC") {
  const valid = tests.filter(t => appliedIds.includes(t.id) && t.completed && !t.skipped && t.result != null && Number.isFinite(t.result) && t.result > 0 && now.getTime() >= t.date.getTime() && now.getTime() - t.date.getTime() <= ANCHOR_MAX_AGE_DAYS * 86400000);
  const matches = (type: string, value: number | null | undefined, derive = (n: number) => n) => value != null && valid.some(t => t.type === type && Math.abs(derive(t.result!) - value) < .01);
  const referenceEvidence:NonNullable<TargetProfile["referenceEvidence"]>={};
  for(const [field,type,unit] of [["ftp","ftp","W"],["runPaceBase","run5k","sec/km"],["swimPaceBase","swim","sec/100m"]] as const){
    const manual=reportedAnchor(profile as any,field,now,timezone);
    const test=valid.find(t=>t.type===type&&Math.abs((type==="run5k"?Math.round(t.result!/5*1.06):t.result!)-(profile?.[field]??NaN))<.01);
    if(test)referenceEvidence[field]={source:type==="run5k"?"estimated_from_applied_5k":"applied_field_test",observedAt:test.date.toISOString(),unit,value:profile![field]!};
    else if(manual)referenceEvidence[field]={source:manual.source,observedAt:manual.observedAt,unit:manual.unit,value:manual.value};
  }
  return { ...profile,referenceEvidence,
    ftp: (matches("ftp", profile?.ftp) || reportedAnchor(profile as any,"ftp",now,timezone)) ? profile?.ftp : null,
    // LTHR test records have no sport context. Do not assume run and bike match.
    lthr: null,
    runPaceBase: (matches("run5k", profile?.runPaceBase, n => Math.round(n / 5 * 1.06)) || reportedAnchor(profile as any,"runPaceBase",now,timezone)) ? profile?.runPaceBase : null,
    swimPaceBase: (matches("swim", profile?.swimPaceBase) || reportedAnchor(profile as any,"swimPaceBase",now,timezone)) ? profile?.swimPaceBase : null,
  };
}
