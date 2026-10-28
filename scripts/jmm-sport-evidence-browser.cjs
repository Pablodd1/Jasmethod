/** Disposable HTTP/PostgreSQL + mobile acceptance. Never runs against production or provider endpoints. */
const assert=require('node:assert/strict'),{randomUUID,randomBytes,createHash}=require('node:crypto'),{mkdirSync,writeFileSync}=require('node:fs');
const {PrismaClient}=require('@prisma/client'),bcrypt=require('bcryptjs'),{chromium}=require('playwright');
const {hashToken}=require('../src/lib/auth.ts'),{encryptSecret}=require('../src/lib/crypto.ts');
const {garminActivity,parseGarminPush}=require('../src/lib/garmin-ingest.ts'),{storeActivity}=require('../src/lib/activity-store.ts');
for(const key of ['DATABASE_URL','DIRECT_URL']){const u=new URL(process.env[key]||'');assert.equal(u.protocol,'postgresql:');assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55432');assert.equal(u.pathname,'/jmm_launch_integration_test');assert.equal(u.search,'');}
assert.notEqual(process.env.VERCEL_ENV,'production');assert.ok(process.env.NODE_OPTIONS?.includes('jmm-test-egress-guard.cjs'));
const base='http://127.0.0.1:3220',db=new PrismaClient(),ids=[],checks=[],dir='.local/jmm-sport-evidence-browser';mkdirSync(dir,{recursive:true});
const ago=n=>new Date(Date.now()-n*86400000).toISOString().slice(0,10);
async function actor(language='en'){
 const user=await db.user.create({data:{email:'sport-'+randomUUID()+'@example.invalid',name:'Synthetic sport athlete',passwordHash:bcrypt.hashSync(randomBytes(20).toString('hex'),4),language,timezone:'UTC',onboarded:true,
 profile:{create:{units:language==='en'?'imperial':'metric',birthYear:1990}},reminder:{create:{emailEnabled:false,telegramEnabled:false}}}});
 ids.push(user.id);const token=randomBytes(32).toString('hex');await db.authSession.create({data:{userId:user.id,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+3600000)}});return {user,token};
}
async function call(who,body,expected=200,path='/api/sport-evidence'){
 const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(who?{cookie:'jmm_session='+who.token}:{}),origin:base,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});
 const d=await r.json();if(Array.isArray(expected))assert.ok(expected.includes(r.status),JSON.stringify(d));else assert.equal(r.status,expected,JSON.stringify(d));return d;
}
const manual=(extra={})=>({sport:'bike',date:ago(1),mode:'distance_speed',distance:'10',distanceUnit:'mi',duration:'',speed:'20',speedUnit:'mph',durationBasis:'elapsed',...extra});
async function backend(){
 const a=await actor(),b=await actor();await call(null,undefined,401);await call(a,undefined,403,'/api/sport-evidence?athleteId='+b.user.id);
 for(const [origin,type,body,status] of [['https://foreign.example.invalid','application/json','{}',403],[base,'text/plain','{}',415],[base,'application/json',' '.repeat(9000),413],[base,'application/json','{',400]]){
   const response=await fetch(base+'/api/sport-evidence',{method:'POST',headers:{cookie:'jmm_session='+a.token,origin,'Content-Type':type},body});assert.equal(response.status,status);
 }
 const remote='synthetic-'+randomUUID();await db.connector.create({data:{userId:a.user.id,provider:'garmin_direct',status:'connected',externalRef:remote,scope:'ACTIVITY_EXPORT',tokenEnc:encryptSecret('synthetic-unused-token')}});
 for(const [sport,type,meters,seconds] of [['bike','CYCLING',30000,3591],['swim','LAP_SWIMMING',1250,2000],['run','RUNNING',5000,1500]]){
   const raw={userId:remote,summaryId:'exact-'+sport,activityType:type,startTimeInSeconds:new Date(ago(1)+'T10:00Z').getTime()/1000,durationInSeconds:seconds,distanceInMeters:meters,averageHeartRateInBeatsPerMinute:140,startingLatitudeInDegree:10.12345};
   await storeActivity(a.user.id,'UTC',garminActivity(parseGarminPush({activities:[raw]})[0]));
 }
 const legacyRaw={userId:remote,summaryId:'legacy-bike',activityType:'CYCLING',startTimeInSeconds:new Date(ago(1)+'T11:00Z').getTime()/1000,durationInSeconds:3591,distanceInMeters:30000};
 const summary=parseGarminPush({activities:[legacyRaw]})[0],legacy=garminActivity(summary);delete legacy.actualDetails;await storeActivity(a.user.id,'UTC',legacy);
 const prefix='garmin:'+createHash('sha256').update(a.user.id+':'+remote+':activities:legacy-bike').digest('hex')+':';
 await db.syncJob.create({data:{userId:a.user.id,kind:'garmin.data.v1',status:'done',dedupeKey:prefix+summary.digest,payload:encryptSecret(JSON.stringify(summary))}});
 const view=await call(a);for(const sport of view.sports)assert.equal(sport.records[0].precision,'exact');
 assert.equal(view.sports.find(s=>s.sport==='bike').records[0].durationSeconds,3591);assert.equal(view.sports.find(s=>s.sport==='swim').records[0].environment,'pool');assert.doesNotMatch(JSON.stringify(view),/startingLatitude|synthetic-unused-token|providerUserId/);
 const untouched=await db.workout.findFirstOrThrow({where:{userId:a.user.id,externalId:'garmin:legacy-bike'}});assert.equal(untouched.actualDetails,null);
 checks.push({name:'exact Garmin persistence and authorized legacy archive recovery; separate sports; no raw location/credential leakage or read-time writes',status:'PASS'});
 const requestId=randomUUID(),before=await db.workout.count({where:{userId:a.user.id}}),preview=await call(a,{mode:'preview',requestId,entry:manual()});
 assert.equal(await db.workout.count({where:{userId:a.user.id}}),before);assert.equal(preview.preview.measurements.durationSeconds,1800);
 await call(a,{mode:'save',requestId,entry:manual(),confirmed:false,previewToken:preview.previewToken},409);
 const save={mode:'save',requestId,entry:manual(),confirmed:true,previewToken:preview.previewToken},saved=await call(a,save,201),repeat=await call(a,save);assert.equal(saved.workoutId,repeat.workoutId);assert.equal(repeat.duplicate,true);
 await call(a,{...save,entry:manual({speed:'25'})},409);assert.equal(await db.workout.count({where:{userId:a.user.id}}),before+1);
 const anchors=await db.athleteProfile.findUniqueOrThrow({where:{userId:a.user.id}});assert.equal(anchors.ftp,null);assert.equal(anchors.runPaceBase,null);assert.equal(anchors.swimPaceBase,null);
 const missing=await db.workout.create({data:{userId:a.user.id,date:new Date(ago(2)+'T12:00Z'),sport:'run',type:'endurance',title:'Synthetic distance gap',source:'fit',durationMin:30,actualDurationMin:30,planned:false,completed:true}});
 const missingView=(await call(a)).sports.find(s=>s.sport==='run').records.find(r=>r.id===missing.id);
 const gap={mode:'preview-distance',workoutId:missing.id,expectedRevision:missingView.revision,requestId:randomUUID(),distance:'6',distanceUnit:'km'},gapPreview=await call(a,gap);
 assert.equal(gapPreview.preview.averageSpeedKmh,12);await call(b,gap,404);const gapSave={...gap,mode:'save-distance',confirmed:true,previewToken:gapPreview.previewToken};
 const count=await db.workout.count({where:{userId:a.user.id}});await call(a,gapSave);assert.equal((await call(a,gapSave)).duplicate,true);assert.equal(await db.workout.count({where:{userId:a.user.id}}),count);
 const original=await db.workout.findUniqueOrThrow({where:{id:missing.id}});assert.equal(original.distanceKm,null);assert.equal(original.source,'fit');assert.equal(JSON.parse(original.actualDetails).values.distanceKm,6);
 const filled=(await call(a)).sports.find(s=>s.sport==='run').records.find(r=>r.id===missing.id);assert.equal(filled.distanceKm,6);assert.equal(filled.averageSpeedKmh,12);assert.equal(filled.manualAnnotations,true);
 await call(a,{...gap,requestId:randomUUID()},409);
 checks.push({name:'manual two-input calculation, explicit confirmation, idempotency, unchanged thresholds, missing-distance completion without a duplicate activity, stale and foreign-activity denial',status:'PASS'});
 const concurrent=await actor(),id=randomUUID(),p=await call(concurrent,{mode:'preview',requestId:id,entry:manual()});
 const outcomes=await Promise.all([1,2].map(()=>call(concurrent,{mode:'save',requestId:id,entry:manual(),previewToken:p.previewToken,confirmed:true},[201,200])));
 assert.equal(outcomes[0].workoutId,outcomes[1].workoutId);assert.equal(await db.workout.count({where:{userId:concurrent.user.id}}),1);
 return a;
}
async function browserJourney(browser,language){
 const who=await actor(language),es=language==='es',context=await browser.newContext({viewport:{width:390,height:844},locale:es?'es-ES':'en-US'}),page=await context.newPage(),errors=[],external=[];
 await context.addCookies([{name:'jmm_session',value:who.token,url:base,httpOnly:true,sameSite:'Lax'}]);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():(external.push('external request'),r.abort()));
 try{
   await page.goto(base+'/sport-data');const panel=page.getByRole('region',{name:es?'Datos separados por deporte':'Separate sport data'});await panel.waitFor();
   const cases=[['bike',es?'Ciclismo':'Bike','distance_speed','10','20','',32.18688],['swim',es?'Natación':'Swim','distance_duration',es?'1500':'1640.41994750656','','0:30:00',3],['run',es?'Carrera':'Run','duration_speed','','12','0:30:00',es?12:19.312128]];
   for(const [sport,label,mode,distance,speed,duration,canonicalSpeed] of cases){
     await panel.getByRole('button',{name:label,exact:true}).click();await panel.getByRole('button',{name:es?'Añadir '+label+' manualmente':'Add '+label+' manually',exact:true}).click();
     const form=panel.getByRole('form',{name:es?'Actividad deportiva manual':'Manual sport activity'});
     await form.getByLabel(es?'Fecha local de la actividad':'Local activity date',{exact:true}).fill(ago(1));
     await form.getByLabel(es?'Dos medidas que conoces':'Two measurements you know',{exact:true}).selectOption(mode);
     if(distance)await form.getByLabel(es?'Distancia real':'Actual distance',{exact:true}).fill(distance);
     if(speed)await form.getByLabel(es?'Velocidad media':'Average speed',{exact:true}).fill(speed);
     if(duration)await form.getByLabel(es?'Duración real (h:mm:ss o m:ss)':'Actual duration (h:mm:ss or m:ss)',{exact:true}).fill(duration);
     // Explicit unit choices keep the same bike example across languages.
     if(sport==='bike'){await form.getByRole('combobox').nth(1).selectOption('mi');await form.getByLabel(es?'Distancia real':'Actual distance',{exact:true}).fill('10');await form.getByRole('combobox').nth(2).selectOption('mph');await form.getByLabel(es?'Velocidad media':'Average speed',{exact:true}).fill('20');}
     await form.getByLabel(es?'¿Qué duración usa esta velocidad/tiempo?':'Which duration does this speed/time use?',{exact:true}).selectOption('elapsed');
     await form.getByRole('button',{name:es?'Revisar cálculo':'Review calculation',exact:true}).click();
     const review=panel.getByRole('region',{name:es?'Revisar cálculo deportivo':'Review sport calculation'});await review.waitFor();assert.equal(await db.workout.count({where:{userId:who.user.id,sport}}),0);
     await review.scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/'+sport+'-review-'+language+'-390.png',fullPage:false});
     const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/sport-evidence'&&r.request().method()==='POST');
     await review.getByRole('button',{name:es?'Confirmar y guardar actividad':'Confirm and save activity',exact:true}).click();assert.equal((await response).status(),201);
     await page.reload();await panel.getByRole('button',{name:label,exact:true}).click();await panel.getByText(es?'Última observación de velocidad disponible':'Latest available speed observation',{exact:true}).waitFor();
     const stored=await db.workout.findFirstOrThrow({where:{userId:who.user.id,sport}}),measured=JSON.parse(stored.actualDetails).sportEvidence;assert.ok(Math.abs(measured.averageSpeedKmh-canonicalSpeed)<1e-7);
     await panel.getByText((canonicalSpeed*(es?1:1/1.609344)).toFixed(2)+' '+(es?'km/h':'mph'),{exact:true}).waitFor();
     await panel.scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/'+sport+'-saved-'+language+'-390.png',fullPage:false});
   }
   assert.equal(await db.workout.count({where:{userId:who.user.id}}),3);
   const existing=await db.workout.create({data:{userId:who.user.id,date:new Date(ago(2)+'T09:00Z'),sport:'bike',type:'endurance',title:'Synthetic missing quantity',source:'fit',planned:false,completed:true,durationMin:32,actualDurationMin:32}});
   await page.reload();await panel.getByText(es?'Última observación de velocidad disponible':'Latest available speed observation',{exact:true}).waitFor();
   await panel.getByText(es?'Entrenamiento reciente y fuentes':'Recent training and source details',{exact:true}).click();
   await panel.getByRole('button',{name:es?'Añadir distancia pendiente':'Add missing distance',exact:true}).click();
   const gapForm=panel.getByRole('form',{name:es?'Completar actividad existente':'Complete existing activity'});
   await gapForm.getByLabel(es?'Distancia real pendiente':'Missing actual distance',{exact:true}).fill(es?'16':'10');
   await gapForm.getByRole('button',{name:es?'Revisar distancia pendiente':'Review missing distance',exact:true}).click();
   const confirmGap=gapForm.getByRole('button',{name:es?'Confirmar distancia':'Confirm distance update',exact:true});await confirmGap.waitFor();
   const failSave=async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON()?.mode==='save-distance')return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'Synthetic save unavailable'})});return route.continue();};
   await page.route(base+'/api/sport-evidence',failSave);await confirmGap.click();await panel.getByRole('alert').filter({hasText:'Synthetic save unavailable'}).waitFor();
   assert.equal((await db.workout.findUniqueOrThrow({where:{id:existing.id}})).actualDetails,null);assert.equal(await db.workout.count({where:{userId:who.user.id}}),4);
   await page.unroute(base+'/api/sport-evidence',failSave);const receipt=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/sport-evidence'&&r.request().method()==='POST');await confirmGap.click();assert.equal((await receipt).status(),200);
   await page.reload();await panel.getByText(es?'Última observación de velocidad disponible':'Latest available speed observation',{exact:true}).waitFor();await panel.getByText(es?'Entrenamiento reciente y fuentes':'Recent training and source details',{exact:true}).click();
   const annotated=panel.getByText(es?/fit \+ anotaciones manuales/:/fit \+ manual annotations/);await annotated.waitFor();await annotated.scrollIntoViewIfNeeded();await page.screenshot({path:dir+'/existing-distance-'+language+'-390.png',fullPage:false});
   assert.equal(await db.workout.count({where:{userId:who.user.id}}),4);const updated=await db.workout.findUniqueOrThrow({where:{id:existing.id}});assert.equal(updated.distanceKm,null);assert.ok(Math.abs(JSON.parse(updated.actualDetails).values.distanceKm-(es?16:16.09344))<1e-8);
   await panel.getByLabel(es?'Unidades de velocidad mostrada':'Speed display units',{exact:true}).selectOption(es?'imperial':'metric');
   await panel.getByText(es?'20.00 mph':'32.19 km/h',{exact:true}).waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
   checks.push({name:language+' 390px separate bike/swim/run, explicit units, no-write preview, confirmed save and reload',status:'PASS'});
 }catch(e){checks.push({name:language+' mobile',status:'FAIL',error:String(e),errors,external});await page.screenshot({path:dir+'/failure-'+language+'.png',fullPage:true}).catch(()=>{});throw e;}finally{await context.close();}
}
async function garminJourney(browser,who){
 const context=await browser.newContext({viewport:{width:390,height:844}});await context.addCookies([{name:'jmm_session',value:who.token,url:base,httpOnly:true,sameSite:'Lax'}]);const page=await context.newPage();
 await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 try{
   await page.goto(base+'/sport-data');const panel=page.getByRole('region',{name:'Separate sport data'});await panel.getByText('Latest available speed observation',{exact:true}).waitFor();
   for(const [sport,label] of [['bike','Bike'],['swim','Swim'],['run','Run']]){
     await panel.getByRole('button',{name:label,exact:true}).click();assert.equal(await panel.getByRole('form').count(),0);
     await panel.locator('p').filter({hasText:/^Garmin ·/}).first().waitFor();await page.screenshot({path:dir+'/garmin-'+sport+'-available-390.png',fullPage:false});
   }
   checks.push({name:'available Garmin bike/swim/run measurements appear without opening a manual questionnaire',status:'PASS'});
 }finally{await context.close();}
}
async function main(){const garmin=await backend();const browser=await chromium.launch({headless:true});try{await garminJourney(browser,garmin);for(const lang of ['en','es'])await browserJourney(browser,lang);}finally{await browser.close();}}
main().catch(e=>{console.error(e);checks.push({name:'acceptance',status:'FAIL',error:String(e)});process.exitCode=1;}).finally(async()=>{try{await db.user.deleteMany({where:{id:{in:ids}}});}finally{await db.$disconnect();writeFileSync(dir+'/report.json',JSON.stringify({syntheticOnly:true,scope:'Real HTTP/PostgreSQL and Chromium. No provider traffic, production writes or physiological validation.',checks},null,2));}});
