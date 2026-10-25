/** Real HTTP + PostgreSQL acceptance. Synthetic athletes only; exact loopback guard. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { PrismaClient, type User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Decoder, Stream } from "@garmin/fitsdk";
import { hashToken } from "../src/lib/auth";
import { dayBounds, addDaysKey, localDate } from "../src/lib/dates";
import { isTodayTrainingResponse, isSavedPlanResponse, isTrainingProfileResponse } from "../src/components/daily-training/training-read";

for (const key of ["DATABASE_URL", "DIRECT_URL"]) {
  const url = new URL(process.env[key] || "");
  assert.equal(url.protocol, "postgresql:"); assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "55432"); assert.equal(url.pathname, "/jmm_launch_integration_test"); assert.equal(url.search, "");
}
assert.notEqual(process.env.VERCEL_ENV, "production");
const base = new URL(process.env.JMM_INTEGRATION_BASE || "http://127.0.0.1:3220");
assert.equal(base.origin, "http://127.0.0.1:3220"); assert.equal(base.pathname, "/");
const db = new PrismaClient(), created: string[] = [], results: Array<{name:string; status:"PASS"|"FAIL"; detail?:string}> = [];
const dir = ".local/jmm-conversation-integration"; mkdirSync(dir, {recursive:true});
const { start: day, key: today } = dayBounds("UTC");
const yesterday = addDaysKey(today, -1);
type Actor = User & { cookie:string };
const validAnswers = {sleep:4,soreness:2,motivation:4,energy:4,stress:2,sick:false,newPain:false,urgentSymptoms:false,availableMinutes:60};
async function request(path:string, actor?:Actor, options:{method?:string;body?:unknown;status?:number}={}) {
  const response = await fetch(new URL(path, base), {method:options.method || (options.body === undefined ? "GET" : "POST"),headers:{"Content-Type":"application/json", ...(actor ? {cookie:actor.cookie} : {})}, ...(options.body === undefined ? {} : {body:JSON.stringify(options.body)}),redirect:"manual",signal:AbortSignal.timeout(120000)});
  if (options.status !== undefined) assert.equal(response.status, options.status, `${path}: ${response.status}: ${response.status === options.status ? "" : (await response.clone().text()).slice(0,500)}`);
  return response;
}
async function json(path:string, actor?:Actor, options:Parameters<typeof request>[2]={}) {return (await request(path,actor,{status:200,...options})).json();}
async function scenario(name:string, task:()=>Promise<void>) {try {await task();results.push({name,status:"PASS"});console.log(`PASS ${name}`);} catch(e) {const detail=e instanceof Error?e.message:String(e);results.push({name,status:"FAIL",detail});console.error(`FAIL ${name}: ${detail}`);}}
async function actor(label:string, language="en", minimal=false):Promise<Actor> {
  const user=await db.user.create({data:{email:`coach-${label}-${randomUUID()}@example.invalid`,name:`Synthetic conversational ${label}`,passwordHash:bcrypt.hashSync(randomBytes(24).toString("base64url"),10),role:"athlete",timezone:"UTC",language,onboarded:!minimal,
    profile:{create:{goal:"run-only",experience:"amateur",weeklyHours:3,birthYear:1990,weightKg:70}},reminder:{create:{emailEnabled:false,telegramEnabled:false}}}});
  created.push(user.id);const token=randomBytes(32).toString("hex");await db.authSession.create({data:{userId:user.id,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+3600000)}});
  const a={...user,cookie:`jmm_session=${token}`};
  if (!minimal) await reviewPlanningSetup(a);
  return a;
}
async function reviewPlanningSetup(a:Actor) {
  const p=await json("/api/profile",a);
  await json("/api/profile",a,{method:"PUT",body:{expectedRevision:p.revision,expectedSetupRevision:p.setupRevision??null,experience:"amateur",weeklyHours:3,setup:{adultConfirmed:true,profileConfirmed:true,goalDescription:"Run comfortably for general fitness",baselineWeeklyMinutes:120,baselineObservedAt:today,interruptions:"none",restrictions:"none",qualifiedReview:"none_needed",trainingDays:[0,1,2,3,4,5,6],maxSessionMinutes:60,equipmentAccess:"Shoes and outdoor path",planWeeks:4}}});
}
async function fixture(a:Actor, offset=0, historic=false) {
  const date=localDate(addDaysKey(today,offset),"UTC");
  return db.workout.create({data:{userId:a.id,date,sport:"run",title:historic?"Recorded historic run":"Reviewed easy run",type:"endurance",durationMin:30,intensity:"z2",planned:true,approved:true,source:"manual",completed:historic,
    ...(historic?{feedbackStatus:"completed",actualDurationMin:28,rpe:3,feedbackAt:new Date()}:{}),
    prescription:JSON.stringify({title:"Reviewed easy run",sport:"run",durationMin:30,intensity:"z2",type:"endurance",verdict:"full",steps:[{name:"Easy warm-up",seconds:300,zone:"z1",phase:"warmup",target:{type:"open"}},{name:"Controlled running",seconds:1200,zone:"z2",phase:"active",target:{type:"open"}},{name:"Easy finish",seconds:300,zone:"z1",phase:"cooldown",target:{type:"open"}}]})}});
}
async function ask(a:Actor,message:string,extra:Record<string,unknown>={}) {return json("/api/assistant",a,{body:{message,source:"text",externalConsent:false,clientRequestId:randomUUID(),...extra}});}
function pending(result:any) {assert.ok(result.proposal?.id,"Expected a reviewable saved proposal");assert.ok(result.proposal.candidates?.length,"Expected explicit candidates");return result.proposal;}
function confirmBody(p:any,candidates=p.candidates) {return {proposalId:p.id,expectedRevision:p.revision,candidates,idempotencyKey:randomUUID(),confirmed:true};}
async function main() {
  await scenario("AI privacy consent and source refusals make no message writes; legacy summaries are withheld",async()=>{
    const a=await actor("privacy-consent");
    await request("/api/nutrition/photo",undefined,{body:{},status:401});
    for(const body of [{},{photoConsent:false},{photoConsent:"true",photoProviderConsent:"google_gemini"},{photoConsent:true,photoProviderConsent:"openai"},{photoConsent:true,photoProviderConsent:"google_gemini",photoSource:"device"}])await request("/api/nutrition/photo",a,{body,status:403});
    const before=await db.coachConversationMessage.count({where:{userId:a.id}});
    for(const imageSource of [undefined,"device","imported","unknown","forged"])await request("/api/assistant",a,{body:{message:"Review image",image:{mimeType:"image/png",dataBase64:"AAAA"},imageSource,imageConsent:true,imageProviderConsent:"openai",clientRequestId:randomUUID()},status:400});
    assert.equal(await db.coachConversationMessage.count({where:{userId:a.id}}),before);
    const chat=await ask(a,"What is RPE?");
    await db.coachConversationMessage.create({data:{userId:a.id,conversationId:chat.conversation.id,role:"assistant",source:"deepseek",content:"IMPORTED_CANARY_887766",metadata:JSON.stringify({contextVersion:"deepseek-personal-v1",localContextSummary:"DERIVED_CANARY_112233"})}});
    const reloaded=await json("/api/assistant",a);assert.doesNotMatch(JSON.stringify(reloaded),/IMPORTED_CANARY|DERIVED_CANARY/);
    const review=await ask(a,"What was my last recorded workout?");assert.match(review.answer,/not retained in chat/);
    assert.doesNotMatch((await db.coachConversationMessage.findFirstOrThrow({where:{userId:a.id,role:"assistant"},orderBy:{createdAt:"desc"}})).content,/IMPORTED_CANARY|DERIVED_CANARY/);
  });

  await scenario("One athlete continues minimal onboarding, manual import, check-in, profile approval and coach-reviewed cycle through permitted FIT/ICS exports",async()=>{
    const a=await actor("continuous-journey","en",true),other=await actor("continuous-foreign"),coach=await actor("continuous-coach");
    const foreignBefore={profile:await db.athleteProfile.findUniqueOrThrow({where:{userId:other.id}}),workouts:await db.workout.findMany({where:{userId:other.id},orderBy:{id:"asc"}})};
    assert.equal((await json("/api/onboard",a)).onboarded,false);
    await json("/api/onboard",a,{body:{}});assert.equal((await json("/api/onboard",a)).onboarded,true);
    const saved=await json("/api/today?view=plan",a);assert.equal(saved.kind,"saved_today_plan");assert.equal(saved.readOnly,true);assert.ok(saved.sessions.length);
    assert.equal(await db.dailyCheckin.count({where:{userId:a.id}}),0,"Saved workout is visible before answering check-in");
    const starter=await db.workout.findFirstOrThrow({where:{userId:a.id,source:"starter",planned:true}});
    // Supported manual file ingestion, not a simulated OAuth grant or automatic provider import.
    const upload=async()=>{
      const form=new FormData();form.set("source","garmin");form.set("distanceUnits","metric");
      form.set("file",new File([`Activity Type,Date,Time,Title,Distance\nRunning,${yesterday} 07:30:00,00:30:00,Synthetic continuous activity,5`],"continuous.csv"));
      const response=await fetch(new URL("/api/import",base),{method:"POST",headers:{cookie:a.cookie},body:form,signal:AbortSignal.timeout(120000)});
      const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));return body;
    };
    assert.equal((await upload()).workoutsImported,1);assert.equal((await upload()).workoutsImported,0);
    const imported=await db.workout.findFirstOrThrow({where:{userId:a.id,planned:false,completed:true}});
    assert.equal(await db.workout.count({where:{userId:a.id,externalId:imported.externalId}}),1);
    const context=await json("/api/checkin",a),actual=context.inputContext.completedWorkouts.find((row:any)=>row.recordIds.includes(imported.id));
    assert.equal(actual.durationMinutes,30);assert.equal(actual.questions.durationMinutes,false);assert.equal(actual.questions.rpe,true);
    const report=context.previousSessions.find((row:any)=>row.id===imported.id);assert.ok(report?.feedbackRevision);
    await json("/api/plan",a,{method:"PUT",body:{sessionId:imported.id,expectedRevision:report.feedbackRevision,feedbackStatus:"completed",actualDurationMin:30,actualSport:"run",rpe:3}});
    await reviewPlanningSetup(a);await json("/api/checkin",a,{body:validAnswers});
    const first=await json(`/api/workout/card?id=${starter.id}`,a);assert.equal(first.session.verdict,"ready",JSON.stringify({stage:"starter after imported feedback and full current review",sessionId:starter.id,reason:first.session.reason}));
    await request(`/api/workout/approve?sessionId=${starter.id}&expectedRevision=${first.session.revision}`,a,{method:"POST",status:200});
    const beforeProfileApproval=await db.workout.findMany({where:{userId:a.id},orderBy:{id:"asc"}});
    const proposed=pending(await ask(a,"My weight is 72 kg."));assert.equal(proposed.beforeValues.weightKg,70);
    assert.equal((await db.athleteProfile.findUniqueOrThrow({where:{userId:a.id}})).weightKg,70);
    const approval=confirmBody(proposed);await json("/api/assistant/confirm",a,{body:approval});await json("/api/assistant/confirm",a,{body:approval});
    assert.equal((await db.athleteProfile.findUniqueOrThrow({where:{userId:a.id}})).weightKg,72);
    assert.deepEqual(await db.workout.findMany({where:{userId:a.id},orderBy:{id:"asc"}}),beforeProfileApproval,"Profile approval cannot rewrite saved workouts");
    assert.equal((await json("/api/assistant",a)).savedReceipt.applied[0].value,72);
    await db.user.update({where:{id:coach.id},data:{role:"coach"}});
    const generate=`/api/plan/generate?athleteId=${a.id}`;
    await request(generate,coach,{body:{preview:true,easyPct:80},status:403});
    await db.coachAssignment.create({data:{coachId:coach.id,athleteId:a.id,status:"active",consent:"granted"}});
    const preview=await json(generate,coach,{body:{preview:true,easyPct:80}});assert.ok(preview.previewToken);
    assert.equal(await db.trainingPlan.count({where:{userId:a.id}}),0,"Coach preview creates no plan");
    await json(generate,coach,{body:{preview:false,easyPct:80,previewToken:preview.previewToken}});
    await request(generate,coach,{body:{preview:false,easyPct:80,previewToken:preview.previewToken},status:409});
    const plan=await db.trainingPlan.findFirstOrThrow({where:{userId:a.id,status:"active"}});assert.equal(plan.easyPct,80);
    const audit=await db.auditLog.findFirstOrThrow({where:{actorId:coach.id,subjectId:a.id,entityId:plan.id,action:"plan.generate"}});
    assert.equal(JSON.parse(audit.after!).previewToken,preview.previewToken);
    const selected=await db.workout.findFirstOrThrow({where:{userId:a.id,planned:true,date:day,planDay:{planId:plan.id},sport:"run"},orderBy:{id:"asc"}});
    const provisional=await json(`/api/workout/card?id=${selected.id}`,a);
    assert.notEqual(provisional.session.verdict,"ready","The starter's earlier review does not clear a newly generated provisional cycle");
    // Cycle confirmation saves provisional prescriptions; the athlete must review
    // the newly saved session today rather than reuse the starter's check-in.
    await json("/api/checkin",a,{body:validAnswers});
    const card=await json(`/api/workout/card?id=${selected.id}`,a);assert.equal(card.session.verdict,"ready",JSON.stringify({stage:"new coach-reviewed cycle after fresh session-day check-in",sessionId:selected.id,reason:card.session.reason}));
    assert.equal((await db.workout.findUniqueOrThrow({where:{id:selected.id}})).approved,false);
    await request(`/api/workout/approve?sessionId=${selected.id}&expectedRevision=${first.session.revision}`,a,{method:"POST",status:409});
    const approved=await request(`/api/workout/approve?sessionId=${selected.id}&expectedRevision=${card.session.revision}`,a,{method:"POST",status:200});
    assert.equal(approved.headers.get("x-workout-revision"),card.session.revision);assert.equal(approved.headers.get("x-delivered-email"),"0");
    const decoder=new Decoder(Stream.fromByteArray(new Uint8Array(await approved.arrayBuffer())));assert.equal(decoder.checkIntegrity(),true);
    const decoded=decoder.read();assert.deepEqual(decoded.errors,[]);assert.ok(decoded.messages.workoutStepMesgs);assert.equal(decoded.messages.workoutStepMesgs.length,card.session.steps.length);
    for(const [index,step] of card.session.steps.entries()) {
      assert.equal(step.endpoint.type,"time");assert.equal(decoded.messages.workoutStepMesgs[index].durationValue,step.endpoint.seconds*1000);
    }
    const reloaded=await json(`/api/workout/card?id=${selected.id}`,a);assert.equal(reloaded.session.revision,card.session.revision);
    await request(`/api/workout/card?id=${selected.id}`,other,{status:404});
    const ics=await request("/api/training/export?format=ics",a,{status:200});const calendar=(await ics.text()).replace(/\r\n /g,"");
    assert.match(calendar,/BEGIN:VCALENDAR/);assert.ok(calendar.includes(`UID:${selected.id}@jasmiamimethod`));assert.ok(calendar.includes(card.session.title));
    const health=await json("/api/reminders/health",a);assert.ok(health.workoutEmail.blockers.length);assert.equal(health.workoutEmail.statuses.providerAccepted,0);
    assert.equal(health.recentProviderAcceptances,0);assert.equal(await db.sentEmail.count({where:{userId:a.id}}),0);
    const connections=await json("/api/connectors",a);assert.equal(connections.providers.find((provider:any)=>provider.id==="google_cal").status,"disconnected");
    assert.equal(await db.calendarEvent.count({where:{userId:a.id}}),0,"ICS download does not publish an external calendar event");
    assert.deepEqual({profile:await db.athleteProfile.findUniqueOrThrow({where:{userId:other.id}}),workouts:await db.workout.findMany({where:{userId:other.id},orderBy:{id:"asc"}})},foreignBefore);
  });
  await scenario('Dated natural workout edits bind one owner session, save only on confirmation, and ask when ambiguous',async()=>{
    const a=await actor('natural-edit'),w=await fixture(a);
    assert.equal((await json('/api/assistant',a)).defaultSessionId,w.id);
    const result=await ask(a,"Make today's run 45 minutes at zone 2");const p=pending(result);
    assert.ok(p.candidates.every((c:any)=>c.sessionId===w.id&&c.observedDate===today));
    assert.equal((await db.workout.findUniqueOrThrow({where:{id:w.id}})).durationMin,30);
    await json('/api/assistant/confirm',a,{body:confirmBody(p)});
    const saved=await db.workout.findUniqueOrThrow({where:{id:w.id}});assert.equal(saved.durationMin,45);assert.equal(saved.intensity,'z2');assert.equal(saved.approved,false);
    const tomorrow=await fixture(a,1);
    const routed=pending(await ask(a,"Make tomorrow's run 25 minutes",{sessionId:w.id}));
    assert.ok(routed.candidates.every((c:any)=>c.sessionId===tomorrow.id&&c.observedDate===addDaysKey(today,1)));
    assert.equal((await db.workout.findUniqueOrThrow({where:{id:tomorrow.id}})).durationMin,30);
    await json('/api/assistant/confirm',a,{body:confirmBody(routed)});assert.equal((await db.workout.findUniqueOrThrow({where:{id:tomorrow.id}})).durationMin,25);
    const second=await fixture(a);const snapshot=await db.workout.findMany({where:{userId:a.id},orderBy:{id:'asc'}});
    assert.equal((await json('/api/assistant',a)).defaultSessionId,null);
    const unclear=await ask(a,"Make today's workout 20 minutes");assert.match(unclear.answer,/Which workout/);assert.notEqual(unclear.proposal?.status,'pending');
    assert.deepEqual(await db.workout.findMany({where:{userId:a.id},orderBy:{id:'asc'}}),snapshot);assert.ok(second.id);
  });
  await scenario('Reviewed human handoff is owner-only, idempotent and visible only to authorized coaches/admin',async()=>{
    const a=await actor('review-owner'),b=await actor('review-other'),coach=await actor('review-coach'),admin=await actor('review-admin');
    await db.user.update({where:{id:coach.id},data:{role:'coach'}});await db.user.update({where:{id:admin.id},data:{role:'admin'}});
    const conversation=await ask(a,'Help me understand the next coaching decision.');const source=conversation.conversation.messages.find((m:any)=>m.role==='user');
    const body={sourceMessageId:source.id,question:'Synthetic decision: please review my available training time.',clientId:randomUUID(),confirmed:true,notifyAdmin:false};
    await request('/api/assistant/escalate',undefined,{body,status:401});await request('/api/assistant/escalate',b,{body,status:404});
    await request('/api/assistant/escalate',a,{body:{...body,confirmed:false},status:400});
    const shared=await json('/api/assistant/escalate',a,{body});assert.equal(shared.notificationStatus,'not_requested');
    const replay=await json('/api/assistant/escalate',a,{body});assert.equal(replay.sharedMessageId,shared.sharedMessageId);assert.equal(replay.replayed,true);
    assert.equal(await db.coachingMessage.count({where:{authorId:a.id}}),1);
    assert.equal((await json('/api/coaching/reviews',b)).requests.length,0);assert.equal((await json('/api/coaching/reviews',coach)).requests.length,0);
    await db.coachAssignment.create({data:{coachId:coach.id,athleteId:a.id,status:'active',consent:'granted'}});
    assert.equal((await json('/api/coaching/reviews',coach)).requests.length,1);assert.ok((await json('/api/coaching/reviews',admin)).requests.some((r:any)=>r.id===shared.sharedMessageId));
    await db.coachAssignment.updateMany({where:{coachId:coach.id,athleteId:a.id},data:{consent:'revoked'}});assert.equal((await json('/api/coaching/reviews',coach)).requests.length,0);
    await request('/api/assistant/escalate',a,{body:{...body,question:'A different question with the same identifier.'},status:409});
    assert.ok((await json('/api/coaching/messages',a)).messages.some((m:any)=>m.id===shared.sharedMessageId));
  });
  await scenario("Saved-training questions show owner plans without clearing check-in or changing training", async () => {
    const owner = await actor("saved-training-owner"), other = await actor("saved-training-other");
    const own = await fixture(owner), foreign = await fixture(other);
    await db.workout.update({ where: { id: own.id }, data: { title: "Owner saved bike", durationMin: 9, approved: false } });
    await db.workout.update({ where: { id: foreign.id }, data: { title: "Other athlete private session" } });
    const before = await db.workout.findUniqueOrThrow({ where: { id: own.id } });
    assert.equal(isTodayTrainingResponse(await json("/api/today", owner)), true, "Real held Today DTO passes the client rendering guard");
    assert.equal(isSavedPlanResponse(await json("/api/plan", owner)), true, "Real plan DTO passes the client rendering guard");
    assert.equal(isTrainingProfileResponse(await json("/api/profile", owner)), true, "Real profile DTO passes the client rendering guard");
    const response = await ask(owner, "I need guidance on today's workout");
    assert.match(response.answer, /not retained in chat/);
    assert.match(response.answer, /Review Today and your plan/);
    assert.doesNotMatch(response.answer, /Owner saved bike|9 min/);
    assert.doesNotMatch(response.answer, /Other athlete private session|Call Jasmel/);
    assert.equal(response.trainingModified, false);
    assert.ok(!response.proposal?.candidates?.length);
    assert.deepEqual(await db.workout.findUniqueOrThrow({ where: { id: own.id } }), before);
    assert.equal(await db.dailyCheckin.count({ where: { userId: owner.id } }), 0);
  });
  await scenario("Credential overview is administrator-only, preserves identities and revokes selected sessions",async()=>{
    const admin=await actor("credential-admin"),athlete=await actor("credential-athlete"),other=await actor("credential-other");
    await db.user.update({where:{id:admin.id},data:{role:"admin"}});
    await request("/api/admin/accounts",undefined,{status:401});await request("/api/admin/accounts",athlete,{status:403});
    const list=await json("/api/admin/accounts",admin);assert.equal(list.limit,50);assert.equal(list.total,await db.user.count());assert.ok(list.accounts.some((u:any)=>u.id===admin.id));assert.doesNotMatch(JSON.stringify(list),/passwordHash|tokenHash/);
    await request("/api/admin/accounts",admin,{body:{action:"revoke_sessions",userId:athlete.id},status:400});
    await request("/api/admin/accounts",admin,{body:{action:"revoke_sessions",userId:admin.id,confirmed:true},status:400});
    const revoked=await json("/api/admin/accounts",admin,{body:{action:"revoke_sessions",userId:athlete.id,confirmed:true}});assert.equal(revoked.ok,true);
    assert.equal((await json("/api/auth/me",athlete)).user,null);assert.equal((await json("/api/auth/me",other)).user.id,other.id);assert.equal((await db.user.findUniqueOrThrow({where:{id:athlete.id}})).role,"athlete");
    assert.equal(await db.auditLog.count({where:{actorId:admin.id,subjectId:athlete.id,action:"account.sessions_revoked"}}),1);
  });
  await scenario("Password login distinguishes unfinished onboarding from completed setup",async()=>{
    const a=await actor("credential-routing"),password=randomBytes(24).toString("hex");
    await db.user.update({where:{id:a.id},data:{onboarded:false,passwordHash:bcrypt.hashSync(password,10)}});
    assert.equal((await json("/api/auth/login",undefined,{body:{email:a.email,password}})).user.onboarded,false);
    await json("/api/onboard",a,{body:{}});
    assert.equal((await json("/api/auth/login",undefined,{body:{email:a.email,password}})).user.onboarded,true);
  });
  await scenario("Optional onboarding offers a held starter without a full plan and imported observations remain owner-scoped",async()=>{
    await request("/api/onboard/import-review",undefined,{status:401});
    const a=await actor("onboarding-a"),b=await actor("onboarding-b");
    const p=await json("/api/profile",a);
    await json("/api/profile",a,{method:"PUT",body:{expectedRevision:p.revision,expectedSetupRevision:p.setupRevision,setup:{travel:{destinationTimezone:"Asia/Tokyo",equipmentNotes:"Hotel gym",maxSessionMinutes:30},coachPreference:"Optional coach"}}});
    const saved=await json("/api/profile",a);assert.equal(saved.setup.travel.destinationTimezone,"Asia/Tokyo");assert.equal(saved.setup.coachPreference,"Optional coach");assert.equal(saved.planningReadiness.ready,false);
    const completed=await json("/api/onboard",a,{body:{}});assert.equal(completed.ok,true);assert.equal(completed.next,"/today");assert.equal(await db.workout.count({where:{userId:a.id,source:"starter"}}),1);
    assert.equal(await db.trainingPlan.count({where:{userId:a.id}}),0,"optional setup does not invent a full cycle");
    const dayZero=await json("/api/today",a);assert.notEqual(dayZero.sessions[0].verdict,"ready","onboarding cannot replace today's safety check-in");
    assert.equal((await db.user.findUniqueOrThrow({where:{id:a.id}})).onboarded,true);
    const own=await db.metricObservation.create({data:{userId:a.id,observedAt:new Date(),metricType:"weight_kg",value:71,unit:"kg",source:"synthetic-test",qualityFlag:"ok"}});
    const other=await db.metricObservation.create({data:{userId:b.id,observedAt:new Date(),metricType:"weight_kg",value:92,unit:"kg",source:"synthetic-test",qualityFlag:"ok"}});
    const imported=await json(`/api/onboard/import-review?athleteId=${b.id}`,a);
    assert.ok(imported.observations.some((o:any)=>o.id===own.id));assert.ok(!imported.observations.some((o:any)=>o.id===other.id));
    assert.equal((await db.athleteProfile.findUniqueOrThrow({where:{userId:a.id}})).weightKg,70,"review GET must not overwrite profile");
  });
  await scenario("Travel-only edits preserve persisted confirmation age, source and past goals despite forged planning answers",async()=>{
    const a=await actor("travel-age");
    const initial=await json("/api/profile",a);
    const confirmedAt=new Date(Date.now()-10*86400000).toISOString();
    const baseline={...initial.setup,confirmedAt,source:"coach_set",restrictions:"present",targetGoal:{metric:"completion",sport:"run",kind:"goal_not_capacity",targetDate:yesterday}};
    await db.auditLog.create({data:{actorId:a.id,subjectId:a.id,action:"profile.setup",after:JSON.stringify(baseline),note:"Synthetic old confirmation"}});
    const before=await json("/api/profile",a);
    await json("/api/profile",a,{method:"PUT",body:{expectedRevision:before.revision,expectedSetupRevision:before.setupRevision,setupSection:"travel",setup:{...baseline,confirmedAt:new Date().toISOString(),source:"athlete_reported",restrictions:"none",goalDescription:"Forged goal",targetGoal:null,travel:{destinationTimezone:"Asia/Tokyo",maxSessionMinutes:20}}}});
    const after=await json("/api/profile",a);
    assert.equal(after.setup.confirmedAt,confirmedAt);assert.equal(after.setup.source,"coach_set");assert.equal(after.setup.restrictions,"present");assert.equal(after.setup.goalDescription,baseline.goalDescription);assert.equal(after.setup.targetGoal.targetDate,yesterday);assert.equal(after.setup.travel.maxSessionMinutes,20);assert.equal(after.planningReadiness.ready,false);
    await request("/api/profile",a,{method:"PUT",body:{expectedRevision:after.revision,expectedSetupRevision:after.setupRevision,setupSection:"travel",weightKg:99,setup:{travel:null}},status:400});
    await request("/api/profile",a,{method:"PUT",body:{expectedRevision:after.revision,expectedSetupRevision:before.setupRevision,setupSection:"travel",setup:{travel:null}},status:409});
    assert.equal((await db.athleteProfile.findUniqueOrThrow({where:{userId:a.id}})).weightKg,70);
  });
  await scenario("Standalone coach route exists and stays out of search indexes",async()=>{
    const page=await request("/coach",undefined,{status:200});
    const html=await page.text();
    assert.match(html,/noindex/);
    assert.match(html,/JMM Coach/);
    // HTTP route coverage complements, but does not replace, signed-in browser navigation.
  });
  await scenario("Unauthenticated access and invalid envelopes fail without success",async()=>{await request("/api/assistant",undefined,{status:401});await request("/api/assistant",undefined,{body:{message:"hello"},status:401});const a=await actor("invalid");for(const body of [null,[],{message:""},{message:"x".repeat(10001)},{message:"hello",source:"web"},{message:"hello",externalConsent:"yes"},{message:"image",image:{url:"http://127.0.0.1/private"}}]) await request("/api/assistant",a,{body,status:400});});
  await scenario("Message request IDs replay once, reject changed bodies, and deduplicate concurrent sends",async()=>{const a=await actor("request-id");const clientRequestId=randomUUID();const body={message:"Why is easy endurance useful?",source:"text",externalConsent:false,clientRequestId};await json("/api/assistant",a,{body});const repeated=await json("/api/assistant",a,{body});assert.equal(repeated.replayed,true);assert.equal((await json("/api/assistant",a)).conversation.messages.length,2);await request("/api/assistant",a,{body:{...body,message:"Different question"},status:409});const parallel={...body,clientRequestId:randomUUID(),message:"What is perceived exertion?"};const responses=await Promise.all([request("/api/assistant",a,{body:parallel}),request("/api/assistant",a,{body:parallel})]);assert.ok(responses.some(r=>r.status===200));assert.ok(responses.every(r=>[200,409].includes(r.status)));assert.equal((await json("/api/assistant",a)).conversation.messages.length,4);});
  await scenario("Provider consent with unconfigured keys performs no paid extraction and preserves local state",async()=>{const a=await actor("provider-off");const result=await ask(a,"Why is easy endurance useful?",{externalConsent:true,textProviderConsent:"deepseek"});assert.equal(result.externalStatus,"not_configured");assert.equal(result.trainingModified,false);const capabilities=(await json("/api/assistant",a)).capabilities;assert.equal(capabilities.externalAi,false);assert.equal(capabilities.imageUnderstanding,false);});
  await scenario("Conversation persists, remains owner-scoped, and clears only its own text",async()=>{const a=await actor("memory"),b=await actor("other");const w=await fixture(a,-1,true);await ask(a,"I want to be consistent this month.");await ask(a,"Can we keep that goal in mind?");await ask(b,"A separate athlete conversation.");const before=await json("/api/assistant",a);assert.ok(before.conversation.messages.length>=4);assert.ok(before.conversation.messages.some((m:any)=>m.content.includes("consistent")));await request(`/api/assistant?athleteId=${b.id}`,a,{status:403});await request(`/api/assistant?athleteId=${b.id}`,a,{method:"DELETE",body:{confirmed:true},status:403});await json("/api/assistant",a,{method:"DELETE",body:{confirmed:true}});assert.equal((await json("/api/assistant",a)).conversation.messages.length,0);assert.ok((await json("/api/assistant",b)).conversation.messages.length>0);assert.equal((await db.workout.findUniqueOrThrow({where:{id:w.id}})).actualDurationMin,28);});
  await scenario("Editable explicit profile review really saves and returns idempotent receipt",async()=>{
    const a=await actor("profile");
    await fixture(a);
    const response=await ask(a,"My weekly availability is 5 hours per week.");
    const p=pending(response);assert.equal(response.displayUnits,"imperial");assert.deepEqual(p.beforeValues,{weeklyHours:3});
    assert.equal((await db.athleteProfile.findUniqueOrThrow({where:{userId:a.id}})).weeklyHours,3);
    const selected=p.candidates.filter((c:any)=>c.kind==="profile"&&c.field==="weeklyHours").map((c:any)=>({...c,value:4}));assert.equal(selected.length,1);
    const body=confirmBody(p,selected),beforeWorkouts=await db.workout.findMany({where:{userId:a.id},orderBy:{id:"asc"}});
    const receipt=await json("/api/assistant/confirm",a,{body});assert.equal(receipt.ok,true);assert.ok(receipt.receipt.pendingActions.includes("review_plan"));
    assert.equal(receipt.receipt.applied[0].previousValue,3);assert.equal(receipt.receipt.applied[0].value,4);
    assert.equal((await db.athleteProfile.findUniqueOrThrow({where:{userId:a.id}})).weeklyHours,4);
    assert.deepEqual(await db.workout.findMany({where:{userId:a.id},orderBy:{id:"asc"}}),beforeWorkouts,"Profile approval does not rewrite saved plans");
    await json("/api/assistant/confirm",a,{body});
    assert.equal(await db.auditLog.count({where:{subjectId:a.id,action:"profile.update"}}),2,"Setup save plus exactly one conversational save");
    assert.ok(await db.auditLog.count({where:{subjectId:a.id,action:"coach.conversation.confirmed"}})>0);
    const remembered=await ask(a,"What is my weekly availability?");assert.match(remembered.answer,/not retained in chat/);assert.doesNotMatch(remembered.answer,/4.*hours|4.*horas/i);
    const next=pending(await ask(a,"My weight is 71 kg."));await json("/api/assistant/cancel",a,{body:{proposalId:next.id}});
    const reloaded=await json("/api/assistant",a);assert.equal(reloaded.savedReceipt.id,receipt.receipt.id);assert.equal(reloaded.receipt.id,receipt.receipt.id);
    assert.equal(reloaded.savedReceipt.applied[0].previousValue,3);
    await db.athleteProfile.update({where:{userId:a.id},data:{units:"metric"}});
    const overridden=await ask(a,"My weight is 72 kg.");assert.equal(overridden.displayUnits,"metric");assert.equal(overridden.proposal.beforeValues.weightKg,70);
  });
  await scenario("Stale profile, wrong athlete, candidate expansion and missing confirmation cannot write",async()=>{const a=await actor("stale"),b=await actor("thief");const p=pending(await ask(a,"My weekly availability is 5 hours per week."));const body=confirmBody(p);await request("/api/assistant/confirm",b,{body,status:404});await request("/api/assistant/confirm",a,{body:{...body,confirmed:false},status:400});await request("/api/assistant/confirm",a,{body:{...body,candidates:p.candidates.map((c:any)=>({...c,field:"ftp",value:400,unit:"W"}))},status:400});const profile=await json("/api/profile",a);await json("/api/profile",a,{method:"PUT",body:{expectedRevision:profile.revision,weeklyHours:6}});await request("/api/assistant/confirm",a,{body,status:409});const saved=await db.athleteProfile.findUniqueOrThrow({where:{userId:a.id}});assert.equal(saved.weeklyHours,6);assert.equal(saved.ftp,null);});
  await scenario("Superseded and timezone-changed proposals require a fresh review",async()=>{const a=await actor("superseded");const old=pending(await ask(a,"My weekly availability is 5 hours per week."));const next=pending(await ask(a,"My weekly availability is 6 hours per week."));await request("/api/assistant/confirm",a,{body:confirmBody(old),status:409});await db.user.update({where:{id:a.id},data:{timezone:"Pacific/Kiritimati"}});await request("/api/assistant/confirm",a,{body:confirmBody(next),status:409});assert.equal((await db.athleteProfile.findUniqueOrThrow({where:{userId:a.id}})).weeklyHours,3);});
  await scenario("Administrator and assigned-coach scope do not bypass the private-conversation boundary",async()=>{
    const a=await actor("private-owner"),admin=await actor("admin-private"),coach=await actor("coach-private");
    await db.user.update({where:{id:admin.id},data:{role:"admin"}});await db.user.update({where:{id:coach.id},data:{role:"coach"}});
    await db.coachAssignment.create({data:{coachId:coach.id,athleteId:a.id,status:"active",consent:"granted"}});
    await ask(a,"My private conversation context.");
    for(const other of [admin,coach]) {
      await request(`/api/assistant?athleteId=${a.id}`,other,{status:403});
      await request(`/api/assistant?athleteId=${a.id}`,other,{method:"DELETE",body:{confirmed:true},status:403});
      await request(`/api/assistant?athleteId=${a.id}`,other,{body:{message:"My weight is 80 kg."},status:403});
    }
    assert.ok((await json("/api/assistant",a)).conversation.messages.length>0);
  });
  await scenario("Cancellation prevents confirmation and does not claim health data was saved",async()=>{const a=await actor("cancel");const p=pending(await ask(a,"My weekly availability is 5 hours per week."));await json("/api/assistant/cancel",a,{body:{proposalId:p.id}});await request("/api/assistant/confirm",a,{body:confirmBody(p),status:409});assert.equal((await db.athleteProfile.findUniqueOrThrow({where:{userId:a.id}})).weeklyHours,3);});
  await scenario("Completed activity feedback saves separately, preserves prescription, and reaches authoritative Today reassessment",async()=>{const a=await actor("journey");const w=await fixture(a),future=await fixture(a,1),historic=await fixture(a,-1,true);await json("/api/checkin",a,{body:validAnswers});const before=await db.workout.findUniqueOrThrow({where:{id:w.id}});const beforeView=(await json("/api/today",a)).sessions.find((session:any)=>session.id===w.id);const p=pending(await ask(a,"Today I completed my run for 25 minutes, RPE 4.",{sessionId:w.id}));const feedback=p.candidates.filter((c:any)=>c.kind==="workout_feedback");assert.ok(feedback.some((c:any)=>c.field==="actualDurationMin"&&c.value===25));await json("/api/assistant/confirm",a,{body:confirmBody(p,feedback)});const saved=await db.workout.findUniqueOrThrow({where:{id:w.id}});assert.equal(saved.actualDurationMin,25);assert.equal(saved.rpe,4);assert.equal(saved.completed,true);assert.equal(saved.prescription,before.prescription);const visible=(await json("/api/today",a)).sessions.find((s:any)=>s.id===w.id);assert.equal(visible.actualDurationMin,25);assert.notEqual(visible.revision,beforeView.revision);await request(`/api/workout/approve?sessionId=${w.id}&expectedRevision=${beforeView.revision}`,a,{status:409});assert.equal(await db.coachingPrompt.count({where:{userId:a.id}}),0);const remembered=await ask(a,"What was my last recorded workout?");assert.match(remembered.answer,/not retained in chat/);assert.doesNotMatch(remembered.answer,/25.*min/i);const adaptation=await json("/api/checkin",a,{body:validAnswers});assert.equal(adaptation.ok,true);assert.equal((await db.workout.findUniqueOrThrow({where:{id:w.id}})).prescription,before.prescription);assert.equal((await db.workout.findUniqueOrThrow({where:{id:future.id}})).prescription,future.prescription);assert.equal((await db.workout.findUniqueOrThrow({where:{id:historic.id}})).actualDurationMin,28);});
  await scenario("Mixed profile/workout review rolls back entirely if the selected workout changed",async()=>{const a=await actor("atomic"),w=await fixture(a);const p=pending(await ask(a,"My weekly availability is 5 hours per week. Today I completed my run for 25 minutes, RPE 4.",{sessionId:w.id}));assert.ok(p.candidates.some((c:any)=>c.kind==="profile"));assert.ok(p.candidates.some((c:any)=>c.kind==="workout_feedback"));await db.workout.update({where:{id:w.id},data:{title:"Concurrent externally reviewed edit"}});await request("/api/assistant/confirm",a,{body:confirmBody(p),status:409});assert.equal((await db.athleteProfile.findUniqueOrThrow({where:{userId:a.id}})).weeklyHours,3);assert.equal((await db.workout.findUniqueOrThrow({where:{id:w.id}})).actualDurationMin,null);});
  await scenario("Concurrent confirmation applies at most once and altered replay cannot reapply",async()=>{const a=await actor("concurrent");const p=pending(await ask(a,"My weekly availability is 5 hours per week."));const body=confirmBody(p);const responses=await Promise.all([request("/api/assistant/confirm",a,{body}),request("/api/assistant/confirm",a,{body})]);assert.ok(responses.some(r=>r.status===200));assert.ok(responses.every(r=>[200,409].includes(r.status)));await json("/api/assistant/confirm",a,{body});assert.equal(await db.auditLog.count({where:{subjectId:a.id,action:"coach.conversation.confirmed"}}),1);await request("/api/assistant/confirm",a,{body:{...body,candidates:body.candidates.map((c:any)=>({...c,value:6}))},status:409});assert.equal((await db.athleteProfile.findUniqueOrThrow({where:{userId:a.id}})).weeklyHours,5);});
  await scenario("Clearing chat removes cancelled/superseded proposal evidence but preserves applied health audits",async()=>{const a=await actor("delete-proposals");const one=pending(await ask(a,"My weekly availability is 5 hours per week."));await json("/api/assistant/cancel",a,{body:{proposalId:one.id}});await ask(a,"My weekly availability is 6 hours per week.");const latest=pending(await ask(a,"My weight is 71 kg."));await json("/api/assistant/confirm",a,{body:confirmBody(latest)});await json("/api/assistant",a,{method:"DELETE",body:{confirmed:true}});const rows=await db.coachConversationProposal.findMany({where:{userId:a.id}});assert.ok(rows.every(r=>!r.candidates.includes("availability")));assert.equal((await db.athleteProfile.findUniqueOrThrow({where:{userId:a.id}})).weightKg,71);assert.equal(await db.auditLog.count({where:{subjectId:a.id,action:"coach.conversation.confirmed"}}),1);});
  await scenario("EN/ES voice is an editable transcript and requires explicit review before saving",async()=>{const a=await actor("voz","es"),w=await fixture(a);const p=pending(await ask(a,"Hoy completé mi carrera durante 22 minutos, RPE 3.",{source:"voice",sessionId:w.id}));assert.ok(p.candidates.every((c:any)=>c.source==="voice"));assert.equal((await db.workout.findUniqueOrThrow({where:{id:w.id}})).actualDurationMin,null);await json("/api/assistant/confirm",a,{body:confirmBody(p)});assert.equal((await db.workout.findUniqueOrThrow({where:{id:w.id}})).actualDurationMin,22);});
  await scenario("Session ownership, date contradictions and future completion fail closed",async()=>{const a=await actor("binding"),b=await actor("binding-other");const w=await fixture(a),other=await fixture(b);await request("/api/assistant",a,{body:{message:"Today I completed my run for 25 minutes.",sessionId:other.id},status:404});for(const message of ["Tomorrow I completed my run for 25 minutes.",`On ${yesterday} I completed my run for 25 minutes.`]){const res=await request("/api/assistant",a,{body:{message,sessionId:w.id}});assert.ok([200,400].includes(res.status));const result=await res.json();assert.ok(!result.proposal?.candidates?.some((c:any)=>c.kind==="workout_feedback"),"Contradictory completion must not be applicable");}assert.equal((await db.workout.findUniqueOrThrow({where:{id:w.id}})).actualDurationMin,null);});
  await scenario("Goal, hypothetical and future-plan discussion never becomes measured capacity or silent rewrite",async()=>{const a=await actor("future"),future=await fixture(a,1);const aspiration=await ask(a,"My goal is a marathon in 3 hours.");assert.ok(!aspiration.proposal?.candidates?.some((c:any)=>["runPaceBase","ftp","vo2max","lthr"].includes(c.field)));const hypothetical=await ask(a,"What if I ran 50 minutes tomorrow?");assert.ok(!hypothetical.proposal?.candidates?.some((c:any)=>c.kind==="workout_feedback"));const result=await ask(a,"Tomorrow I plan to run for 40 minutes.",{sessionId:future.id});assert.equal(result.trainingModified,false);const review=pending(result);const receipt=await json("/api/assistant/confirm",a,{body:confirmBody(review)});assert.equal(receipt.applied,true);assert.equal(receipt.trainingModified,true);assert.ok(receipt.receipt.pendingActions.includes("review_checkin"));const edited=await db.workout.findUniqueOrThrow({where:{id:future.id}});assert.equal(edited.durationMin,40);assert.equal(edited.approved,false);assert.match(receipt.receipt.message,/Nothing was sent to a watch/);});
  await scenario("Motivation advice is firm only with current safety, accepts refusal, and prioritizes danger",async()=>{const a=await actor("motivation");await fixture(a);let response=await ask(a,"I'm tired.");assert.match(response.answer,/pain|ill|fatigue|tired|check-in/i);await json("/api/checkin",a,{body:validAnswers});await db.workout.updateMany({where:{userId:a.id,date:day},data:{approved:true}});response=await ask(a,"I feel fine, no pain or illness, just can't be bothered.");assert.match(response.answer,/check-in|safety/i);assert.doesNotMatch(response.answer,/warm.up already|calentamiento ya previsto/i);response=await ask(a,"I am lazy and my chest hurts.");assert.match(response.answer,/stop|urgent|emergency/i);assert.doesNotMatch(response.answer,/start.*warm.up|push through/i);response=await ask(a,"Stop pushing; I choose rest.");assert.doesNotMatch(response.answer,/start.*warm.up|push through/i);});
  await scenario("Images require valid bounded inline bytes and explicit consent, no arbitrary fetch",async()=>{const a=await actor("image");for(const image of [{mimeType:"image/svg+xml",dataBase64:Buffer.from("<svg/>").toString("base64")},{mimeType:"image/png",dataBase64:"not_base64"},{mimeType:"image/png",dataBase64:Buffer.from("not an image").toString("base64")},{mimeType:"image/png",url:"https://example.invalid/private"}]) await request("/api/assistant",a,{body:{message:"Review screenshot",externalConsent:true,imageSource:"manual_note",image},status:400});const pixel="iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADklEQVQImWM4AQYMEAoAQa4JYfTnnZUAAAAASUVORK5CYII=";const result=await ask(a,"Here is a screenshot.",{imageSource:"manual_note",image:{mimeType:"image/png",dataBase64:pixel}});assert.equal(result.trainingModified,false);assert.ok(!result.proposal?.candidates?.length);assert.match(JSON.stringify(result),/consent|not_requested|not_configured|unavailable|describe/i);});
}
main().catch(e=>{results.push({name:"Runner setup",status:"FAIL",detail:String(e)});console.error(e);}).finally(async()=>{
  let cleanup=false;try {await db.usageCounter.deleteMany({where:{userId:{in:created}}});await db.appEvent.deleteMany({where:{userId:{in:created}}});await db.user.deleteMany({where:{id:{in:created}}});assert.equal(await db.user.count({where:{id:{in:created}}}),0);cleanup=true;}catch(e){results.push({name:"Fixture cleanup",status:"FAIL",detail:String(e)});}await db.$disconnect();
  let commit="unknown",sourceFingerprint:string|null=null;try{commit=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();const paths=execFileSync("git",["ls-files","--cached","--others","--exclude-standard"],{encoding:"utf8"}).trim().split("\n").filter(p=>/^(src\/|scripts\/|prisma\/|package(?:-lock)?\.json$)/.test(p)).sort();const hash=createHash("sha256");for(const p of paths)hash.update(p).update("\0").update(readFileSync(p));sourceFingerprint=hash.digest("hex");}catch{}
  writeFileSync(`${dir}/report.json`,JSON.stringify({generatedAt:new Date().toISOString(),commit,sourceFingerprint,appMode:process.env.JMM_TEST_APP_MODE,environment:"Disposable loopback PostgreSQL and synthetic athletes; no external requests",results,cleanup:{createdUsers:created.length,verified:cleanup},notRun:["Live external AI/image extraction","Real athlete data or device delivery","Production migration/deployment","Real browser voice permissions"]},null,2));const failed=results.filter(r=>r.status==="FAIL");console.log(`${results.length-failed.length}/${results.length} conversation acceptance scenarios passed.`);if(failed.length)process.exitCode=1;
});
