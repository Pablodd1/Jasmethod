/** Athlete-friendly measurements and incomplete-data starting weeks, isolated HTTP/PostgreSQL only. */
const assert=require('node:assert/strict');
const {randomBytes,randomUUID}=require('node:crypto');
const {mkdirSync,writeFileSync}=require('node:fs');
const {PrismaClient}=require('@prisma/client');
const bcrypt=require('bcryptjs');
const {hashToken}=require('../src/lib/auth.ts');
const {chromium}=require('playwright');
for(const key of ['DATABASE_URL','DIRECT_URL']){const url=new URL(process.env[key]||'');assert.equal(url.protocol,'postgresql:');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55432');assert.equal(url.pathname,'/jmm_launch_integration_test');assert.equal(url.search,'');}
assert.notEqual(process.env.VERCEL_ENV,'production');assert.ok(process.env.NODE_OPTIONS?.includes('jmm-test-egress-guard.cjs'));
const base='http://127.0.0.1:3220',db=new PrismaClient(),ids=[],checks=[],dir='.local/jmm-athlete-entry-browser';mkdirSync(dir,{recursive:true});
const today=new Date().toISOString().slice(0,10),ago=days=>new Date(Date.now()-days*86400000).toISOString().slice(0,10);
async function actor(language='en',profile={}){
 const user=await db.user.create({data:{email:`entry-${randomUUID()}@example.invalid`,name:'Synthetic athlete entry',passwordHash:bcrypt.hashSync(randomBytes(24).toString('hex'),4),language,timezone:'UTC',onboarded:true,
  profile:{create:{goal:'run-only',experience:'advanced',birthYear:1990,units:language==='en'?'imperial':'metric',...profile}},reminder:{create:{emailEnabled:false,telegramEnabled:false}}}});
 ids.push(user.id);const token=randomBytes(32).toString('hex');await db.authSession.create({data:{userId:user.id,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+3600000)}});return {user,token};
}
async function call(who,path,body,expected=200,method=body?'POST':'GET'){
 const response=await fetch(base+path,{method,headers:{...(who?{cookie:`jmm_session=${who.token}`} : {}),origin:base,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;
}
async function confirm(who,preview){return call(who,'/api/plan/starting',{confirmed:true,previewToken:preview.previewToken});}
async function backend(){
 const a=await actor(),other=await actor();
 await call(null,'/api/plan/starting',undefined,401);
 await call(a,`/api/plan/starting?athleteId=${other.user.id}`,undefined,403);
 const first=await call(a,'/api/plan/starting');assert.equal(first.preview.totalMinutes,60);assert.equal(first.preview.progression,false);
 for(const [origin,type,body,status] of [['https://foreign.example.invalid','application/json',JSON.stringify({confirmed:true,previewToken:first.previewToken}),403],[base,'text/plain','{}',415],[base,'application/json','{',400],[base,'application/json',' '.repeat(2048),413]]){
  const rejected=await fetch(base+'/api/plan/starting',{method:'POST',headers:{cookie:`jmm_session=${a.token}`,origin,'Content-Type':type},body});assert.equal(rejected.status,status);
 }
 assert.equal(await db.trainingPlan.count({where:{userId:a.user.id}}),0);
 await call(a,'/api/plan/starting',{confirmed:false,previewToken:first.previewToken},400);
 await db.athleteProfile.update({where:{userId:a.user.id},data:{weeklyHours:.5}});
 await call(a,'/api/plan/starting',{confirmed:true,previewToken:first.previewToken},409);
 const next=await call(a,'/api/plan/starting'),saved=await confirm(a,next),duplicate=await confirm(a,next);
 assert.equal(duplicate.planId,saved.planId);assert.equal(duplicate.duplicate,true);
 assert.equal(await db.trainingPlan.count({where:{userId:a.user.id,status:'active'}}),1);
 const profile=await db.athleteProfile.findUniqueOrThrow({where:{userId:a.user.id}});assert.equal(profile.ftp,null);assert.equal(profile.runPaceBase,null);assert.equal(profile.vo2max,null);
 const sessions=await db.workout.findMany({where:{userId:a.user.id}});assert.equal(sessions.reduce((n,w)=>n+w.durationMin,0),30);
 for(const w of sessions){assert.equal(w.approved,false);assert.equal(w.completed,false);assert.equal(JSON.parse(w.prescription).durationMin,0);}
 const active=await call(a,'/api/plan/starting');assert.equal(active.existingPlanId,saved.planId);
 await call(a,'/api/plan/starting',{confirmed:true,previewToken:active.previewToken},409);
 assert.equal((await call(other,'/api/plan')).plans.length,0);
 // A completed observation remains history when an expired introductory week is renewed.
 const historic=sessions[0];await db.workout.update({where:{id:historic.id},data:{completed:true,actualDurationMin:10,feedbackStatus:'completed'}});
 const plan=await db.trainingPlan.findUniqueOrThrow({where:{id:saved.planId},include:{days:{include:{sessions:true}}}});
 await db.trainingPlan.update({where:{id:plan.id},data:{startDate:new Date(ago(8)+'T00:00Z')}});
 for(const day of plan.days){const date=new Date(day.date.getTime()-8*86400000);await db.planDay.update({where:{id:day.id},data:{date}});await db.workout.updateMany({where:{planDayId:day.id},data:{date}});}
 const renew=await call(a,'/api/plan/starting');assert.equal(renew.renewingStartingWeek,true);await confirm(a,renew);
 assert.equal((await db.trainingPlan.findUniqueOrThrow({where:{id:plan.id}})).status,'archived');
 assert.equal((await db.workout.findUniqueOrThrow({where:{id:historic.id}})).actualDurationMin,10);
 checks.push({name:'owner-only preview, stale confirmation, duplicate, active-plan protection, no fabricated anchors, expired-week renewal preserves history',status:'PASS'});
 const restricted=await actor('es'),p=await call(restricted,'/api/profile');
 await call(restricted,'/api/profile',{expectedRevision:p.revision,expectedSetupRevision:p.setupRevision,experience:'advanced',weeklyHours:3,setup:{adultConfirmed:true,profileConfirmed:true,goalDescription:'Maintain familiar fitness',baselineWeeklyMinutes:180,baselineObservedAt:ago(45),interruptions:'none',restrictions:'present',qualifiedReview:'none_needed',trainingDays:[0,1,2,3,4,5,6],maxSessionMinutes:60,equipmentAccess:'Familiar route',planWeeks:12}},200,'PUT');
 const held=await call(restricted,'/api/plan/starting');assert.equal(held.preview.totalMinutes,0);assert.equal(held.preview.status,'review_required');
 assert.ok(held.preview.reasons.some(r=>r.key==='restrictions'));await confirm(restricted,held);
 for(const w of await db.workout.findMany({where:{userId:restricted.user.id}}))assert.equal(w.durationMin,0);
 await call(restricted,'/api/plan/generate',{distance:'run-only',weeks:12,startDate:today,preview:true},422);
 const restrictedSetup=await call(restricted,'/api/profile');assert.equal(restrictedSetup.setup.restrictions,'present');assert.equal(restrictedSetup.setup.baselineObservedAt,ago(45));
 checks.push({name:'restriction and stale baseline are explained and preserved; review-only week does not authorize exercise',status:'PASS'});
 const unknown=await actor();await db.workout.create({data:{userId:unknown.user.id,date:new Date(ago(1)+'T00:00Z'),sport:'run',title:'Synthetic restricted record',source:'intervals',notes:'Original source: STRAVA. PRIVATE_CANARY_ENTRY_771',planned:false,completed:true,durationMin:30,intensity:'z2',type:'endurance'}});
 const origin=await call(unknown,'/api/plan/starting');assert.equal(origin.preview.totalMinutes,0);assert.ok(origin.preview.reasons.some(r=>r.key==='provenance'));assert.doesNotMatch(JSON.stringify(origin),/PRIVATE_CANARY/);
 checks.push({name:'restricted/unknown imported origin stays held and its contents never enter the preview',status:'PASS'});
 const observation=await actor('en',{runPaceBase:353,ftp:413,lthr:173,vo2max:61});await confirm(observation,await call(observation,'/api/plan/starting'));
 const reviewed=await call(observation,'/api/checkin',{sleep:4,soreness:2,motivation:4,energy:4,stress:2,sick:false,newPain:false,urgentSymptoms:false,availableMinutes:20});
 assert.ok(reviewed.prescriptions.length);for(const session of reviewed.prescriptions){assert.equal(session.targets.pace,undefined);assert.equal(session.targets.power,undefined);assert.equal(session.targets.hr,undefined);}
 checks.push({name:'starter check-in works without a training baseline and does not turn undated profile physiology into numeric targets',status:'PASS'});
 const parallel=await actor(),pending=await call(parallel,'/api/plan/starting');
 const attempts=await Promise.all([1,2].map(()=>fetch(base+'/api/plan/starting',{method:'POST',headers:{cookie:`jmm_session=${parallel.token}`,origin:base,'Content-Type':'application/json'},body:JSON.stringify({confirmed:true,previewToken:pending.previewToken})})));
 assert.ok(attempts.some(r=>r.status===200));assert.ok(attempts.every(r=>[200,409].includes(r.status)));assert.equal(await db.trainingPlan.count({where:{userId:parallel.user.id,status:'active'}}),1);
 checks.push({name:'concurrent confirmations create one active plan',status:'PASS'});
}
async function browserJourney(browser,language){
 const who=await actor(language),es=language==='es',context=await browser.newContext({viewport:{width:390,height:844},locale:es?'es-ES':'en-US'});
 await context.addCookies([{name:'jmm_session',value:who.token,url:base,httpOnly:true,sameSite:'Lax'}]);
 const page=await context.newPage(),errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==base){external.push('external request');return route.abort();}return route.continue();});
 try{
  await page.goto(base+'/training');await page.getByRole('button',{name:es?'Ver mi semana inicial':'Preview my starting week',exact:true}).click();
  const preview=page.getByRole('region',{name:es?'Vista previa de la semana inicial':'Starting-week preview',exact:true});await preview.waitFor();
  assert.equal(await db.trainingPlan.count({where:{userId:who.user.id}}),0);
  await preview.scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/starting-preview-${language}-390.png`,fullPage:false});
  const save=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plan/starting'&&r.request().method()==='POST');
  await preview.getByRole('button',{name:es?'Confirmar y guardar semana inicial':'Confirm and save starting week',exact:true}).click();assert.equal((await save).status(),200);
  await page.reload();await page.getByRole('heading',{name:es?'Plan de entrenamiento':'Training Plan',exact:true}).waitFor();
  await page.getByRole('region',{name:es?'Ciclo de entrenamiento guardado':'Saved training cycle',exact:true}).waitFor();
  assert.equal(await db.trainingPlan.count({where:{userId:who.user.id,status:'active'}}),1);
  await page.screenshot({path:`${dir}/starting-saved-${language}-390.png`,fullPage:false});
  await page.goto(base+'/settings');const baseline=page.getByRole('heading',{name:es?'Pruebas y resultados medidos':'Baseline tests and measured results',exact:true}).locator('..');await baseline.waitFor();
  await baseline.getByRole('combobox').selectOption('run5k');const result=baseline.getByRole('textbox',{name:es?/^Resultado medido/:/^Measured result/});await result.fill('3:90');
  await baseline.locator('input[name="date"]').fill(ago(1));assert.equal(await result.evaluate(input=>input.validity.valid),false);
  await result.fill('25:00');let request=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/benchmarks'&&r.request().method()==='POST');
  await baseline.getByRole('button',{name:es?'Registrar prueba':'Record test',exact:true}).click();assert.equal((await request).status(),200);
  assert.equal((await db.benchmarkTest.findFirstOrThrow({where:{userId:who.user.id,type:'run5k'}})).result,1500);
  assert.equal((await db.athleteProfile.findUniqueOrThrow({where:{userId:who.user.id}})).runPaceBase,null);
  // Profile's onSaved refresh unmounts this section. Verify persisted history after a full reload.
  await page.reload();await baseline.getByRole('listitem').filter({hasText:'25:00'}).waitFor();
  await baseline.getByRole('combobox').selectOption('swim');await result.fill('1:40');await baseline.locator('input[name="date"]').fill(ago(1));
  request=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/benchmarks'&&r.request().method()==='POST');await baseline.getByRole('button',{name:es?'Registrar prueba':'Record test',exact:true}).click();assert.equal((await request).status(),200);
  const swim=await db.benchmarkTest.findFirstOrThrow({where:{userId:who.user.id,type:'swim'}});assert.ok(Math.abs(swim.result-(es?100:100/.9144))<1e-8);
  await page.reload();await baseline.getByRole('listitem').filter({hasText:'1:40'}).waitFor();
  await baseline.scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/measured-time-${language}-390.png`,fullPage:false});
  await page.goto(base+'/hyrox');await page.locator('#hyrox-target').fill('75');await page.locator('#hyrox-pace').fill('5:00');await page.locator('#hyrox-sex').selectOption('female');await page.locator('#hyrox-pro').selectOption('0');
  await page.locator('#hyrox-build-plan').click();const split=page.getByRole('textbox',{name:es?/tiempo real \(m:ss\)/:/actual time \(m:ss\)/});await split.first().waitFor();
  const splitSize=await split.first().boundingBox();assert.ok(splitSize.width>=90&&splitSize.height>=44,'Split clocks need a readable width and touch height on mobile');
  await split.first().fill('4:30');request=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/hyrox/split-planner'&&r.request().method()==='POST');await page.locator('#hyrox-analyze').click();const analyzed=await request;assert.equal(analyzed.status(),200);
  const body=analyzed.request().postDataJSON();assert.equal(Number(body.actualSecs[0]),270);assert.ok(Math.abs(Number(body.pace)-(es?300:300/1.609344))<1e-8);
  await split.first().scrollIntoViewIfNeeded();await page.screenshot({path:`${dir}/hyrox-time-${language}-390.png`,fullPage:false});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  checks.push({name:`${language} mobile: starting preview/save/reload, optional benchmark clocks, invalid clock, CSS pool units, HYROX pace and splits`,status:'PASS'});
 }catch(e){checks.push({name:`${language} mobile`,status:'FAIL',error:String(e),errors,external});await page.screenshot({path:`${dir}/failure-${language}.png`,fullPage:true}).catch(()=>{});throw e;}finally{await context.close();}
}
async function main(){await backend();const browser=await chromium.launch({headless:true});try{for(const language of ['en','es'])await browserJourney(browser,language);}finally{await browser.close();}}
main().catch(e=>{checks.push({name:'acceptance',status:'FAIL',error:String(e)});console.error(e);process.exitCode=1;}).finally(async()=>{try{await db.user.deleteMany({where:{id:{in:ids}}});}finally{await db.$disconnect();}writeFileSync(`${dir}/report.json`,JSON.stringify({syntheticOnly:true,scope:'Isolated Chromium -> real HTTP/PostgreSQL. No production athletes, provider delivery or physiological accuracy claim.',checks},null,2));});
