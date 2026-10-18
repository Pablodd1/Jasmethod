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
const { buildCoachReply } = require('../src/lib/coach-conversation.ts');
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
      let planRelease, profileFailure = false;
      await page.route('**/api/**', async route => {
        const url = new URL(route.request().url()), path = url.pathname;
        if (route.request().method() === 'POST' && path === '/api/assistant') {
          const input = route.request().postDataJSON(); sends++;
          assert.equal(input.externalConsent, false); assert.ok(input.clientRequestId);
          const answer = buildCoachReply(input.message, {localToday:today,language,savedTodaySessions:[{date:today,title:'Synthetic saved run',sport:'run',durationMin:56,completed:false}]}).answer;
          history.push({id:'synthetic-user',role:'user',content:input.message,createdAt:new Date().toISOString(),source:'text',clientRequestId:input.clientRequestId},{id:'synthetic-assistant',role:'assistant',content:answer,createdAt:new Date().toISOString(),source:'local'});
          return route.fulfill({json:{ok:true,conversation:{id:'synthetic-conversation',messages:history},proposal:null}});
        }
        if (route.request().method() !== 'GET') { unexpected.push(`${route.request().method()} ${path}`); return route.fulfill({status: 500, json: { error: 'Mutations are forbidden in this fixture' }}); }
        if (path === '/api/auth/me') return route.fulfill({json:{user:f.user}});
        if (path === '/api/assistant') return route.fulfill({json:{ok:true,conversation:{id:'synthetic-conversation',messages:history},proposal:null,sessions:[],capabilities:{externalAi:false,imageUnderstanding:false,textProvider:null,imageProvider:null}}});
        if (path === '/api/v1/training/today') return route.fulfill({json:f.daily});
        if (path.endsWith('/preview')) return route.fulfill({json:f.preview});
        if (path.endsWith('/card')) return route.fulfill({json:f.card});
        if (path === '/api/plan') { if (planRelease) await planRelease; return route.fulfill({json:{plans:[f.plan],cycle:null}}); }
        if (path === '/api/profile') return route.fulfill(profileFailure ? {status:503,json:{error:'Synthetic profile unavailable'}} : {json:{profile:{goal:'run-only'},zones:null,setup:{planWeeks:12},planningReadiness:{ready:false,missing:[],review:[]}}});
        return route.fulfill({json:{ok:true}});
      });
      await page.goto(`${base}/coach`);
      const textarea = page.locator('textarea').first(); await textarea.waitFor({state:'visible'}); await page.waitForTimeout(200);
      assert.equal(await textarea.isDisabled(), false, 'Composer becomes usable');
      assert.equal(await page.getByRole('button', {name: language === 'es' ? /^Enviar mensaje$/ : /^Send message$/}).isDisabled(), true, 'Empty submit stays disabled');
      const dictation = page.getByRole('button', {name: language === 'es' ? /dictado|dictar/i : /dictat/i}).first();
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
      await page.getByRole('list', {name:language === 'es' ? 'Historial de conversación' : 'Conversation history'}).getByText(/Synthetic saved run: 56 min/).waitFor({state:'visible'});
      assert.equal(sends,1,'One explicit click produces one synthetic send');
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
        && visibleLabels.includes(language === 'es' ? 'MIN · EN ESPERA' : 'MIN · ON HOLD'),
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
    for(const width of [390,412]) {
      const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),f=fixtures('en');
      page.on('pageerror',e=>errors.push(String(e)));
      const messages=[];let sends=0,shares=0;
      const capabilities={externalAi:true,textProvider:'DeepSeek',imageUnderstanding:false,imageProvider:null};
      const session={id:'synthetic-action-session',title:'Synthetic review session',sport:'run',date:today};
      let proposal=null;
      await page.route('**/api/**',async route=>{
        const req=route.request(),path=new URL(req.url()).pathname;
        if(path==='/api/auth/me')return route.fulfill({json:{user:f.user}});
        if(path==='/api/assistant'&&req.method()==='GET')return route.fulfill({json:{ok:true,capabilities,conversation:{id:'synthetic-review-chat',messages},proposal,sessions:[session],defaultSessionId:session.id}});
        if(path==='/api/assistant'&&req.method()==='POST') {
          const input=req.postDataJSON();sends++;
          assert.equal(input.externalConsent,true);assert.equal(input.textProviderConsent,'deepseek');assert.equal(input.sessionId,session.id);
          assert.equal(input.aiReplyMemoryConsent,sends===1?undefined:true);
          messages.push({id:`action-user-${sends}`,role:'user',content:input.message,source:'text',createdAt:new Date().toISOString(),clientRequestId:input.clientRequestId});
          messages.push({id:`action-answer-${sends}`,role:'assistant',content:'Synthetic interpretation: review the proposed duration before confirming. Nothing has been saved.',source:'deepseek',needsHumanReview:true,createdAt:new Date().toISOString()});
          if(sends===1)proposal={id:'synthetic-review-proposal',revision:1,status:'pending',candidates:[{id:'duration-change',kind:'workout_plan',field:'durationMin',value:30,unit:'min',observedDate:today,source:'text',evidence:input.message,sessionId:session.id,status:'proposed'}]};
          return route.fulfill({json:{ok:true,capabilities,conversation:{id:'synthetic-review-chat',messages},proposal,mode:'coach_ai',externalStatus:'answered'}});
        }
        if(path==='/api/assistant/escalate'&&req.method()==='POST') {
          const input=req.postDataJSON();shares++;assert.equal(input.confirmed,true);assert.equal(input.notifyAdmin,false);assert.equal(input.sourceMessageId,'action-user-2');assert.equal(input.question,'Synthetic question reviewed for the human coach.');
          return route.fulfill({json:{ok:true,sharedMessageId:'synthetic-shared-question',notificationStatus:'not_requested'}});
        }
        unexpected.push(`${req.method()} ${path}`);return route.fulfill({status:500,json:{error:'Unexpected synthetic operation'}});
      });
      await page.goto(`${base}/coach`);
      const ai=page.getByLabel('Use DeepSeek for conversation while this page is open',{exact:true});await ai.waitFor();
      assert.equal(await ai.isChecked(),false);await ai.check();
      const memory=page.getByLabel(/Also include up to two previous DeepSeek replies/);assert.equal(await memory.isChecked(),false);
      await page.getByRole('textbox',{name:'Your message',exact:true}).fill('Make this session half an hour');
      await page.getByRole('button',{name:'Send message',exact:true}).click();
      await page.getByText('Review 1 proposed facts · Not saved',{exact:true}).waitFor({state:'visible'});
      assert.equal(await page.getByRole('button',{name:'Confirm 0 selected facts',exact:true}).isDisabled(),true);
      assert.equal(await page.getByLabel('Value',{exact:true}).isVisible(),true,'Proposal is expanded without another click');
      assert.equal(await ai.isChecked(),true,'Page permission persists after a send');
      await memory.check();
      await page.getByRole('textbox',{name:'Your message',exact:true}).fill('Why do you recommend that?');await page.getByRole('button',{name:'Send message',exact:true}).click();
      await page.getByRole('list',{name:'Conversation history',exact:true}).getByText('Why do you recommend that?',{exact:true}).waitFor({state:'visible'});
      await page.getByRole('button',{name:'Ask a human coach',exact:true}).click();
      await page.getByLabel('Question for the coach',{exact:true}).fill('Synthetic question reviewed for the human coach.');
      await page.getByRole('button',{name:'Confirm and share question',exact:true}).click();
      await page.getByText(/Question saved for your authorized coaches and administrator/).waitFor({state:'visible'});
      assert.equal(sends,2);assert.equal(shares,1);assert.equal(await ai.isChecked(),true);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:`${dir}/confirmed-actions-${width}.png`});
      await page.reload();await ai.waitFor();assert.equal(await ai.isChecked(),false);assert.equal(await memory.isChecked(),false);
      results.push({width,confirmedActionReview:'pass',pageScopedAiConsent:'pass',optionalMemory:'pass',humanHandoff:'pass'});
      await context.close();
    }
    assert.deepEqual(unexpected, []); assert.deepEqual(errors, []);
  } finally { await browser.close(); writeFileSync(`${dir}/report.json`,JSON.stringify({results,errors,unexpected,geometry,scope:'API-mocked synthetic Chromium only; no production data or API writes, actual microphone or network provider acceptance; coach sends are intercepted synthetic fixtures'},null,2)); }
  console.log(`${results.length} EN/ES viewport journeys passed; no page errors or unexpected API writes (coach sends intercepted synthetically).`);
}
main().catch(error=>{console.error(error);process.exitCode=1});
