/** Synthetic Chromium/API fixtures; actual HTTP/Postgres persistence is checked separately. */
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const {chromium}=require('playwright');
const base=process.env.JMM_UI_TEST_BASE||'http://127.0.0.1:3220';assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
const dir='.local/jmm-commander-browser';mkdirSync(dir,{recursive:true});
const results=[],errors=[],unexpected=[];
async function main(){const browser=await chromium.launch({headless:true});try{
  for(const lang of ['en','es'])for(const width of [390,412]){
    const es=lang==='es',context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage();
    let messages=[],saved=null,previews=0,confirmations=0,reject=true;
    const payload=()=>({ok:true,conversation:{id:'conversation-synthetic',messages},proposal:null,receipt:null,savedReceipt:null,pendingActions:[],sessions:[],capabilities:{externalAi:false,imageUnderstanding:false},displayUnits:es?'metric':'imperial'});
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin!==base){unexpected.push('external request');return route.abort();}
      if(!url.pathname.startsWith('/api/'))return route.continue();
      if(url.pathname==='/api/auth/me')return route.fulfill({json:{user:{id:'synthetic-owner',name:'Synthetic',email:'athlete@example.invalid',role:'athlete',language:lang,timezone:'America/New_York',onboarded:true,profile:{units:es?'metric':'imperial'}}}});
      if(url.pathname==='/api/assistant'){
        if(req.method()==='POST'){const body=req.postDataJSON();messages=[...messages,{id:'message-source',role:'user',content:body.message,source:'text',createdAt:'2026-10-24T12:00Z',clientRequestId:body.clientRequestId},{id:'answer-source',role:'assistant',content:es?'Revisa el plan antes de confirmar.':'Review the plan before confirming.',source:'local',createdAt:'2026-10-24T12:00Z'}];}
        return route.fulfill({json:payload()});
      }
      if(url.pathname==='/api/assistant/plan'){
        if(req.method()==='GET')return route.fulfill({json:{ok:true,localToday:'2026-10-24',readiness:{ready:true,missing:[],review:[]},defaults:{distance:'run-only',weeks:8,easyPct:70,trainingWindow:'any'},activePlans:saved?[{id:saved.planId,name:saved.name}]:[],receipt:saved}});
        const body=req.postDataJSON();assert.equal(body.sourceMessageId,'message-source');
        if(body.action==='preview'){
          previews++;return route.fulfill({json:{ok:true,previewToken:'a'.repeat(64),warning:'Synthetic preview; not saved',doubleDayAgreementRequired:false,eventTradeoffAgreementRequired:false,preview:{weeks:body.weeks,startDate:'2026-11-02T05:00Z',weeklyBudgetMin:120,weeksPreview:[{week:1,theme:'Controlled foundation',totalMinutes:20,sessions:[{daySlot:0,title:'Synthetic easy session',sport:'run',minutes:20,zone:'z2',description:'Familiar controlled practice',steps:[{name:'Short step',seconds:15,zone:'z2'},{name:'Easy',seconds:1185,zone:'z2'}]}]}]}}});
        }
        confirmations++;
        if(reject){reject=false;return route.fulfill({status:409,json:{error:'Synthetic stale preview: review again'}});}
        saved={id:'receipt-synthetic',planId:'plan-synthetic',name:'Synthetic reviewed cycle',savedAt:'2026-10-24T12:30Z',previewToken:'a'.repeat(64),sourceMessageId:'message-source',requestHash:'b'.repeat(64)};
        return route.fulfill({json:{ok:true,receipt:saved}});
      }
      if(url.pathname==='/api/nutrition'){
        if(req.method()==='POST')return route.fulfill({status:500,json:{error:'Synthetic rejected save'}});
        return route.fulfill({json:{daily:[],logs:{nutrition:[],hydration:[]}}});
      }
      if(req.method()!=='GET')unexpected.push(req.method()+' '+url.pathname);
      return route.fulfill({json:{ok:true}});
    });
    await page.goto(base+'/coach');
    const composer=page.getByRole('textbox',{name:es?'Tu mensaje':'Your message',exact:true});await composer.waitFor();
    await page.getByRole('button',{name:es?'Enviar mensaje':'Send message',exact:true}).first().waitFor();
    await composer.fill('Build my 8 week plan starting 2026-11-02');
    await page.getByRole('button',{name:es?'Enviar mensaje':'Send message',exact:true}).first().click();
    const panel=page.getByRole('region',{name:es?'Comandos y revisión del coach':'Coach commands and review',exact:true});
    await panel.getByRole('button',{name:es?'Preparar vista previa aquí':'Prepare plan preview here',exact:true}).waitFor();
    assert.equal(await panel.getByLabel(es?'Semanas (4–30)':'Weeks (4–30)').inputValue(),'8');
    assert.equal(await panel.getByLabel(es?'Fecha de inicio local':'Local start date').inputValue(),'2026-11-02');
    assert.equal(confirmations,0);
    await panel.getByRole('button',{name:es?'Preparar vista previa aquí':'Prepare plan preview here',exact:true}).click();
    await panel.getByText('Synthetic preview; not saved',{exact:true}).waitFor();
    await panel.locator('summary').filter({hasText:'Controlled foundation'}).click();
    await panel.getByText(/Short step · 15 (?:sec|s) · z2/).waitFor();
    await panel.getByLabel(es?'Semanas (4–30)':'Weeks (4–30)').fill('12');
    assert.equal(await panel.getByRole('button',{name:es?'Confirmar y guardar este plan':'Confirm and save this plan',exact:true}).count(),0);
    await panel.getByRole('button',{name:es?'Preparar vista previa aquí':'Prepare plan preview here',exact:true}).click();
    await panel.getByRole('button',{name:es?'Confirmar y guardar este plan':'Confirm and save this plan',exact:true}).click();
    await panel.getByRole('alert').filter({hasText:'Synthetic stale preview'}).waitFor();
    assert.equal(saved,null);
    await panel.getByRole('button',{name:es?'Recargar contexto y comprobante':'Reload context and receipt',exact:true}).click();
    await panel.getByRole('button',{name:es?'Preparar vista previa aquí':'Prepare plan preview here',exact:true}).click();
    await panel.getByRole('button',{name:es?'Confirmar y guardar este plan':'Confirm and save this plan',exact:true}).click();
    await panel.getByText(/receipt-synthetic/).waitFor();assert.equal(confirmations,2);assert.equal(previews,3);
    await page.reload();
    await page.getByRole('button',{name:es?'Vista previa del plan':'Plan preview',exact:true}).click();
    await page.getByText(/receipt-synthetic/).waitFor();
    assert.ok(await page.getByRole('textbox',{name:es?'Tu mensaje':'Your message',exact:true}).isVisible());
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    await page.screenshot({path:`${dir}/commander-${lang}-${width}.png`,fullPage:true});
    await page.goto(base+'/nutrition');
    const food=page.getByPlaceholder('Oatmeal + banana');await food.fill('Synthetic meal draft');
    await page.getByRole('button',{name:'Log Meal',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Synthetic rejected save'}).waitFor();
    assert.equal(await food.inputValue(),'Synthetic meal draft');
    assert.equal(await page.getByText(/Save confirmed by the server|Guardado confirmado/).count(),0);
    results.push({lang,width,status:'passed',cases:['chat intent opens inline cycle preview','explicit fields retained','edit invalidates preview','stale save rejected without success','review/retry saves one receipt','reload restores receipt with conversation','rejected nutrition save retains draft','no horizontal overflow']});
    await context.close();
  }
}finally{await browser.close();writeFileSync(dir+'/report.json',JSON.stringify({results,errors,unexpected,scope:'Synthetic Chromium fixture acceptance; HTTP/Postgres commander persistence is covered separately'},null,2));}
assert.equal(errors.length,0);assert.equal(unexpected.length,0);console.log(results.length+' commander browser journeys passed');}
main().catch(error=>{console.error(error);process.exitCode=1;});
