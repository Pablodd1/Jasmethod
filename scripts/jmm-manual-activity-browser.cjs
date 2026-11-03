/** Synthetic mobile acceptance: no real accounts, database writes or provider traffic. */
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const {chromium}=require('playwright');
const base=process.env.JMM_UI_TEST_BASE||'http://127.0.0.1:3220';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
const dir='.local/jmm-manual-activity-browser';mkdirSync(dir,{recursive:true});
const results=[],errors=[],unexpected=[];
async function main(){
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{for(const lang of ['en','es']){
  const es=lang==='es',context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==base){unexpected.push('external request');return route.abort();}
   if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname==='/api/auth/me')return route.fulfill({json:{user:{id:'synthetic-owner',name:'Synthetic',email:'athlete@example.invalid',role:'athlete',language:lang,timezone:'UTC',onboarded:true,profile:{units:'metric'}}}});
   if(url.pathname==='/api/calendar')return route.fulfill({json:{events:[],workouts:[],displayWorkouts:[],races:[],plan:null}});
   if(url.pathname==='/api/workouts'&&req.method()==='POST'){
    const body=req.postDataJSON();requests.push(body);assert.match(body.clientRequestId,/^[a-f0-9-]+$/);
    if(requests.length===1)return route.fulfill({json:{ok:true,workout:{id:'synthetic-saved'}}}); // Missing echoed request receipt is uncertain.
    return route.fulfill({json:{ok:true,workout:{id:'synthetic-saved'},clientRequestId:body.clientRequestId,replayed:true,replayProtected:true}});
   }
   if(req.method()!=='GET')unexpected.push(req.method()+' '+url.pathname);
   return route.fulfill({json:{ok:true}});
  });
  await page.goto(base+'/calendar');
  await page.getByRole('button',{name:es?'Registrar actividad':'Log actual activity',exact:true}).click();
  const form=page.locator('form').filter({has:page.locator('input[name="actualDurationMin"]')});
  await form.locator('[name="sport"]').selectOption('bike');
  await form.locator('[name="date"]').fill(new Date().toISOString().slice(0,10));
  await form.locator('[name="actualDurationMin"]').fill('30');
  await form.locator('[name="notes"]').fill('Synthetic session report');
  const save=form.getByRole('button',{name:es?'Guardar actividad realizada':'Save actual activity',exact:true});
  await save.click();
  await page.getByRole('alert').filter({hasText:es?'No se pudo verificar':'Could not verify'}).waitFor();
  assert.equal(await form.locator('[name="notes"]').inputValue(),'Synthetic session report');
  assert.equal(requests.length,1);
  await save.click();
  await page.getByText(es?'Actividad registrada con tus datos reales. Las sesiones planificadas no se modificaron.':'Activity saved with your reported actuals. Planned sessions were retained.',{exact:true}).waitFor();
  assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1],'Uncertain save retries the identical logical request');
  await page.screenshot({path:`${dir}/manual-${lang}.png`,fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  results.push({lang,status:'passed',cases:['uncertain receipt never shows Saved','failed save preserves draft','unchanged retry retains request ID','verified replay shows saved','mobile layout fits']});
  await context.close();
 }}finally{await browser.close();writeFileSync(dir+'/report.json',JSON.stringify({results,errors,unexpected,scope:'Synthetic Chromium responses; database atomicity and contention require separate acceptance'},null,2));}
 assert.equal(errors.length,0);assert.equal(unexpected.length,0);console.log(results.length+' manual activity browser journeys passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
