/** Synthetic, API-mocked browser acceptance. No real accounts, provider calls or writes. */
const assert = require('node:assert/strict');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { chromium } = require('playwright');
const { universalWorkoutExample } = require('../src/lib/universal-workout-example.ts');
const { buildUniversalWorkoutCard } = require('../src/lib/universal-workout-card-server.ts');
const base = process.env.JMM_UI_TEST_BASE || 'http://127.0.0.1:3230';
assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(base), 'Only an isolated loopback app is allowed');
const dir = '.local/jmm-live-repair-browser'; mkdirSync(dir, { recursive: true });
const results = [], errors = [], unexpected = [], geometry = [];
const { historySafeLocalReply } = require('../src/lib/ai-data-policy.ts');
const { calendarWorkoutView } = require('../src/lib/calendar-workouts.ts');
const today = new Date().toISOString().slice(0, 10);
const reason = "Training is on hold until today's safety, recovery and available-time answers are known. Missing: sleep, soreness, motivation, energy, stress, sick, newPain, urgentSymptoms, availableMin. Unknown or skipped answers are not evidence of readiness. No device data is required.";
function fixtures(language) {
  const source = universalWorkoutExample(language);
  source.session.dateLocal = today;
  const card = buildUniversalWorkoutCard({ ...source.session, title: 'Synthetic saved training with a long review explanation', verdict: 'blocked', reason, durationMin: 0, exactTimeSeconds: null, steps: [], capability: { ...source.session.capability, available: false, reason } }, null, language);
  const daily = JSON.parse(readFileSync('src/components/daily-training/sample-session.json', 'utf8'));
  daily.language = language; daily.workoutCard = card; daily.blocks = [];
  daily.session = { ...daily.session, id: source.session.id, dateLocal: today, sport: 'run', title: card.session.title, subtitle: reason, totalMinutes: 0, verdict: 'blocked', sourceRevision: card.session.revision, capability: card.session.capability };
  daily.completion = { focusReady: false, submittedAt: null, actual: null };
  daily.sessions = [{ id: source.session.id, title: card.session.title, sport: 'run', startTime: null }];
  const { title, sport, dateLocal, timezone, durationMin, exactTimeSeconds, steps } = source.session;
  const preview = { kind: 'saved_plan_preview', sessionId: source.session.id, available: true, reason: 'Synthetic saved plan preview only.', session: { title, sport, dateLocal, timezone, durationMin, exactTimeSeconds, steps: steps.map(({name,seconds,zone,phase,endpoint,target,note,group,componentSport})=>({name,seconds,zone,phase,endpoint,target,...(note?{note}:{}),...(group?{group}:{}),...(componentSport?{componentSport}:{})})) } };
  const workout = { id: source.session.id, title: card.session.title, date: `${today}T12:00:00Z`, sport: 'run', durationMin: 56, intensity: 'z2', completed: false, approved: false, planned: true, type: 'endurance', prescription: null, startTime: null, feedbackStatus: null };
  const plan = { id: 'synthetic-plan', name: 'Synthetic saved cycle', status: 'active', startDate: `${today}T12:00:00Z`, weeks: 12, days: [{ id: 'synthetic-day', date: `${today}T12:00:00Z`, week: 1, dayOff: false, sessions: [workout] }] };
  return { card, daily, preview, plan, user: { id: 'synthetic-athlete', name: 'Synthetic athlete', email: 'athlete@example.invalid', role: 'athlete', language, timezone: 'UTC', onboarded: true } };
}
async function main() {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
  try {
    for (const language of ['en', 'es']) for (const width of [390, 412, 1173]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      await context.addInitScript(() => {
        window.__speechMode = 'denied';
        class SyntheticSpeech {
          start() { if (window.__speechMode === 'denied') throw new DOMException('Synthetic denial', 'NotAllowedError'); this.onresult?.({results:[{isFinal:true,0:{transcript:'Synthetic reviewed question',confidence:1}}]}); this.onend?.(); }
          stop() { this.onend?.(); } abort() {}
        }
        window.SpeechRecognition = SyntheticSpeech;
        window.webkitSpeechRecognition = SyntheticSpeech;
      });
      const page = await context.newPage(), f = fixtures(language);
      const history = []; let sends = 0;
      page.on('pageerror', error => errors.push(String(error)));
      let planRelease, profileFailure = false, todayState = "error";
      await page.route('**/api/**', async route => {
        const url = new URL(route.request().url()), path = url.pathname;
        if (route.request().method() === 'POST' && path === '/api/assistant') {
          const input = route.request().postDataJSON(); sends++;
          assert.equal(input.externalConsent, false); assert.ok(input.clientRequestId);
          const answer = historySafeLocalReply('',language,true);
          history.push({id:'synthetic-user',role:'user',content:input.message,createdAt:new Date().toISOString(),source:'text',clientRequestId:input.clientRequestId},{id:'synthetic-assistant',role:'assistant',content:answer,createdAt:new Date().toISOString(),source:'local'});
          return route.fulfill({json:{ok:true,conversation:{id:'synthetic-conversation',messages:history},proposal:null}});
        }
        if (route.request().method() !== 'GET') { unexpected.push(`${route.request().method()} ${path}`); return route.fulfill({status: 500, json: { error: 'Mutations are forbidden in this fixture' }}); }
        if (path === '/api/auth/me') return route.fulfill({json:{user:f.user}});
        if (path === '/api/today') return route.fulfill(todayState === 'error' ? {status:503,json:{error:'Synthetic unavailable'}} : {json:{date:today,sessions:todayState === 'empty' ? [] : [{id:f.card.session.id,title:f.card.session.title,sport:f.card.session.sport}]}});
        if (path === '/api/assistant') return route.fulfill({json:{ok:true,conversation:{id:'synthetic-conversation',messages:history},proposal:null,sessions:[],capabilities:{externalAi:false,imageUnderstanding:false,textProvider:null,imageProvider:null}}});
        if (path === '/api/v1/training/today') return route.fulfill({json:f.daily});
        if (path.endsWith('/preview')) return route.fulfill({json:f.preview});
        if (path.endsWith('/card')) return route.fulfill({json:f.card});
        if (path === '/api/plan') { if (planRelease) await planRelease; return route.fulfill({json:{plans:[f.plan],cycle:null}}); }
        if (path === '/api/profile') return route.fulfill(profileFailure ? {status:503,json:{error:'Synthetic profile unavailable'}} : {json:{profile:{goal:'run-only'},zones:null,setup:{planWeeks:12},planningReadiness:{ready:false,missing:[],review:[]}}});
        return route.fulfill({json:{ok:true}});
      });
      await page.goto(`${base}/coach`);
      const textarea = page.locator('textarea').first(); await textarea.waitFor({state:'visible'});
      await page.waitForFunction(()=>document.querySelector('textarea')?.disabled===false);
      assert.equal(await textarea.isDisabled(), false, 'Composer becomes usable');
      assert.equal(await page.getByRole('button', {name: language === 'es' ? /^Enviar mensaje$/ : /^Send message$/}).isDisabled(), true, 'Empty submit stays disabled');
      const dictation = page.getByRole('button', {name: language === 'es' ? 'Micrófono' : 'Microphone', exact:true}).first();
      if (await dictation.count()) assert.equal(await dictation.isVisible(), true, 'Dictation entry is outside closed tools');
      else assert.match(await page.locator('body').innerText(), language === 'es' ? /dictado.*(?:disponible|compatible)/i : /dictation.*(?:available|supported)/i);
      await dictation.click();
      await page.getByRole('alert').filter({hasText: language === 'es' ? /micrófono/i : /microphone/i}).waitFor({state:'visible'});
      assert.equal(await textarea.isDisabled(), false, 'Denied microphone leaves typing available');
      await page.evaluate(() => { window.__speechMode = 'transcript'; });
      await dictation.click();
      const transcript = page.getByLabel(language === 'es' ? /Revisa y corrige la transcripción/ : /Review and correct the transcript/).first();
      await transcript.waitFor({state:'visible'});
      assert.equal(sends, 0, 'Dictation never auto-sends');
      await page.getByRole('button',{name: language === 'es' ? /Descartar transcripción/ : /Discard transcript/}).click();
      await textarea.fill(language === 'es' ? 'Explica mi entrenamiento' : 'Explain my workout');
      assert.equal(await page.getByRole('button', {name: language === 'es' ? /^Enviar mensaje$/ : /^Send message$/}).isDisabled(), false, 'Typing enables submit without sending');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Coach has no horizontal overflow');
      await page.getByRole('button', {name: language === 'es' ? /^Enviar mensaje$/ : /^Send message$/}).click();
      await page.getByRole('list', {name:language === 'es' ? 'Historial de conversación' : 'Conversation history'}).getByText(language==='es'?/No se conserva un resumen/:/not retained in chat/).waitFor({state:'visible'});
      assert.equal(sends,1,'One explicit click produces one synthetic send');
      const reviewButton=page.getByRole('button',{name:language==='es'?'Ver entrenamiento de hoy':'Review today’s workout',exact:true});
      await reviewButton.click();
      const privateReview=page.getByRole('region',{name:language==='es'?'Revisión protegida de hoy':'Protected today review',exact:true});
      await privateReview.getByRole('alert').waitFor();todayState='empty';
      await privateReview.getByRole('button',{name:language==='es'?'Reintentar':'Retry',exact:true}).click();
      await privateReview.getByText(language==='es'?/No hay sesiones guardadas/:/No saved sessions/).waitFor();
      await privateReview.getByRole('button',{name:language==='es'?'Cerrar tarjeta':'Close card',exact:true}).click();todayState='session';await reviewButton.click();
      await privateReview.getByRole('button',{name:f.card.session.title+' · '+f.card.session.sport,exact:true}).click();await privateReview.locator('.uwc').waitFor();
      assert.equal(sends,1,'Read-only card/retry never sends a chat message');
      const rect=await textarea.boundingBox();assert.ok(rect&&rect.y>=0&&rect.y+rect.height<=900,'Composer remains in mobile/desktop viewport after card review');
      await page.screenshot({path:`${dir}/coach-${language}-${width}.png`});
      await page.goto(`${base}/daily`);
      await page.locator('.uwc').first().waitFor({state:'visible'});
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Daily card has no horizontal overflow');
      const header = page.locator('.uwc-header').first();
      assert.doesNotMatch(await header.innerText(), /\b0\s*MIN\b/, 'Held duration is not displayed as a zero-minute workout');
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({path:`${dir}/daily-${language}-${width}.png`});
      const stats = await header.locator('.uwc-stats').evaluate(node => {
        const bounds = node.getBoundingClientRect(), walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT), text = [];
        let entry;
        while ((entry = walker.nextNode())) {
          if (!entry.textContent.trim()) continue;
          const range = document.createRange(); range.selectNodeContents(entry);
          const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
          if (!rects.length) continue; // Intentionally hidden compact status sub-label.
          const style = getComputedStyle(entry.parentElement);
          text.push({label:entry.textContent.trim(),fontSize:parseFloat(style.fontSize),lines:new Set(rects.map(rect=>Math.round(rect.top))).size,
            clipped:rects.some(rect=>rect.left < bounds.left - 1 || rect.right > bounds.right + 1)});
        }
        return {width:bounds.width,text};
      });
      geometry.push({language,width,stats});
      const visibleLabels = stats.text.map(item=>item.label);
      assert.ok(visibleLabels.includes(language === 'es' ? 'REVISAR' : 'REVIEW')
        && visibleLabels.includes(language === 'es' ? 'DURACIÓN · EN ESPERA' : 'DURATION · ON HOLD'),
        `Held duration and review labels remain visible: ${JSON.stringify(stats)}`);
      assert.ok(stats.text.length > 0 && stats.text.every(item=>item.lines === 1 && !item.clipped && item.fontSize >= 11),
        `Status labels must be readable single lines without clipping: ${JSON.stringify(stats)}`);
      let release; planRelease = new Promise(resolve=>{release=resolve}); profileFailure = true;
      await page.goto(`${base}/training`); await page.waitForTimeout(700);
      let body = await page.locator('body').innerText();
      assert.doesNotMatch(body, /No training plan yet|Aún no tienes un plan|0\/0/, 'Pending plan never pretends to be empty');
      release(); planRelease = null;
      await page.getByRole('region', {name: language === 'es' ? 'Ciclo de entrenamiento guardado' : 'Saved training cycle'}).waitFor({state:'visible'});
      body = await page.locator('body').innerText(); assert.match(body, /Synthetic saved cycle/, 'Plan survives profile failure');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Training has no horizontal overflow');
      await page.screenshot({path:`${dir}/training-${language}-${width}.png`});
      results.push({language,width,coach:'pass',heldCard:'pass',delayedPlanAndProfileFailure:'pass'});
      await context.close();
    }
    for (const language of ['en','es']) {
      const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage(),f=fixtures(language);
      page.on('pageerror',error=>errors.push(String(error)));
      const es=language==='es',units=es?'metric':'imperial',messages=[];
      let proposal=null,savedReceipt=null,weight=70,writes=0,sends=0;
      const payload=()=>({ok:true,conversation:{id:'synthetic-profile-chat',messages},proposal,receipt:savedReceipt,savedReceipt,displayUnits:units,unitPreference:'auto',capabilities:{externalAi:false,imageUnderstanding:false},sessions:[]});
      await page.route('**/api/**',async route=>{
        const req=route.request(),path=new URL(req.url()).pathname;
        if(path==='/api/auth/me')return route.fulfill({json:{user:f.user}});
        if(path==='/api/assistant'&&req.method()==='GET')return route.fulfill({json:payload()});
        if(path==='/api/assistant'&&req.method()==='POST'){
          const input=req.postDataJSON();sends++;assert.equal(input.externalConsent,false);
          const proposed=Number(/(\d+) kg/.exec(input.message)[1]);
          messages.push({id:`profile-user-${sends}`,role:'user',content:input.message,source:'text',createdAt:new Date().toISOString(),clientRequestId:input.clientRequestId},{id:`profile-reply-${sends}`,role:'assistant',content:es?'Revisa los valores. Todavía no se ha guardado nada.':'Review the values. Nothing has been saved.',source:'local',createdAt:new Date().toISOString()});
          proposal={id:`profile-proposal-${sends}`,revision:1,status:'pending',beforeValues:{weightKg:weight},candidates:[{id:`profile-weight-${sends}`,kind:'profile',field:'weightKg',value:proposed,unit:'kg',observedDate:today,source:'text',evidence:input.message,status:'proposed'}]};
          return route.fulfill({json:payload()});
        }
        if(path==='/api/assistant/confirm'){
          const input=req.postDataJSON();assert.equal(input.confirmed,true);assert.equal(input.expectedRevision,1);assert.equal(input.proposalId,proposal.id);assert.ok(input.idempotencyKey);assert.equal(input.candidates.length,1);assert.equal(input.candidates[0].unit,'kg');assert.ok(Math.abs(input.candidates[0].value-80)<0.00001);
          writes++;savedReceipt={id:'synthetic-profile-receipt',proposalId:proposal.id,confirmedAt:new Date().toISOString(),applied:[{candidateId:proposal.candidates[0].id,kind:'profile',field:'weightKg',previousValue:weight,value:input.candidates[0].value,source:'text',observedDate:today}],pendingActions:['review_checkin']};
          weight=input.candidates[0].value;proposal={...proposal,status:'confirmed',revision:2};return route.fulfill({json:{...payload(),applied:true}});
        }
        if(path==='/api/assistant/cancel'){
          assert.equal(req.postDataJSON().proposalId,proposal.id);proposal={...proposal,status:'cancelled',revision:2};return route.fulfill({json:{...payload(),applied:false,cancelled:true}});
        }
        if(req.method()==='GET')return route.fulfill({json:{ok:true}});
        unexpected.push(`${req.method()} ${path}`);return route.fulfill({status:500,json:{error:'Unexpected synthetic mutation'}});
      });
      await page.goto(`${base}/coach`);
      const send=page.getByRole('button',{name:es?'Enviar mensaje':'Send message',exact:true}),message=page.getByRole('textbox',{name:es?'Tu mensaje':'Your message',exact:true});
      await message.fill('My weight is 75 kg');await send.click();
      const card=page.getByRole('group',{name:es?'Peso corporal':'Body weight',exact:true});await card.waitFor();
      assert.match(await card.innerText(),es?/70\.0 kg/:/154\.3 lb/);assert.match(await card.innerText(),es?/75\.0 kg/:/165\.3 lb/);assert.equal(writes,0);
      const edit=card.getByLabel(es?'Valor (kg)':'Value (lb)',{exact:true});assert.equal(await edit.isDisabled(),true);
      await card.getByRole('button',{name:es?'Editar':'Edit',exact:true}).click();await edit.fill(es?'80':'176.3696');
      await card.getByRole('checkbox',{name:es?'Incluir al confirmar':'Include in confirmation',exact:true}).check();
      assert.equal(writes,0);await page.getByRole('button',{name:es?'Aprobar cambios (1)':'Approve changes (1)',exact:true}).click();
      await page.getByText(es?'Cambios guardados con comprobante':'Saved changes with receipt',{exact:true}).waitFor();assert.equal(writes,1);
      await page.reload();await page.getByText(es?'Cambios guardados con comprobante':'Saved changes with receipt',{exact:true}).waitFor();assert.equal(writes,1);
      await message.fill('My weight is 81 kg');await send.click();await page.getByRole('button',{name:es?'Cancelar':'Cancel',exact:true}).click();
      await page.getByText(es?'Propuesta descartada. Tus datos no han cambiado.':'Proposal dismissed. Your facts have not changed.',{exact:true}).waitFor();
      assert.equal(writes,1);assert.ok(Math.abs(weight-80)<0.00001);await page.getByRole('link',{name:es?'Revisar perfil guardado':'Revise saved profile',exact:true}).waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${dir}/profile-proposal-${language}-390.png`});
      results.push({language,width:390,profileProposalChosenUnits:'pass',noWriteBeforeApproval:'pass',editedExactApproval:'pass',savedReceiptReloadAndCancel:'pass'});await context.close();
    }
    for(const width of [390,412]) {
      const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),f=fixtures('en');
      page.on('pageerror',e=>errors.push(String(e)));
      const messages=[];let sends=0,shares=0;
      const capabilities={externalAi:true,textProvider:'OpenAI',imageUnderstanding:false,imageProvider:null};
      const session={id:'synthetic-action-session',title:'Synthetic review session',sport:'run',date:today};
      let proposal=null;
      await page.route('**/api/**',async route=>{
        const req=route.request(),path=new URL(req.url()).pathname;
        if(path==='/api/auth/me')return route.fulfill({json:{user:f.user}});
        if(path==='/api/assistant'&&req.method()==='GET')return route.fulfill({json:{ok:true,capabilities,conversation:{id:'synthetic-review-chat',messages},proposal,sessions:[session],defaultSessionId:session.id}});
        if(path==='/api/assistant'&&req.method()==='POST') {
          const input=req.postDataJSON();sends++;
          assert.equal(input.externalConsent,true);assert.equal(input.textProviderConsent,'openai');assert.equal(input.sessionId,session.id);
          assert.equal(input.aiReplyMemoryConsent,undefined);
          messages.push({id:`action-user-${sends}`,role:'user',content:input.message,source:'text',createdAt:new Date().toISOString(),clientRequestId:input.clientRequestId});
          messages.push({id:`action-answer-${sends}`,role:'assistant',content:'Synthetic local review: check the proposed duration before confirming. Nothing has been saved.',source:'local',needsHumanReview:true,createdAt:new Date().toISOString()});
          if(sends===1)proposal={id:'synthetic-review-proposal',revision:1,status:'pending',candidates:[{id:'duration-change',kind:'workout_plan',field:'durationMin',value:30,unit:'min',observedDate:today,source:'text',evidence:input.message,sessionId:session.id,status:'proposed'}]};
          return route.fulfill({json:{ok:true,capabilities,conversation:{id:'synthetic-review-chat',messages},proposal,mode:'coach_local',externalStatus:'policy_local'}});
        }
        if(path==='/api/assistant/escalate'&&req.method()==='POST') {
          const input=req.postDataJSON();shares++;assert.equal(input.confirmed,true);assert.equal(input.notifyAdmin,false);assert.equal(input.sourceMessageId,'action-user-2');assert.equal(input.question,'Synthetic question reviewed for the human coach.');
          return route.fulfill({json:{ok:true,sharedMessageId:'synthetic-shared-question',notificationStatus:'not_requested'}});
        }
        unexpected.push(`${req.method()} ${path}`);return route.fulfill({status:500,json:{error:'Unexpected synthetic operation'}});
      });
      await page.goto(`${base}/coach`);
      await page.getByText('Optional tools: logging, images & AI',{exact:true}).click();
      const ai=page.getByLabel('Use OpenAI only for general education while this page is open',{exact:true});await ai.waitFor();
      assert.equal(await ai.isChecked(),false);await ai.check();
      const memory=page.getByLabel(/Also include up to two previous OpenAI replies/);assert.equal(await memory.count(),0);
      await page.getByRole('textbox',{name:'Your message',exact:true}).fill('Make this session half an hour');
      await page.getByRole('button',{name:'Send message',exact:true}).click();
      await page.getByText('Review 1 proposed facts · Not saved',{exact:true}).waitFor({state:'visible'});
      assert.equal(await page.getByRole('button',{name:'Approve changes (0)',exact:true}).isDisabled(),true);
      assert.equal(await page.getByLabel('Value (min)',{exact:true}).isVisible(),true,'Proposal is expanded without another click');
      assert.equal(await ai.isChecked(),true,'Page permission persists after a send');
      await page.getByRole('textbox',{name:'Your message',exact:true}).fill('Why do you recommend that?');await page.getByRole('button',{name:'Send message',exact:true}).click();
      await page.getByRole('list',{name:'Conversation history',exact:true}).getByText('Why do you recommend that?',{exact:true}).waitFor({state:'visible'});
      await page.getByRole('button',{name:'Ask a human coach',exact:true}).click();
      await page.getByLabel('Question for the coach',{exact:true}).fill('Synthetic question reviewed for the human coach.');
      await page.getByRole('button',{name:'Confirm and share question',exact:true}).click();
      await page.getByText(/Question saved for your authorized coaches and administrator/).waitFor({state:'visible'});
      assert.equal(sends,2);assert.equal(shares,1);assert.equal(await ai.isChecked(),true);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:`${dir}/confirmed-actions-${width}.png`});
      await page.reload();await ai.waitFor();assert.equal(await ai.isChecked(),false);assert.equal(await memory.count(),0);
      results.push({width,confirmedActionReview:'pass',pageScopedAiConsent:'pass',legacyMemoryAbsent:'pass',humanHandoff:'pass'});
      await context.close();
    }
    {
      const context=await browser.newContext({viewport:{width:390,height:900}}),page=await context.newPage(),f=fixtures('en');let saves=0;
      let state={profile:{goal:'run-only'},zones:null,revision:'synthetic-profile-1',setupRevision:'synthetic-setup-1',setup:{planWeeks:12,restPreference:'level_default',confirmedAt:'2020-01-01T00:00:00.000Z'},planningReadiness:{ready:false,missing:[],review:[]}};
      page.on('pageerror',e=>errors.push(String(e)));
      await page.route('**/api/**',async route=>{
        const req=route.request(),path=new URL(req.url()).pathname;
        if(path==='/api/profile'&&req.method()==='PUT'){const b=req.postDataJSON();assert.deepEqual(Object.keys(b).sort(),['expectedRevision','expectedSetupRevision','setup','setupSection']);assert.equal(b.setupSection,'schedule');assert.deepEqual(b.setup,{restPreference:'no_fixed_rest'});saves++;state={...state,setupRevision:'synthetic-setup-2',setup:{...state.setup,restPreference:b.setup.restPreference}};return route.fulfill({json:{ok:true,...state}});}
        if(req.method()!=='GET'){unexpected.push(`${req.method()} ${path}`);return route.fulfill({status:500,json:{error:'Unexpected synthetic write'}});}
        if(path==='/api/auth/me')return route.fulfill({json:{user:f.user}});
        if(path==='/api/profile')return route.fulfill({json:state});
        if(path==='/api/plan')return route.fulfill({json:{plans:[f.plan],cycle:null}});
        if(path.endsWith('/preview'))return route.fulfill({json:f.preview});
        return route.fulfill({json:{ok:true}});
      });
      await page.goto(`${base}/training`);await page.getByText('Targets & rest days',{exact:true}).click();const choice=page.getByRole('combobox',{name:'Rest-day preference',exact:true});await choice.waitFor();await choice.selectOption('no_fixed_rest');await page.getByRole('button',{name:'Save rest-day preference',exact:true}).click();await page.getByText(/Preference saved. Preview and confirm a replacement plan/).waitFor();assert.equal(saves,1);assert.equal(state.setup.confirmedAt,'2020-01-01T00:00:00.000Z');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${dir}/rest-preference-390.png`});
      await page.reload();await page.getByText('Targets & rest days',{exact:true}).click();await choice.waitFor();await page.waitForFunction(()=>{const el=document.querySelector('select[aria-label="Rest-day preference"]');return el&&!el.disabled;});assert.equal(await choice.inputValue(),'no_fixed_rest');results.push({width:390,restPreferenceSave:'pass',noSilentPlanReplacement:'pass'});await context.close();
    }
    for(const width of [390,1173]){
      const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),f=fixtures('en');page.on('pageerror',e=>errors.push(String(e)));
      const primary={...f.plan.days[0].sessions[0],userId:f.user.id,source:'manual',planDay:{plan:{id:f.plan.id,status:'active',userId:f.user.id}}};
      const secondary={...primary,id:'synthetic-secondary',title:'Synthetic second easy practice',durationMin:18};
      const old={...primary,id:'synthetic-old',title:'Obsolete duplicate session',planDay:{plan:{id:'synthetic-archived',status:'archived',userId:f.user.id}}};
      const sources=['strava','whoop'].map((source,i)=>({...primary,id:`synthetic-${source}`,title:`Synthetic ${source} source`,source,planDay:null,planned:false,completed:true,actualDurationMin:40+i,date:`${today}T08:00:00Z`}));
      const view=calendarWorkoutView([primary,secondary,old,...sources],f.user.id,f.plan.id);assert.equal(view.hiddenUnperformed,1);
      f.plan.days[0].sessions=[primary,secondary];
      await page.route('**/api/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;if(req.method()!=='GET'){unexpected.push(`${req.method()} ${path}`);return route.fulfill({status:500,json:{error:'Unexpected synthetic write'}});}if(path==='/api/auth/me')return route.fulfill({json:{user:f.user}});if(path==='/api/calendar')return route.fulfill({json:{events:[],races:[],...view,calendarReview:view,plan:f.plan}});return route.fulfill({json:{ok:true}});});
      await page.goto(`${base}/calendar`);await page.getByText(/Possible device copies are bundled for review/).waitFor();assert.equal(await page.getByText('Obsolete duplicate session',{exact:true}).count(),0);
      const day=page.getByRole('button',{name:new RegExp('^'+Number(today.slice(-2))+' ')});await day.click();await page.getByText('Reported · strava',{exact:true}).waitFor();await page.getByText('Reported · whoop',{exact:true}).waitFor();for(const source of ['strava','whoop']){const record=page.getByTestId(`calendar-session-synthetic-${source}`);assert.match(await record.innerText(),/Reported record, not a prescription/);assert.doesNotMatch(await record.innerText(),/WARM-UP|MAIN SET|COOL-DOWN/);assert.equal(await record.getByRole('button',{name:'Move',exact:true}).count(),0);}assert.equal(await page.getByText('Synthetic second easy practice',{exact:true}).count()>0,true);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${dir}/calendar-overlap-${width}.png`});await page.getByRole('button',{name:'Close day details',exact:true}).click();results.push({width,calendarActiveCycleOnly:'pass',calendarCopyBundle:'pass',sourceRecordsPreserved:'pass',noInventedActivitySteps:'pass'});await context.close();
    }
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  } finally { await browser.close(); writeFileSync(`${dir}/report.json`,JSON.stringify({results,errors,unexpected,geometry,scope:'API-mocked synthetic Chromium only; no production data or API writes, actual microphone or network provider acceptance; coach sends are intercepted synthetic fixtures'},null,2)); }
  console.log(`${results.length} EN/ES viewport journeys passed; no page errors or unexpected API writes (coach sends intercepted synthetically).`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
