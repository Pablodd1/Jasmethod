const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const results=[];
 for(const language of ['en','es']){
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(), requests=[], errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname!=='127.0.0.1')return route.abort();
   if(!u.pathname.startsWith('/api/'))return route.continue();
   let body={};let status=200;
   if(u.pathname==='/api/auth/me')body={user:{id:'synthetic-ui',name:'Synthetic athlete',email:'synthetic@example.invalid',role:'athlete',language,timezone:'America/New_York',onboarded:true}};
   if(u.pathname==='/api/profile')body={profile:{goal:'half',experience:'advanced',weeklyHours:10},zones:null,setup:{planWeeks:4},planningReadiness:{ready:true,missing:[],review:[]}};
   if(u.pathname==='/api/plan')body={plans:[]};
   if(u.pathname==='/api/plan/generate'){
    const input=route.request().postDataJSON();requests.push(input);
    if(!input.manualBaselinePlanning){status=409;body={error:'Synthetic restricted history requires an explicit baseline choice.'};}
    else body={ok:true,previewToken:'a'.repeat(64),warning:'Synthetic preview only. No training saved.',doubleDayAgreementRequired:false,eventTradeoffAgreementRequired:false,preview:{distance:'half',weeks:4,startDate:'2026-11-03T05:00:00.000Z',raceDate:null,weeklyBudgetMin:300,existingPlans:0,weeksPreview:[1,2,3,4].map(week=>({week,theme:'Synthetic foundation',totalMinutes:30,restDaySlots:[1,2,3,4,5,6],sessions:[{title:'Synthetic familiar practice',sport:'bike',zone:'z2',minutes:30,daySlot:0,description:'Synthetic effort instructions.',steps:[{name:'Familiar effort',zone:'z2',seconds:1800}]}]})),recoveryPolicy:{minimumRestDays:1}}};
   }
   return route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('http://127.0.0.1:3147/training');
  const choice=page.getByRole('checkbox',{name:language==='en'?/Use my separately reported/:/Usar mi volumen reciente/});
  await choice.waitFor();assert.equal(await choice.isChecked(),false);
  await page.getByRole('button',{name:language==='en'?'Preview Plan':'Vista previa del plan',exact:true}).click();
  await page.getByText('Synthetic restricted history requires an explicit baseline choice.').waitFor();
  assert.equal(requests[0].manualBaselinePlanning,false);
  await choice.check();
  await page.getByRole('button',{name:language==='en'?'Preview Plan':'Vista previa del plan',exact:true}).click();
  const confirm=page.getByRole('button',{name:language==='en'?'Confirm and save this plan':'Confirmar y guardar este plan',exact:true});
  await confirm.waitFor();assert.equal(requests[1].manualBaselinePlanning,true);assert.equal(requests[1].preview,true);
  await choice.scrollIntoViewIfNeeded();
  await page.screenshot({path:`.local/coach-baseline-mobile-${language}.png`});
  await choice.uncheck();assert.equal(await confirm.count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);
  results.push({language,viewport:390,defaultRefused:true,explicitPreview:true,choiceInvalidatesPreview:true,errors:0});
  await context.close();
 }
 await browser.close();fs.writeFileSync('.local/coach-ui-smoke-results.json',JSON.stringify({simulated:true,results},null,2));console.log(JSON.stringify({simulated:true,results}));
})().catch(e=>{console.error(e);process.exit(1);});
