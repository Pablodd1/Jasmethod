import { createHash } from "node:crypto";
/** Every projected reader of a reconciliation fingerprint must use this contract. */
export const ACTIVITY_EVIDENCE_SELECT={id:true,userId:true,date:true,sport:true,actualSport:true,source:true,externalId:true,notes:true,planned:true,completed:true,durationMin:true,actualDurationMin:true,distanceKm:true,rpe:true,feedbackStatus:true,feedbackAt:true,matchedPlanId:true} as const;

/** Provider rows stay immutable. Grouping changes only how evidence is counted. */
export interface ActivityEvidenceRow {
  id?: string; userId?: string; date: Date | string; sport?: string; actualSport?: string | null;
  source?: string | null; externalId?: string | null; planned?: boolean; completed?: boolean;
  notes?: string | null; originalSource?: string | null;
  durationMin?: number | null; actualDurationMin?: number | null; distanceKm?: number | null;
  rpe?: number | null; feedbackStatus?: string | null; feedbackAt?: Date | string | null;
  matchedPlanId?: string | null;
}
export interface ActivityDecision {
  version: 1; kind: "same_session" | "different_sessions" | "review_again"; userId: string;
  primaryId: string | null; members: { id: string; fingerprint: string }[];
  recordedAt?: string;
}
const time = (row: ActivityEvidenceRow) => new Date(row.date).getTime();
const sport = (row: ActivityEvidenceRow) => row.actualSport || row.sport;
export function activityActualMinutes(row: ActivityEvidenceRow): number | null {
  const n = row.actualDurationMin ?? (row.completed && row.planned === false ? row.durationMin : null);
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1440 ? n : null;
}
export function activityFingerprint(row: ActivityEvidenceRow): string {
  return createHash("sha256").update(JSON.stringify([row.id,row.userId,time(row),sport(row),row.source,row.externalId,row.planned,row.completed,
    row.durationMin,row.actualDurationMin,row.distanceKm,row.rpe,row.feedbackStatus,row.feedbackAt ? new Date(row.feedbackAt).toISOString() : null,row.matchedPlanId])).digest("hex");
}
/** Audit readers return newest first; supersede only the exact reviewed member set. */
export function currentActivityDecisions(decisions:readonly ActivityDecision[]) {
  const seen=new Set<string>();
  return decisions.filter(d=>{const key=JSON.stringify(d.members.map(m=>m.id).sort());if(seen.has(key))return false;seen.add(key);return true;});
}
function reviewRevision(rows:readonly ActivityEvidenceRow[],decisions:readonly ActivityDecision[]) {
  const ids=new Set(rows.map(r=>r.id));
  return createHash("sha256").update(JSON.stringify([
    rows.map(r=>[r.id,activityFingerprint(r)]).sort(),
    decisions.filter(d=>d.members.some(m=>ids.has(m.id))).map(d=>[d.kind,d.primaryId,d.recordedAt??null,d.members]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
  ])).digest("hex");
}
function nearCopies(a:ActivityEvidenceRow,b:ActivityEvidenceRow) {
  return !!a.id && !!b.id && !!a.userId && a.userId===b.userId && !!sport(a) && sport(a)===sport(b)
    && a.planned===false && b.planned===false && a.completed===true && b.completed===true
    && !!a.source && !!b.source && a.source!==b.source && ![a.source,b.source].includes("manual")
    && Number.isFinite(time(a)) && Number.isFinite(time(b)) && Math.abs(time(a)-time(b))<=60_000;
}
function corroborated(a:ActivityEvidenceRow,b:ActivityEvidenceRow) {
  const x=activityActualMinutes(a),y=activityActualMinutes(b);
  return nearCopies(a,b) && !(typeof a.rpe==="number"&&Number.isFinite(a.rpe)&&typeof b.rpe==="number"&&Number.isFinite(b.rpe)&&a.rpe!==b.rpe) && x!==null && y!==null && x>0 && y>0 && Math.abs(x-y)<=1
    && typeof a.distanceKm==="number" && Number.isFinite(a.distanceKm) && a.distanceKm>0
    && typeof b.distanceKm==="number" && Number.isFinite(b.distanceKm) && b.distanceKm>0
    && Math.abs(a.distanceKm-b.distanceKm)<=Math.max(.05,Math.min(a.distanceKm,b.distanceKm)*.01)
    && Math.abs(time(a)+x*60_000-time(b)-y*60_000)<=120_000;
}
export function groupActivityEvidence<T extends ActivityEvidenceRow>(input: readonly T[], decisions: readonly ActivityDecision[] = []) {
  const rows=[...input],parents=rows.map((_,i)=>i),byId=new Map(rows.flatMap((r,i)=>r.id?[[r.id,i] as const]:[])),indicesByRoot=new Map(rows.map((_,i)=>[i,[i]]));
  const root=(i:number):number=>parents[i]===i?i:parents[i]=root(parents[i]);
  const union=(a:number,b:number)=>{const left=root(a),right=root(b);if(left===right)return;parents[right]=left;indicesByRoot.set(left,[...indicesByRoot.get(left)!,...indicesByRoot.get(right)!]);indicesByRoot.delete(right);};
  const different=new Set<string>(),staleReviewed=new Set<string>(),reopened=new Set<string>(),appliedSame:ActivityDecision[]=[];
  const pair=(a:number,b:number)=>[a,b].sort((x,y)=>x-y).join(":");
  const currentDecisions=currentActivityDecisions(decisions);
  const validDecisions=currentDecisions.filter(d=>d.version===1 && d.members.length>=2 && d.members.every(m=>{
    const index=byId.get(m.id);return index!==undefined && rows[index].userId===d.userId && activityFingerprint(rows[index])===m.fingerprint;
  }));
  for(const d of currentDecisions.filter(d=>!validDecisions.includes(d)&&d.members.every(m=>byId.has(m.id)&&rows[byId.get(m.id)!].userId===d.userId))) for(const a of d.members) for(const b of d.members)staleReviewed.add(pair(byId.get(a.id)!,byId.get(b.id)!));
  for(const d of validDecisions) if(d.kind==="different_sessions") for(const a of d.members) for(const b of d.members) if(a.id!==b.id)different.add(pair(byId.get(a.id)!,byId.get(b.id)!));
  // New explicit choices supersede only the older reopened relationships they
  // actually resolve. Identity is transitive; reviewed differences propagate
  // through those identities, without overriding any explicit distinction.
  const reviewedParents=rows.map((_,i)=>i),reviewedMembers=new Map(rows.map((_,i)=>[i,[i]])),newerDifferences:[number,number][]=[];
  const reviewedRoot=(i:number):number=>reviewedParents[i]===i?i:reviewedParents[i]=reviewedRoot(reviewedParents[i]);
  let graphVersion=0,separationVersion=-1,separatedRoots=new Set<string>();
  for(const d of validDecisions){
    const indices=d.members.map(m=>byId.get(m.id)!);
    if(d.kind==="same_session"){
      const involved=[...new Set(indices.flatMap(i=>reviewedMembers.get(reviewedRoot(i))!))];
      if(d.primaryId&&d.members.some(m=>m.id===d.primaryId)&&involved.every(i=>sport(rows[i])===sport(rows[indices[0]]))&&!involved.some(a=>involved.some(b=>different.has(pair(a,b))||reopened.has(pair(a,b))))){
        const first=reviewedRoot(indices[0]);for(const index of indices){const other=reviewedRoot(index);if(other!==first){reviewedParents[other]=first;reviewedMembers.set(first,[...reviewedMembers.get(first)!,...reviewedMembers.get(other)!]);reviewedMembers.delete(other);}}graphVersion++;
      }
    }else if(d.kind==="different_sessions"){
      for(const a of indices)for(const b of indices)if(a<b)newerDifferences.push([a,b]);graphVersion++;
    }else{
      if(separationVersion!==graphVersion){separatedRoots=new Set(newerDifferences.map(([a,b])=>pair(reviewedRoot(a),reviewedRoot(b))));separationVersion=graphVersion;}
      for(const a of indices)for(const b of indices)if(a<b&&reviewedRoot(a)!==reviewedRoot(b)&&!separatedRoots.has(pair(reviewedRoot(a),reviewedRoot(b))))reopened.add(pair(a,b));
    }
  }
  const matchedTargets=new Map<string,number>();
  for(const [i,row] of rows.entries()) {
    const j=row.matchedPlanId?byId.get(row.matchedPlanId):undefined;
    if(j!==undefined && row.userId===rows[j].userId && (!sport(row)||!sport(rows[j])||sport(row)===sport(rows[j]))) union(i,j);
    if(row.matchedPlanId){const key=JSON.stringify([row.userId,sport(row),row.matchedPlanId]),other=matchedTargets.get(key);if(other!==undefined)union(i,other);else matchedTargets.set(key,i);}
  }
  for(const d of validDecisions) if(d.kind==="same_session" && d.primaryId && d.members.some(m=>m.id===d.primaryId)) {
    const first=byId.get(d.members[0].id)!;
    const selectedIndices=[...new Set(d.members.flatMap(m=>indicesByRoot.get(root(byId.get(m.id)!))!))];
    if(selectedIndices.every(i=>sport(rows[i])===sport(rows[first]))&&!selectedIndices.some(a=>selectedIndices.some(b=>different.has(pair(a,b))||reopened.has(pair(a,b))))){for(const m of d.members)union(first,byId.get(m.id)!);appliedSame.push(d);}
  }
  const order=rows.map((_,i)=>i).sort((a,b)=>time(rows[a])-time(rows[b])||String(rows[a].id).localeCompare(String(rows[b].id)));
  for(let x=0;x<order.length;x++) for(let y=x+1;y<order.length;y++) {
    const a=order[x],b=order[y];if(time(rows[b])-time(rows[a])>60_000)break;
    if(root(a)===root(b)||different.has(pair(a,b))||reopened.has(pair(a,b))||staleReviewed.has(pair(a,b))||!corroborated(rows[a],rows[b]))continue;
    const left=indicesByRoot.get(root(a))!,right=indicesByRoot.get(root(b))!;
    // Full corroboration, not transitive chains, and never override a reviewed difference.
    if(left.every(i=>right.every(j=>!different.has(pair(i,j))&&!reopened.has(pair(i,j))&&!staleReviewed.has(pair(i,j))&&corroborated(rows[i],rows[j]))))union(a,b);
  }
  const pendingPairs:[number,number][]=[];
  for(const entry of reopened){const [a,b]=entry.split(":").map(Number);pendingPairs.push([a,b]);}
  for(let x=0;x<order.length;x++) for(let y=x+1;y<order.length;y++) {
    const a=order[x],b=order[y];if(time(rows[b])-time(rows[a])>60_000)break;
    const explicitlySeparate=indicesByRoot.get(root(a))!.some(i=>indicesByRoot.get(root(b))!.some(j=>different.has(pair(i,j))));
    if(root(a)!==root(b)&&!explicitlySeparate&&nearCopies(rows[a],rows[b]))pendingPairs.push([a,b]);
  }
  const unresolvedIds=new Set(pendingPairs.flat());
  const groupMap=new Map<number,number[]>();for(const i of order){const key=root(i);groupMap.set(key,[...(groupMap.get(key)||[]),i]);}
  const groups=[...groupMap.values()].map(indices=>{
    const members=indices.map(i=>rows[i]);
    // Audit input is newest first: the newest applicable explicit primary wins
    // even when older overlapping identity choices join the resulting group.
    const confirmed=appliedSame.find(d=>d.members.every(m=>members.some(r=>r.id===m.id)))?.primaryId;
    const primary=members.find(r=>r.id===confirmed) || [...members].sort((a,b)=>Number(!!a.matchedPlanId)-Number(!!b.matchedPlanId)
      || Number(typeof b.rpe==="number")-Number(typeof a.rpe==="number") || String(a.id).localeCompare(String(b.id)))[0];
    const known=members.map(activityActualMinutes).filter((n):n is number=>n!==null);
    return {primary,members,selection:confirmed?"athlete_confirmed" as const:members.length>1?"corroborated_or_linked" as const:"single" as const,
      budgetMinutes:confirmed?activityActualMinutes(primary):known.length?Math.max(...known):null,
      unresolved:indices.some(i=>unresolvedIds.has(i))};
  });
  // Candidate components are display/review requests, never automatic identity assertions.
  const candidateParents=rows.map((_,i)=>i);const candidateRoot=(i:number):number=>candidateParents[i]===i?i:candidateParents[i]=candidateRoot(candidateParents[i]);
  for(const [a,b] of pendingPairs)candidateParents[candidateRoot(b)]=candidateRoot(a);
  const candidates=new Map<number,number[]>();for(const i of unresolvedIds){const key=candidateRoot(i);candidates.set(key,[...(candidates.get(key)||[]),i]);}
  return {groups,effective:groups.map(g=>g.primary),appliedDecisions:validDecisions,pending:[...candidates.values()].map(indices=>indices.map(i=>rows[i])),rawRecords:rows.length,
    groupedCopies:rows.length-groups.length,unresolvedGroups:candidates.size};
}
export function publicActivityReconciliation<T extends ActivityEvidenceRow>(rows:readonly T[],decisions:readonly ActivityDecision[]=[]) {
  const grouped=groupActivityEvidence(rows,decisions);
  const describe=(row:T)=>({id:row.id!,sport:sport(row)||"unknown",source:row.source||"unknown",startedAt:new Date(row.date).toISOString(),minutes:activityActualMinutes(row),distanceKm:row.distanceKm??null,reportedRpe:typeof row.rpe==="number"&&Number.isFinite(row.rpe)&&row.rpe>=0&&row.rpe<=10?row.rpe:null});
  return {rawRecords:grouped.rawRecords,effectiveSessions:grouped.groups.length,groupedCopies:grouped.groupedCopies,unresolvedGroups:grouped.unresolvedGroups,
    pending:grouped.pending.map(members=>({records:members.map(describe),revision:reviewRevision(members,grouped.appliedDecisions)})),
    reviewedDecisions:grouped.appliedDecisions.filter(d=>d.kind!=="review_again").map(d=>{const members=d.members.map(m=>rows.find(r=>r.id===m.id)!);return {kind:d.kind,primaryId:d.primaryId,records:members.map(describe),revision:reviewRevision(members,grouped.appliedDecisions)};}),
    decisions:grouped.groups.filter(g=>g.members.length>1).map(g=>({selection:g.selection,primaryId:g.primary.id,records:g.members.map(describe)})),
    note:"Provider observations remain unchanged. Only corroborated copies, existing plan links or your current explicit decision count once. Unresolved possible copies keep conservative budgets and unknown load coverage; no training capacity is inferred."};
}
