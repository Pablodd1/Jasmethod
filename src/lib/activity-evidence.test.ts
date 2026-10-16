import test from "node:test";
import assert from "node:assert/strict";
import {ACTIVITY_EVIDENCE_SELECT,activityFingerprint,groupActivityEvidence,publicActivityReconciliation,type ActivityDecision,type ActivityEvidenceRow} from "./activity-evidence";
import {computeJMetrics} from "./j-metrics";
import {cycleActivityEvidence} from "./training-cycle";
const now=new Date("2026-10-16T20:00Z");
const row=(id:string,source="garmin",extra:Partial<ActivityEvidenceRow>={})=>({id,userId:"owner",sport:"bike",source,externalId:`${source}:${id}`,date:new Date("2026-10-16T07:00Z"),planned:false,completed:true,durationMin:60,actualDurationMin:60,distanceKm:30,rpe:4,feedbackStatus:"completed",...extra});
const decision=(rows:ReturnType<typeof row>[],kind:ActivityDecision["kind"],primaryId:string|null):ActivityDecision=>({version:1,userId:"owner",kind,primaryId,members:rows.map(r=>({id:r.id,fingerprint:activityFingerprint(r)}))});
test("corroborated cross-provider copies count once, retain observations and never borrow a missing metric",()=>{
 const a=row("a"),b=row("b","strava",{date:new Date("2026-10-16T07:00:20Z"),actualDurationMin:60.5,durationMin:60.5,distanceKm:30.05,rpe:null});
 const before=JSON.stringify([a,b]);const grouped=groupActivityEvidence([a,b]);assert.equal(grouped.groups.length,1);assert.equal(grouped.groupedCopies,1);assert.equal(grouped.unresolvedGroups,0);assert.equal(grouped.groups[0].budgetMinutes,60.5);assert.equal(grouped.groups[0].primary.id,"a");assert.equal(grouped.groups[0].members.length,2);assert.equal(JSON.stringify([a,b]),before);
 const metrics=computeJMetrics([a,b] as any,now,"UTC",[],1);assert.equal(metrics.totalSessions,1);assert.equal(metrics.totalJStress,240);assert.equal(metrics.coveragePct,100);
 const missing=computeJMetrics([{...a,rpe:null},{...b,rpe:null}] as any,now,"UTC",[],1);assert.equal(missing.totalJStress,null);assert.equal(missing.coveragePct,0);
});
test("start alone and mismatched duration or distance never verify identity; ambiguity stays unknown with conservative budget",()=>{
 for(const extra of [{distanceKm:null},{actualDurationMin:35,durationMin:35},{distanceKm:60}]){
  const rows=[row("a"),row("b","whoop",extra)],result=groupActivityEvidence(rows);assert.equal(result.groups.length,2);assert.equal(result.unresolvedGroups,1);
  assert.equal(result.groups.reduce((sum,g)=>sum+(g.budgetMinutes??0),0),extra.durationMin===35?95:120);
  const metrics=computeJMetrics(rows as any,now,"UTC",["2026-10-16"],1);assert.equal(metrics.totalJStress,null);assert.equal(metrics.coveragePct,0);assert.equal(metrics.series[0].jStress,null);assert.deepEqual(metrics.confirmedRestDays,[]);
  const cycle=cycleActivityEvidence(rows as any,"2026-10-16","UTC");assert.equal(cycle.reportedMinutes,null);assert.equal(cycle.recoveryReview,true);
 }
});
test("owner, actual sport, provider identity and separate times prevent accidental grouping",()=>{
 const a=row("a");for(const b of [row("b","strava",{userId:"other"}),row("b","strava",{sport:"run"}),row("b","garmin"),row("b","strava",{date:new Date("2026-10-16T07:01:01Z")}),row("b","manual"),row("b","strava",{planned:true})]){
  const result=groupActivityEvidence([a,b]);assert.equal(result.groups.length,2);assert.equal(result.unresolvedGroups,0);
 }
});
test("explicit same-session choice uses selected actual duration without max/average or copied RPE; separate decision retains both",()=>{
 const rows=[row("a"),row("b","whoop",{actualDurationMin:35,durationMin:35,rpe:3,distanceKm:null})];
 const same=decision(rows,"same_session","b"),result=groupActivityEvidence(rows,[same]);assert.equal(result.groups.length,1);assert.equal(result.groups[0].budgetMinutes,35);assert.equal(result.groups[0].primary.id,"b");assert.equal(result.unresolvedGroups,0);
 const metrics=computeJMetrics(rows as any,now,"UTC",[],1,[same]);assert.equal(metrics.totalJStress,105);assert.equal(metrics.totalSessions,1);
 const different=decision(rows,"different_sessions",null),separate=groupActivityEvidence(rows,[different]);assert.equal(separate.groups.length,2);assert.equal(separate.unresolvedGroups,0);assert.equal(computeJMetrics(rows as any,now,"UTC",[],1,[different]).totalJStress,345);
 const corrected=[rows[0],{...rows[1],actualDurationMin:36}];assert.equal(groupActivityEvidence(corrected,[same]).unresolvedGroups,1);
 const exact=[row("a"),row("b","strava")],reviewedDifferent=decision(exact,"different_sessions",null);assert.equal(groupActivityEvidence(exact,[reviewedDifferent]).groups.length,2);assert.equal(groupActivityEvidence([exact[0],{...exact[1],rpe:5}],[reviewedDifferent]).unresolvedGroups,1,"a corrected record cannot silently override an explicit prior distinction");
});
test("local-day boundaries count one source while protecting every performed date; linked plan copies preserve max safety budget",()=>{
 const rows=[row("a","garmin",{date:new Date("2026-10-16T03:59:45Z")}),row("b","strava",{date:new Date("2026-10-16T04:00:15Z")})];
 const metrics=computeJMetrics(rows as any,now,"America/New_York",[],2);assert.equal(metrics.totalSessions,1);assert.equal(metrics.totalJStress,240);
 const cycle=cycleActivityEvidence(rows as any,"2026-10-16","America/New_York");assert.deepEqual(cycle.protectedDays,["2026-10-15","2026-10-16"]);assert.equal(cycle.reportedMinutes,60);
 const linked=[row("a","garmin",{matchedPlanId:"missing",actualDurationMin:40}),row("b","strava",{matchedPlanId:"missing",actualDurationMin:60})];assert.equal(groupActivityEvidence(linked).groups[0].budgetMinutes,60);
 const summary=publicActivityReconciliation([row("a"),row("b","whoop",{distanceKm:null})]);assert.equal(summary.pending[0].records.length,2);assert.match(summary.pending[0].revision,/^[a-f0-9]{64}$/);
});

