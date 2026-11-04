import assert from "node:assert/strict";
import test from "node:test";
import { profileReferenceQuery, profileReferenceFollowup, profileReferenceSportReply, protectedProfileAnswer, isProtectedProfileAnswer } from "./coach-profile-reference";
const now=new Date("2026-11-04T12:00Z"),options={sourceMessageId:"source-message",language:"en",timezone:"UTC",now};
const make=(message:string,profile:Record<string,unknown>|null={})=>protectedProfileAnswer(profileReferenceQuery(message)!,profile,options);

test("profile reference reads understand direct bilingual personal questions, without converting writes or definitions into record reads",()=>{
  for(const message of ["What is my maximum HR?","What is my maxHr","¿Cuál es mi frecuencia cardíaca máxima?","Show my running threshold pace","What is my cycling FTP?","¿Cuál es mi CSS de natación?","What are my resting HR and LTHR?"])assert.ok(profileReferenceQuery(message),message);
  assert.deepEqual(profileReferenceQuery("What are my running and cycling max HR?"),{fields:["maxHr"],sports:["run","bike"],ambiguousPace:false});
  for(const message of ["What is maximum HR?","My FTP is 250 W","Update my max HR to 190","What was my highest recorded HR during my last workout?","Define RPE","What does FTP mean?"])assert.equal(profileReferenceQuery(message),null,message);
});

test("unscoped legacy HR remains saved, undated and unverified; missing HR never becomes an age estimate",()=>{
  const profile={maxHr:187,lthr:166,birthYear:1981,updatedAt:"2026-11-04",units:"metric"},before=JSON.stringify(profile);
  const card=make("What is my maximum HR?",profile);
  assert.equal(card.fields[0].value,187);assert.equal(card.fields[0].display,"187 bpm");assert.equal(card.fields[0].sport,"unscoped");assert.equal(card.fields[0].source,"saved_profile");assert.equal(card.fields[0].observedAt,null);assert.match(card.answer,/does not establish.*physiological/);assert.match(card.clarification!,/sport-specific/);assert.equal(isProtectedProfileAnswer(card),true);
  assert.equal(make("What is my maximum HR?",{birthYear:1981}).fields[0].value,null);
  assert.equal(make("What is my maximum HR?",{maxHr:NaN}).fields[0].display,"—");assert.equal(JSON.stringify(profile),before);
});

test("sport HR reads exactly the named current reported sport, never a legacy value or another sport",()=>{
  const manualPrs=JSON.stringify([{label:"JMM manual run maxHr reference",value:186,unit:"bpm",date:"2026-11-03"},{label:"JMM manual bike lthr reference",value:159,unit:"bpm",date:"2026-11-02"}]);
  const run=make("What is my running max HR?",{manualPrs,maxHr:191});
  assert.deepEqual([run.fields[0].sport,run.fields[0].value,run.fields[0].source,run.fields[0].observedAt],["run",186,"athlete_reported_reference","2026-11-03"]);assert.equal(isProtectedProfileAnswer(run),true);
  const bike=make("What is my cycling max HR?",{manualPrs,maxHr:191});assert.equal(bike.fields[0].value,null);assert.equal(bike.fields[0].sport,"bike");assert.equal(bike.fields[0].observedAt,null);assert.equal(isProtectedProfileAnswer(bike),true);
  const threshold=make("What is my bike LTHR?",{manualPrs,lthr:170});assert.equal(threshold.fields[0].value,159);
  const stale=make("What is my running max HR?",{manualPrs:manualPrs.replace("2026-11-03","2025-11-03"),maxHr:191});assert.equal(stale.fields[0].value,null);
});

test("pace and power displays use saved values and athlete units, with matching dated reports only",()=>{
  const en=make("What are my running pace and FTP?",{units:"auto",runPaceBase:300,ftp:250,manualPrs:JSON.stringify([{label:"JMM manual FTP reference",value:250,unit:"W",date:"2026-10-01"}])});
  assert.match(en.fields.find(row=>row.field==="runPaceBase")!.display,/8:03\/mi.*mph/);assert.equal(en.fields.find(row=>row.field==="ftp")!.observedAt,"2026-10-01");assert.equal(en.displayUnits,"imperial");assert.equal(isProtectedProfileAnswer(en),true);
  const es=protectedProfileAnswer(profileReferenceQuery("¿Cuál es mi ritmo de natación?")!,{units:"auto",swimPaceBase:100},{...options,language:"es"});assert.match(es.fields[0].display,/1:40\/100 m.*km\/h/);assert.equal(es.displayUnits,"metric");assert.equal(isProtectedProfileAnswer(es),true);
  assert.match(make("What is my pace?",{runPaceBase:300,swimPaceBase:100}).clarification!,/running pace or swimming pace/);
  assert.equal(make("What is my FTP?",{ftp:250,manualPrs:JSON.stringify([{label:"JMM manual FTP reference",value:251,unit:"W",date:"2026-10-01"}])}).fields[0].observedAt,null);
});

test("local clarification continuity accepts only fixed field and sport labels from current policy metadata",()=>{
  const query=profileReferenceQuery("What is my maximum HR?")!,row={source:"local",metadata:JSON.stringify({historyPolicy:"openai-generic-education-v3",ruleId:"coach-conversation-v1:profile-reference-review",protectedProfileQuery:query,localContextSummary:"PROTECTED_CANARY_77316"})};
  assert.equal(profileReferenceSportReply("para natación"),"swim");assert.equal(profileReferenceSportReply("running 190 bpm"),null);
  assert.deepEqual(profileReferenceFollowup("running",row),{...query,sports:["run"]});
  assert.equal(profileReferenceFollowup("running",{...row,source:"openai"}),null);assert.equal(profileReferenceFollowup("running",{...row,metadata:row.metadata.replace("openai-generic-education-v3","legacy")}),null);
  assert.equal(profileReferenceFollowup("running",{...row,metadata:JSON.stringify({historyPolicy:"openai-generic-education-v3",ruleId:"coach-conversation-v1:profile-reference-review",protectedProfileQuery:{...query,value:190}})}),null);
  assert.doesNotMatch(JSON.stringify(profileReferenceFollowup("running",row)),/PROTECTED_CANARY|77316/);
});

test("runtime protected-result validation rejects wrong values, dimensions, provenance, unknown fields and invented sport assignment",()=>{
  const card=make("What is my maximum HR?",{maxHr:187});
  for(const patch of [{privacy:"external"},{sourceMessageId:"other?token=x"},{displayUnits:"auto"},{fields:[]},{fields:[null]},{fields:[card.fields[0],card.fields[0]]},{unexpected:"not allowed"}])assert.equal(isProtectedProfileAnswer({...card,...patch}),false);
  for(const patch of [{value:NaN},{value:999},{value:"187"},{field:"birthYear"},{unit:"W"},{display:"188 bpm"},{source:"device"},{observedAt:"2026-02-30"},{provenance:"measured"},{sport:"run"},{source:"athlete_reported_reference",provenance:"athlete_reported",observedAt:"2026-11-03"}])assert.equal(isProtectedProfileAnswer({...card,fields:[{...card.fields[0],...patch}]}),false,JSON.stringify(patch));
});
