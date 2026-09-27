import {test} from "node:test";
import assert from "node:assert/strict";
import {saveReviewedProfile,onboardingProfileFields} from "./profile-client";
test("profile client sends reviewed revision via supported PUT", async()=>{
 let observed:RequestInit|undefined;
 const request:typeof fetch=async(_url,init)=>{observed=init;return Response.json({ok:true,profile:{ftp:250},revision:"saved-v2"});};
 const result=await saveReviewedProfile({ftp:250},"reviewed-v1",request);
 assert.equal(observed?.method,"PUT");assert.deepEqual(JSON.parse(String(observed?.body)),{ftp:250,expectedRevision:"reviewed-v1"});assert.equal(result.profile.ftp,250);assert.equal(result.revision,"saved-v2");
});
test("profile client conflict rejects without reloading revision or resubmitting stale values", async()=>{
 let requests=0;
 const request:typeof fetch=async()=>{requests++;return Response.json({error:"conflict"},{status:409});};
 await assert.rejects(()=>saveReviewedProfile({ftp:250},"stale",request),/Nothing was resubmitted/);
 assert.equal(requests,1);
});
test("profile client refuses an unreviewed save without a network request",async()=>{
 let requests=0;const request:typeof fetch=async()=>{requests++;return Response.json({ok:true});};
 await assert.rejects(()=>saveReviewedProfile({ftp:250},null,request),/Reload/);assert.equal(requests,0);
});
test("profile client surfaces server validation failure rather than success",async()=>{
 const request:typeof fetch=async()=>Response.json({error:"Invalid threshold"},{status:400});
 await assert.rejects(()=>saveReviewedProfile({lthr:999},"v1",request),/Invalid threshold/);
});

test("onboarding blank optional values become null without altering required values",()=>{
 assert.deepEqual(onboardingProfileFields({sex:"",birthYear:"",heightCm:"",weightKg:"",weeklyHours:"6",experience:"beginner",goal:"run-only"}),
 {sex:null,birthYear:null,heightCm:null,weightKg:null,weeklyHours:"6",experience:"beginner",goal:"run-only"});
 assert.equal(onboardingProfileFields({sex:"female",weightKg:"65",weeklyHours:""}).weeklyHours, "");
});
