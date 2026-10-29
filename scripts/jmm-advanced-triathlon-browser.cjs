/** Exact-persona regression on disposable HTTP/PostgreSQL. No provider accounts, credentials or sends. */
const assert=require('node:assert/strict'),{randomUUID,randomBytes}=require('node:crypto'),{mkdirSync,writeFileSync}=require('node:fs');
const {PrismaClient}=require('@prisma/client'),bcrypt=require('bcryptjs'),{chromium}=require('playwright'),{Decoder,Stream}=require('@garmin/fitsdk');
const {hashToken}=require('../src/lib/auth.ts'),{dateKey,localDate,addDaysKey}=require('../src/lib/dates.ts'),{recordReportedAnchors}=require('../src/lib/reported-anchors.ts');
for(const key of ['DATABASE_URL','DIRECT_URL']){const u=new URL(process.env[key]||'');assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55432');assert.equal(u.pathname,'/jmm_launch_integration_test');assert.equal(u.search,'');}
assert.notEqual(process.env.VERCEL_ENV,'production');assert.ok(process.env.NODE_OPTIONS?.includes('jmm-test-egress-guard.cjs'));
const db=new PrismaClient(),base='http://127.0.0.1:3220',timezone='America/New_York',now=new Date(),today=dateKey(now,timezone),monday=localDate(today,timezone).getDay()===1,dir='.local/jmm-advanced-triathlon',ids=[],checks=[],errors=[],unexpected=[];mkdirSync(dir,{recursive:true});
async function actor(){const user=await db.user.create({data:{email:`triathlon-${randomUUID()}@example.invalid`,name:'Synthetic advanced triathlete',passwordHash:bcrypt.hashSync(randomBytes(24).toString('hex'),4),language:'en',timezone,onboarded:true,reminder:{create:{emailEnabled:false,telegramEnabled:false}}}});ids.push(user.id);const token=randomBytes(32).toString('hex');await db.authSession.create({data:{userId:user.id,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+3600000)}});return {user,token};}
async function call(who,path,body,expected=200,method=body?'POST':'GET'){const response=await fetch(base+path,{method,headers:{cookie:`jmm_session=${who.token}`,origin:base,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.equal(response.status,expected,JSON.stringify(data));return data;}
async function main(){const who=await actor(),other=await actor();const before=await call(who,'/api/profile');
 const references={ftp:330,runPaceBase:360/1.609344,swimPaceBase:78/.9144};
 const fields={goal:'half',experience:'advanced',weeklyHours:12,birthYear:1988,sex:'male',heightCm:180.34,weightKg:159*.45359237,units:'imperial',lthr:172,maxHr:188,restingHr:48,...references,sweatRateMlH:750,sodiumMgPerL:700,manualPrs:recordReportedAnchors(null,references,today,today)};
 const setup={adultConfirmed:true,profileConfirmed:true,profileAnswers:{experience:true,weeklyHours:true},goalDescription:'Sub-4:25 half-distance; improve running off the bike; stay healthy and consistent',baselineWeeklyMinutes:720,baselineObservedAt:today,interruptions:'none',restrictions:'none',qualifiedReview:'none_needed',trainingDays:monday?[1,2,3,4,5,6]:[2,3,4,5,6,0],maxSessionMinutes:300,equipmentAccess:'Pool, open water, bikes, smart trainer, power meter, GPS/HR, treadmill, outdoor routes and gym',planWeeks:24,doubleDay:{version:'optional-double-day-v1',weekday:3,purpose:'Optional second familiar easy sport; separate recovery review required',firstStart:'06:00',secondStart:'18:00',athleteAgreed:true,priorTolerance:true,foodFluidsAvailable:true,recheckBetween:true}};
 await call(who,'/api/profile',{...fields,setup,expectedRevision:before.revision,expectedSetupRevision:before.setupRevision},200,'PUT');
 const reloaded=await call(who,'/api/profile');for(const key of ['sex','heightCm','weightKg','ftp','runPaceBase','swimPaceBase'])assert.equal(reloaded.profile[key],fields[key]);assert.equal(reloaded.setup.baselineWeeklyMinutes,720);
 for(const [offset,name,distance,priority] of [[81,'Miami 10K QA Mock','10k',3],[116,'Fort Lauderdale Olympic QA Mock','olympic',2],[165,'Miami 70.3 QA Mock','half',1]])await call(who,'/api/races',{name,date:addDaysKey(today,offset),distance,priority});
 const body={distance:'half',weeks:24,startDate:today,preview:true};const preview=await call(who,'/api/plan/generate',body);assert.equal(preview.preview.weeksPreview.length,24);
 for(const w of preview.preview.weeksPreview){assert.ok(w.sessions.every(s=>s.sport!=='swim'||s.minutes<=75));for(let slot=0;slot<7;slot++)assert.ok(w.sessions.filter(s=>s.daySlot===slot).reduce((n,s)=>n+s.minutes,0)<=300);}
 assert.ok(preview.preview.weeksPreview.slice(2,10).some(w=>w.sessions.some(s=>Number(s.zone.slice(1))>2)));
 const saved=await call(who,'/api/plan/generate',{...body,preview:false,previewToken:preview.previewToken,confirmDoubleDay:true,confirmEventTradeoffs:true});assert.ok(saved.plan.id);
 checks.push({name:'one profile save/reload preserves body, explicit references and training context; 24-week preview/save retains bounded sport allocation and event protection',status:'PASS'});
 const current=await db.workout.findMany({where:{userId:who.user.id,planned:true,date:{gte:localDate(today,timezone),lt:localDate(addDaysKey(today,1),timezone)}}});const swim=current.find(s=>s.sport==='swim');assert.ok(swim,'The six-day fixture starts with a current swim.');
 const answers={sleep:5,soreness:1,energy:5,motivation:5,stress:1,sick:false,newPain:false,urgentSymptoms:false,availableMinutes:300};
 let checked=await call(who,'/api/checkin',answers);let p=checked.prescriptions.find(p=>p.sessionId===swim.id);assert.ok(p?.canonical);assert.equal(p.canonical.capability.available,false);
 const blocked=await call(who,`/api/workout/approve?sessionId=${swim.id}`,undefined,422);assert.equal(blocked.code,'workout_structure_required');assert.ok(blocked.remediation.href);
 const pool={schemaVersion:1,kind:'pool',poolLength:{value:25,unit:'yd'},steps:[{kind:'lengths',name:'Easy preparation',phase:'warmup',zone:'z1',lengths:8,stroke:'freestyle'},{kind:'lengths',name:'Reviewed aerobic set',phase:'active',zone:'z2',lengths:20,stroke:'freestyle'},{kind:'rest',seconds:30},{kind:'lengths',name:'Easy finish',phase:'cooldown',zone:'z1',lengths:4,stroke:'freestyle'}]};
 // Use the existing authenticated structure writer and its revision/budget guards.
 // This explicit synthetic fixture is not guessed from equipment or prose.
 const metadata=await call(who,`/api/workout/structure?id=${swim.id}`);assert.equal(metadata.editable,true);
 await call(who,`/api/workout/structure?id=${swim.id}`,{id:swim.id,expectedRevision:metadata.revision,sportStructure:pool},200,'PATCH');
 checked=await call(who,'/api/checkin',answers);p=checked.prescriptions.find(p=>p.sessionId===swim.id);assert.equal(p.canonical.verdict,'ready',p.canonical.reason);assert.doesNotMatch(p.canonical.title,/structure review required/i);assert.ok(p.canonical.steps.some(s=>s.target.label.includes('/100 yd')));
 const day=await call(who,'/api/today'),fromToday=day.sessions.find(s=>s.id===swim.id);assert.equal(fromToday.revision,p.revision);assert.deepEqual(fromToday.fuel,p.nutrition.fuel);assert.equal(fromToday.fuel.sodiumMgPerHour,525);
 const reload=await call(who,'/api/checkin'),persisted=reload.prescriptions.find(s=>s.sessionId===swim.id);assert.equal(persisted.revision,p.revision);assert.deepEqual(persisted.nutrition,p.nutrition);
 const response=await fetch(base+`/api/workout/approve?sessionId=${swim.id}&expectedRevision=${p.revision}`,{headers:{cookie:`jmm_session=${who.token}`}});assert.equal(response.status,200);assert.match(response.headers.get('content-disposition'),/\.fit/);const bytes=new Uint8Array(await response.arrayBuffer());assert.ok(bytes.length>100);const decoder=new Decoder(Stream.fromByteArray(bytes));assert.ok(decoder.checkIntegrity());assert.deepEqual(decoder.read().errors,[]);
 await call(other,`/api/workout/approve?sessionId=${swim.id}`,undefined,404);
 checks.push({name:'actual healthy check-in, Today and reload share session revision, CSS and exact fueling; missing pool structure is actionable; explicitly supplied pool structure yields a nonempty parser-validated FIT; foreign athlete access denied',status:'PASS'});
 const browser=await chromium.launch({headless:true});const c=await browser.newContext({viewport:{width:390,height:844}});await c.addCookies([{name:'jmm_session',value:who.token,url:base,httpOnly:true,sameSite:'Lax'}]);const page=await c.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==base){unexpected.push('external');return route.abort();}return route.continue();});
 try{
 for(const [path,name] of [['/today','01-current-session'],['/checkin','02-reloaded-checkin'],['/training','03-saved-cycle'],['/onboard?advanced=1&redo=1&step=zones','04-dated-reference-inputs']]){
  await page.goto(base+path);await page.getByRole('heading',{level:1}).waitFor();
  if(path==='/today'){
   const card=page.locator('#today-workout .uwc[data-revision]');await card.waitFor();
   assert.equal(await card.getAttribute('data-revision'),p.revision);await card.scrollIntoViewIfNeeded();
  }
  if(path==='/checkin'){
   await page.getByRole('status').filter({hasText:'Saved session; review the steps.'}).waitFor();
   assert.match(await page.locator('body').innerText(),/\/100 yd/);assert.doesNotMatch(await page.locator('body').innerText(),/intensity cap z7/);
   const held=checked.prescriptions.find(s=>s.sessionId!==swim.id&&s.nutrition===null);
   if(held){
    await page.getByLabel(/^Session/).selectOption(held.sessionId);assert.equal(await page.getByRole('heading',{name:"Today's Training",exact:true}).count(),0);
    await page.getByLabel(/^Session/).selectOption(swim.id);await page.getByRole('heading',{name:"Today's Training",exact:true}).waitFor();
    checks.push({name:'selecting the held paired session cannot borrow the first session nutrition',status:'PASS'});
   }
  }
  if(path==='/training'){
   await page.getByLabel('View saved month',{exact:true}).waitFor();
   await page.getByText('Loading your saved cycle and sessions…',{exact:true}).waitFor({state:'hidden'});
  }
  if(path.includes('onboard')){
   await page.getByLabel('FTP reference date',{exact:true}).waitFor();
   assert.equal(await page.getByLabel('Running threshold pace',{exact:false}).first().inputValue(),'6:00');
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:dir+'/'+name+'.png',fullPage:path!=='/today'});
 }
 // The same authenticated canonical session is reviewable without leaving chat.
 await page.goto(base+'/coach');
 const composer=page.getByRole('textbox',{name:'Your message',exact:true});await composer.waitFor();
 await page.getByRole('button',{name:'Review today’s workout',exact:true}).click();
 const review=page.getByRole('region',{name:'Protected today review',exact:true});await review.waitFor();
 await review.getByRole('button',{name:fromToday.title+' · '+fromToday.sport,exact:true}).click();
 const chatCard=review.locator('.uwc[data-revision]');await chatCard.waitFor();assert.equal(await chatCard.getAttribute('data-revision'),p.revision);
 const beforeHistory=await call(who,'/api/assistant');assert.equal(beforeHistory.conversation.messages.length,0,'Opening a private card does not persist a summary or a synthetic message');
 const bounds=await composer.boundingBox();assert.ok(bounds&&bounds.y>=0&&bounds.y+bounds.height<=844,'Composer remains in initial mobile viewport');
 await page.screenshot({path:dir+'/06-coach-protected-review.png'});
 await composer.fill("Help me with today's fueling.");await page.getByRole('button',{name:'Send message',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.coach-chat-composer textarea')?.value==='');
 await page.getByRole('region',{name:'Protected today review',exact:true}).waitFor();
 const afterHistory=await call(who,'/api/assistant');assert.equal(afterHistory.conversation.messages.length,2);assert.doesNotMatch(afterHistory.conversation.messages.find(m=>m.role==='assistant').content,/525|330|78|700/,'Private numeric workout evidence is absent from persisted assistant text');
 await page.reload();await composer.waitFor();assert.equal(await page.getByRole('region',{name:'Protected today review',exact:true}).count(),0,'Protected cards are ephemeral');
 const popup=page.getByRole('link',{name:'Open chat in another window',exact:true});assert.equal(await popup.getAttribute('target'),'_blank');assert.equal(await popup.getAttribute('href'),'/coach');
 checks.push({name:'real authenticated mobile chat opens canonical workout/fueling card, keeps composer visible, records only explicit sends, retains no protected card in history, and offers separate-window access',status:'PASS'});
 await page.goto(base+'/today');await page.getByRole('heading',{level:1}).waitFor();
 await page.getByText('Share, device & edit',{exact:true}).first().click();
 const editor=page.getByLabel('Explicit sport structure',{exact:true}).first();await editor.getByRole('button',{name:'Edit steps, sets and rests',exact:true}).click();
 await editor.getByText('Loaded the saved structure.',{exact:true}).waitFor();
 const advanced=editor.getByRole('button',{name:'Advanced options (JSON)',exact:true});if(await advanced.count())await advanced.click();assert.deepEqual(JSON.parse(await editor.getByLabel('Sport structure JSON',{exact:true}).inputValue()),pool);
 await editor.getByLabel('Sport structure JSON',{exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/05-existing-pool-editor.png'});
 const savedStructure=page.waitForResponse(r=>r.url().includes('/api/workout/structure')&&r.request().method()==='PATCH');
 await editor.getByRole('button',{name:'Save reviewed structure',exact:true}).click();const savedResponse=await savedStructure;assert.equal(savedResponse.status(),200);assert.equal((await savedResponse.json()).ok,true);
 checks.push({name:'actual authenticated mobile Today, persisted check-in, saved cycle and dated-reference controls render without overflow or page errors; existing pool editor reloads and saves its explicit structure through HTTP',status:'PASS'});
 }catch(error){writeFileSync(dir+'/failure.txt',await page.locator('body').innerText().catch(()=>''));await page.screenshot({path:dir+'/failure.png',fullPage:true}).catch(()=>{});throw error;}finally{await browser.close();}
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
}
main().catch(e=>{checks.push({name:'acceptance',status:'FAIL',error:String(e)});console.error(e);process.exitCode=1;}).finally(async()=>{for(const id of ids)await db.user.delete({where:{id}});await db.$disconnect();writeFileSync(dir+'/report.json',JSON.stringify({checks,errors,unexpected,scope:'Disposable loopback synthetic persona. Original reported dates and Tue–Sun availability are covered by unit tests; integration race dates retain their offsets from the run date. On Monday only, the HTTP fixture explicitly uses Mon–Sat availability to test a current session. Explicit pool fixture is supplied, never inferred. No connected provider, real send, inbox, hardware, coaching efficacy or expert review is certified.'},null,2));});
