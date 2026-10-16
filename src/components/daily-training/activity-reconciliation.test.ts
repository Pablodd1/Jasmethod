import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {ActivityReconciliationReview} from "../ActivityReconciliationReview";
import {activityFingerprint,publicActivityReconciliation} from "../../lib/activity-evidence";

test("activity review exposes provenance without preselecting identity or confirmation",()=>{
 const rows=[{id:"a",userId:"owner",date:new Date("2026-10-16T07:00Z"),source:"garmin",sport:"bike",planned:false,completed:true,durationMin:30,distanceKm:null},{id:"b",userId:"owner",date:new Date("2026-10-16T07:00:20Z"),source:"whoop",sport:"bike",planned:false,completed:true,durationMin:20,distanceKm:null}];
 const html=renderToStaticMarkup(React.createElement(ActivityReconciliationReview,{initial:publicActivityReconciliation(rows)}));
 assert.match(html,/garmin/);assert.match(html,/whoop/);assert.match(html,/30 min/);assert.match(html,/20 min/);
 assert.match(html,/<option value="" selected="">Choose after reviewing/);
 assert.doesNotMatch(html,/checked=""/);assert.match(html,/<button[^>]*disabled=""[^>]*>Save this decision/);
 assert.match(html,/records are preserved/);assert.doesNotMatch(html,/Choose the actual record to count/);
});

test("only a current explicit decision offers an unchecked reopening action, and conflicting RPE is visible",()=>{
 const rows=[{id:"a",userId:"owner",date:new Date("2026-10-16T07:00Z"),source:"garmin",sport:"bike",planned:false,completed:true,durationMin:30,distanceKm:15,rpe:3},{id:"b",userId:"owner",date:new Date("2026-10-16T07:00:20Z"),source:"whoop",sport:"bike",planned:false,completed:true,durationMin:30,distanceKm:15,rpe:9}];
 const pending=renderToStaticMarkup(React.createElement(ActivityReconciliationReview,{initial:publicActivityReconciliation(rows)}));assert.match(pending,/RPE 3\/10/);assert.match(pending,/RPE 9\/10/);assert.doesNotMatch(pending,/Reopen review/);
 const decision={version:1 as const,userId:"owner",kind:"different_sessions" as const,primaryId:null,members:rows.map(r=>({id:r.id,fingerprint:activityFingerprint(r)}))};
 const reviewed=renderToStaticMarkup(React.createElement(ActivityReconciliationReview,{initial:publicActivityReconciliation(rows,[decision])}));
 assert.match(reviewed,/Your current decision/);assert.match(reviewed,/Separate sessions/);assert.match(reviewed,/<button[^>]*disabled=""[^>]*>Reopen review/);assert.doesNotMatch(reviewed,/checked=""/);
 const automatic=renderToStaticMarkup(React.createElement(ActivityReconciliationReview,{initial:publicActivityReconciliation([rows[0],{...rows[1],rpe:3}])}));assert.doesNotMatch(automatic,/Reopen review/);
});
