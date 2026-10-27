/** Isolated UI fixtures. No real accounts, provider requests or production writes. */
const assert = require('node:assert/strict');
const {mkdirSync,writeFileSync} = require('node:fs');
const {chromium} = require('playwright');
const base = process.env.JMM_UI_TEST_BASE || 'http://127.0.0.1:3220';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
const dir='.local/jmm-mobile-organization-browser'; mkdirSync(dir,{recursive:true});
const results=[],errors=[],unexpected=[];
async function main(){const browser=await chromium.launch({headless:true});try{
  for(const language of ['en','es']) for(const width of [390,1280]){
    const es=language==='es', context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage();
    let races=[], reject=false, failLoad=false, writes=0, signedIn=true, holdRead=true, releaseRead;
    const firstRead=new Promise(resolve=>{releaseRead=resolve;});
    const profile={profile:{goal:'hyrox',units:'metric'},zones:null,revision:'synthetic-profile',setupRevision:null,setup:null,planningReadiness:{ready:false,missing:['Confirm recent training and available time'],review:[]}};
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.origin!==base){unexpected.push('external request');return route.abort();}
      if(!url.pathname.startsWith('/api/'))return route.continue();
      if(url.pathname==='/api/auth/me')return route.fulfill({json:{user:signedIn?{id:'synthetic-mobile-owner',name:'Synthetic athlete',email:'athlete@example.invalid',role:'athlete',language,timezone:'America/New_York',onboarded:true,profile:profile.profile}:null}});
      if(url.pathname==='/api/profile')return route.fulfill({json:profile});
      if(url.pathname==='/api/plan')return route.fulfill({json:{plans:[]}});
      if(url.pathname==='/api/target-progress')return route.fulfill({status:503,json:{error:'Synthetic unavailable evidence'}});
      if(url.pathname==='/api/races'){
        if(req.method()==='GET'){if(holdRead)await firstRead;return route.fulfill(failLoad?{status:503,json:{error:'Synthetic unavailable races'}}:{json:{races}});}
        writes++;const body=req.postDataJSON();
        if(reject)return route.fulfill({status:400,json:{error:'Synthetic rejected save — draft retained'}});
        if(req.method()==='POST'){
          assert.equal(body.targetTempC,'');assert.equal(body.bikeTerrain,'');assert.equal(body.swimVenue,'');
          races=[{...body,id:'synthetic-race',priority:Number(body.priority)}];
        }else if(req.method()==='PUT')races=races.map(r=>r.id===body.id?{...r,...body}:r);
        else unexpected.push(req.method()+' '+url.pathname);
        return route.fulfill({json:{ok:true,race:races[0]}});
      }
      if(req.method()!=='GET')unexpected.push(req.method()+' '+url.pathname);
      return route.fulfill({json:{ok:true,observations:[],suggestions:[],raceResults:[],history:{count:0,sports:[]}}});
    });
    async function shot(step){
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),step+' overflow');
      const path=`${language}-${width}-${step}.png`;await page.screenshot({path:`${dir}/${path}`,fullPage:true});
      results.push({language,viewport:`${width}x844`,step,artifact:path,status:'PASS'});
    }
    await page.goto(base+'/races');
    await page.getByText(es?'Cargando carreras…':'Loading saved races…',{exact:true}).waitFor();await shot('00-loading');
    holdRead=false;releaseRead();
    await page.waitForFunction(()=>{const button=document.querySelector('section[aria-labelledby="add-race-title"] button[type="submit"]');return button&&!button.disabled;});
    const name=page.getByLabel(es?'Nombre de la carrera':'Race name',{exact:true});await name.waitFor();
    assert.equal(await page.locator('#race-distance').inputValue(),'');
    if(width===390){assert.equal(await name.evaluate(el=>getComputedStyle(el).fontSize),'16px');assert.ok((await name.boundingBox()).height>=44);}
    assert.equal(await page.locator('#race-targetTempC').isVisible(),false);
    await shot('01-race-basics');
    await name.fill('Synthetic HYROX event');await page.locator('#race-distance').selectOption('hyrox');await page.locator('#race-date').fill('2027-03-07');
    reject=true;await page.getByRole('button',{name:es?'Guardar carrera':'Save race',exact:true}).click();
    await page.getByRole('alert').filter({hasText:'Synthetic rejected save'}).waitFor();assert.equal(await name.inputValue(),'Synthetic HYROX event');await shot('02-save-error');
    reject=false;await page.getByRole('button',{name:es?'Guardar carrera':'Save race',exact:true}).click();
    await page.getByText('Synthetic HYROX event',{exact:true}).waitFor();
    await page.getByText(es?'Falta el lugar; añádelo cuando lo sepas.':'Venue missing — add it when available.',{exact:true}).waitFor();
    await shot('03-saved-venue-missing');
    await page.getByText(es?"Editar fecha, prioridad o lugar":"Edit date, priority or venue",{exact:true}).click();
    await page.locator('input[name="location"]').fill('Synthetic venue, Miami, FL');
    await page.getByRole('button',{name:es?'Guardar datos del evento':'Save event details',exact:true}).click();
    await page.getByText('Synthetic venue, Miami, FL',{exact:true}).waitFor();await page.reload();
    await page.getByText('Synthetic venue, Miami, FL',{exact:true}).waitFor();await shot('04-venue-saved-reloaded');
    await page.getByText(es?'Recorrido y condiciones (opcional)':'Course & conditions (optional)',{exact:true}).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#race-targetTempC').isVisible(),true);
    await page.getByText(es?'Datos de natación':'Swim details',{exact:true}).click();
    assert.equal(await page.locator('#race-waterTempC').inputValue(),'');await shot('05-optional-course');
    failLoad=true;await page.reload();await page.getByRole('button',{name:es?'Recargar carreras':'Reload saved races',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:es?'Guardar carrera':'Save race',exact:true}).isDisabled(),true);await shot('06-load-error');
    failLoad=false;
    await page.goto(base+'/training');await page.getByText('Confirm recent training and available time',{exact:true}).waitFor({state:'attached'});
    await page.getByRole('link',{name:es?'Tu plan':'Your plan',exact:true}).waitFor();await shot('07-plan-needs-setup');
    if(width===390){
      const nav=page.locator('nav.jmm-mobile-nav');
      await nav.waitFor();assert.equal(await nav.getByRole('link').count(),4);
      const active=nav.getByRole('link',{name:es?'Plan de entrenamiento':'Training plan',exact:true});
      assert.equal(await active.getAttribute('aria-current'),'page');
      for(const link of await nav.getByRole('link').all()){
        const box=await link.boundingBox();assert.ok(box&&box.width>=44&&box.height>=44,'Each mobile navigation link has a full touch target');
      }
      await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
      const footer=await page.locator('main footer').boundingBox(), bar=await nav.boundingBox();
      assert.ok(footer&&bar&&footer.y+footer.height<=bar.y,'Footer remains reachable above the floating navigation');
      const path=`${language}-${width}-glass-navigation.png`;
      await page.screenshot({path:`${dir}/${path}`});
      results.push({language,viewport:`${width}x844`,step:'glass-navigation',artifact:path,status:'PASS'});
    }
    await page.goto(base+'/onboard?redo=1&step=race&return=training');
    await page.getByRole('heading',{name:es?'Antes de ver tu plan':'Before your plan preview',exact:true}).waitFor();await shot('08-planning-setup');
    assert.equal(writes,3,'Only explicit create/retry and venue edit write');
    signedIn=false;await page.goto(base+'/races');await page.waitForURL('**/login');
    assert.equal(await page.locator('#race-name').count(),0);await shot('09-sign-in-required');
    await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
}finally{await browser.close();writeFileSync(`${dir}/report.json`,JSON.stringify({results,errors,unexpected},null,2));}}
main().catch(error=>{console.error(error);process.exitCode=1;});
