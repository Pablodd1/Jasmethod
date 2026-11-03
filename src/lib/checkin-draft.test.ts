import test from "node:test";
import assert from "node:assert/strict";
import {emptyCheckinAnswers,hydrateCheckinDraft,restoreCheckinDraft,savedCheckinAnswers,checkinDraftKey,requiresManualCheckinReview} from "./checkin-draft";
import {clearOnboardingDrafts} from "./onboarding-form";

test("restored recovery drafts retain manual mode while optional weight and time do not repeat the questionnaire",()=>{
  for (const [key,value] of [["sick",true],["sick",false],["sleep",1],["mood",2],["sessionFelt","harder"],["hrv",30]] as const) {
    const draft={version:1,userId:"a",dateLocal:"2026-11-02",savedBasis:null,answers:{...emptyCheckinAnswers(),[key]:value},dirty:[key],correctImported:false};
    const restored=restoreCheckinDraft(JSON.stringify(draft),"a","2026-11-02",null)!;
    assert.equal(requiresManualCheckinReview(restored.answers,restored.dirty,restored.correctImported),true);
  }
  assert.equal(requiresManualCheckinReview({...emptyCheckinAnswers(),weightKg:71,availableMinutes:30},["weightKg","availableMinutes"],false),false);
  assert.equal(requiresManualCheckinReview(emptyCheckinAnswers(),[],true),true);
  assert.equal(requiresManualCheckinReview({...emptyCheckinAnswers(),voiceReviewConfirmed:true},["voiceReviewConfirmed"],false),true);
});

test("sync hydration preserves edited symptoms, cleared fields and real zero without inventing saved answers",()=>{
  const saved=savedCheckinAnswers(JSON.stringify({sleep:5,sick:false,availableMin:60,rhr:52,inputMetadata:{rhrSource:"garmin"}}));
  const current={...emptyCheckinAnswers(),sleep:"",sick:true,availableMinutes:0};
  const refreshed=hydrateCheckinDraft(saved,current,["sleep","sick","availableMinutes"]);
  assert.equal(refreshed.sleep,"");assert.equal(refreshed.sick,true);assert.equal(refreshed.availableMinutes,0);
  assert.equal(refreshed.rhr,"");assert.equal(refreshed.newPain,"");assert.equal(Object.hasOwn(refreshed,"inputMetadata"),false);
  const sdnn=savedCheckinAnswers(JSON.stringify({hrv:40,inputMetadata:{hrvSource:"athlete-reported",hrvType:"sdnn"}}));assert.equal(sdnn.hrv,"");
});

test("unfinished check-in draft resumes only for its athlete, local day and unchanged saved answers",()=>{
  const draft={version:1,userId:"a",dateLocal:"2026-10-21",savedBasis:null,answers:{...emptyCheckinAnswers(),sick:true,availableMinutes:0},dirty:["sick","availableMinutes"],correctImported:true};
  const raw=JSON.stringify(draft),restored=restoreCheckinDraft(raw,"a","2026-10-21",null)!;
  assert.equal(restored.answers.sick,true);assert.equal(restored.answers.availableMinutes,0);assert.equal(restored.correctImported,true);
  assert.equal(restoreCheckinDraft(raw,"b","2026-10-21",null),null);assert.equal(restoreCheckinDraft(raw,"a","2026-10-22",null),null);
  assert.equal(restoreCheckinDraft(raw,"a","2026-10-21","new saved answers"),null);
  for(const invalid of ["{","null","[]",JSON.stringify({...draft,dirty:null})])assert.equal(restoreCheckinDraft(invalid,"a","2026-10-21",null),null);
  assert.notEqual(checkinDraftKey("a"),checkinDraftKey("b"));
});

test("confirmed sign-out clears sensitive check-in drafts alongside onboarding without removing unrelated tab state",()=>{
  const values=new Map([[checkinDraftKey("a"),"private"],["jmm_setup_draft_v1_b","private"],["other","keep"]]);
  clearOnboardingDrafts({get length(){return values.size;},key:index=>[...values.keys()][index]??null,removeItem:key=>{values.delete(key);}});
  assert.deepEqual([...values.keys()],["other"]);
});