test("current reviewed distinctions survive overlapping identity decisions in either order",()=>{
 const a=row("a"),b=row("b","strava"),c=row("c","whoop",{distanceKm:null});
 const distinct=decision([a,b],"different_sessions",null),ac=decision([a,c],"same_session","a"),bc=decision([b,c],"same_session","b");
 for(const decisions of [[distinct,ac,bc],[bc,ac,distinct]]){
  const result=groupActivityEvidence([a,b,c],decisions);
  assert.equal(result.groups.length,2);
  assert.ok(!result.groups.some(g=>g.members.some(r=>r.id==="a")&&g.members.some(r=>r.id==="b")));
 }
});

test("complete projected fingerprint contract preserves dated actual-sport decisions in load and cycle readers",()=>{
 const rows=[row("a","garmin",{sport:"run",actualSport:"bike",feedbackAt:new Date("2026-10-16T08:02Z")}),row("b","whoop",{sport:"run",actualSport:"bike",feedbackAt:new Date("2026-10-16T08:03Z"),distanceKm:null,actualDurationMin:35,durationMin:35})];
 const chosen=decision(rows,"same_session","b");
 const projected=rows.map(r=>Object.fromEntries(Object.keys(ACTIVITY_EVIDENCE_SELECT).map(k=>[k,r[k as keyof typeof r]]))) as typeof rows;
 assert.deepEqual(projected.map(activityFingerprint),rows.map(activityFingerprint));
 assert.equal(computeJMetrics(projected as any,now,"UTC",[],1,[chosen]).totalJStress,140);
 assert.equal(cycleActivityEvidence(projected as any,"2026-10-16","UTC",[chosen]).reportedMinutes,35);
});

test("conflicting reported efforts never silently pick an easy automatic primary",()=>{
 const rows=[row("a","garmin",{rpe:2}),row("b","strava",{rpe:9})];
 const grouped=groupActivityEvidence(rows);assert.equal(grouped.groups.length,2);assert.equal(grouped.unresolvedGroups,1);
 assert.equal(computeJMetrics(rows as any,now,"UTC",[],1).totalJStress,null);
 assert.equal(cycleActivityEvidence(rows as any,"2026-10-16","UTC").recoveryReview,true);
});

test("explicit same and separate decisions can reopen without source edits, and corroboration cannot bypass the review",()=>{
 const rows=[row("a"),row("b","strava")],before=JSON.stringify(rows);
 for(const kind of ["same_session","different_sessions"] as const){
  const old={...decision(rows,kind,kind==="same_session"?"a":null),recordedAt:"2026-10-16T08:00Z"};
  const closed=publicActivityReconciliation(rows,[old]);assert.equal(closed.reviewedDecisions.length,1);assert.equal(closed.pending.length,0);
  const reopen:ActivityDecision={...old,kind:"review_again",primaryId:null,recordedAt:"2026-10-16T09:00Z"};
  const opened=groupActivityEvidence(rows,[reopen,old]);assert.equal(opened.groups.length,2);assert.equal(opened.unresolvedGroups,1);
  assert.equal(publicActivityReconciliation(rows,[reopen,old]).reviewedDecisions.length,0);
  assert.equal(computeJMetrics(rows as any,now,"UTC",[],1,[reopen,old]).totalJStress,null);
  assert.equal(cycleActivityEvidence(rows as any,"2026-10-16","UTC",[reopen,old]).reportedMinutes,null);
  const pending=publicActivityReconciliation(rows,[reopen,old]).pending[0];assert.notEqual(pending.revision,closed.reviewedDecisions[0].revision);
  const replacement={...decision(rows,"same_session","b"),recordedAt:"2026-10-16T10:00Z"};
  const fixed=groupActivityEvidence(rows,[replacement,reopen,old]);assert.equal(fixed.groups.length,1);assert.equal(fixed.unresolvedGroups,0);assert.equal(fixed.groups[0].primary.id,"b");
 }
 assert.equal(JSON.stringify(rows),before);
});

test("review exposes the conflicting reported RPE without inference or missing-to-zero conversion",()=>{
 const summary=publicActivityReconciliation([row("a","garmin",{rpe:3}),row("b","strava",{rpe:9})]);
 assert.deepEqual(summary.pending[0].records.map(r=>r.reportedRpe).sort(),[3,9]);
 assert.equal(publicActivityReconciliation([row("a","garmin",{rpe:null}),row("b","whoop",{distanceKm:null,rpe:0})]).pending[0].records.find(r=>r.id==="a")?.reportedRpe,null);
});

test("new subset choices resolve reopened pairs and newest explicit primary wins across overlapping identity choices",()=>{
 const rows=[row("a","garmin",{actualDurationMin:60,durationMin:60}),row("b","strava",{actualDurationMin:40,durationMin:40}),row("c","whoop",{actualDurationMin:20,durationMin:20,distanceKm:null})];
 const old=decision(rows,"same_session","a"),reopen={...decision(rows,"review_again",null),recordedAt:"2026-10-16T08:00Z"};
 const ab=decision(rows.slice(0,2),"same_session","b"),partial=groupActivityEvidence(rows,[ab,reopen,old]);
 assert.equal(partial.groupedCopies,1);assert.equal(partial.unresolvedGroups,1);assert.equal(partial.groups.find(g=>g.members.some(r=>r.id==="a"))?.primary.id,"b");
 const ac=decision([rows[0],rows[2]],"same_session","c"),resolved=groupActivityEvidence(rows,[ac,ab,reopen,old]);
 assert.equal(resolved.groups.length,1);assert.equal(resolved.unresolvedGroups,0);assert.equal(resolved.groups[0].primary.id,"c");assert.equal(resolved.groups[0].budgetMinutes,20);
 assert.equal(computeJMetrics(rows as any,now,"UTC",[],1,[ac,ab,reopen,old]).totalJStress,80);
 const newest=decision(rows.slice(1),"same_session","c"),older=decision(rows.slice(0,2),"same_session","a");
 const overlapping=groupActivityEvidence(rows,[newest,older]);assert.equal(overlapping.groups[0].primary.id,"c");assert.equal(overlapping.groups[0].budgetMinutes,20);
 const distinct=decision([rows[0],rows[2]],"different_sessions",null),separated=groupActivityEvidence(rows,[distinct,ab,reopen,old]);
 assert.equal(separated.groups.length,2);assert.equal(separated.unresolvedGroups,0);assert.equal(separated.groups.find(g=>g.members.some(r=>r.id==="a"))?.primary.id,"b");
});
