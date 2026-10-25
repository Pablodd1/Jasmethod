// Read-only synthetic public-policy navigation; never sends an email or accepts terms.
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const {chromium}=require('playwright');
const base=process.env.JMM_UI_TEST_BASE||'http://127.0.0.1:3220';assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
const dir='.local/jmm-public-policies-browser';mkdirSync(dir,{recursive:true});
const paths=['/policies','/privacy','/terms','/cookies','/data-rights'],results=[],errors=[],unexpected=[];
async function main(){const browser=await chromium.launch({headless:true});try{
 for(const language of ['en','es'])for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(lang=>localStorage.setItem('jmm_lang',lang),language);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base){unexpected.push('external');return route.abort();}if(req.method()!=='GET'){unexpected.push(req.method()+' '+url.pathname);return route.abort();}if(url.pathname==='/api/auth/me')return route.fulfill({json:{user:null}});if(url.pathname==='/api/auth/providers')return route.fulfill({json:{providers:[]}});return route.continue();});
  for(const path of paths){const response=await page.goto(base+path);assert.equal(response.status(),200);await page.getByRole('heading',{level:1}).waitFor();
   const policyNav=page.getByRole('navigation',{name:language==='es'?'Políticas':'Policies',exact:true});await policyNav.waitFor();
   const main=await page.locator('main').innerText();assert.match(main,/AI DYNAMICS INC/);assert.match(main,/401 69th St, Apt 709, Miami Beach, FL 33141/);
   assert.ok(await page.locator('main [lang="en"]').count());assert.ok(await page.locator('main [lang="es"]').count());
   for(const href of paths)assert.equal(await policyNav.locator(`a[href="${href}"]`).count(),1);
   assert.equal(await page.getByRole('heading',{level:1}).count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   const canonical=await page.locator('link[rel="canonical"]').getAttribute('href');assert.equal(new URL(canonical).pathname,path);
   if(path==='/terms'){assert.doesNotMatch(main,/renew automatically|renuevan automáticamente|grounded in your data/);assert.match(main,/does not implement automatic subscription billing/);}
   if(path==='/data-rights'){assert.match(main,/does not offer a verified one-click/);assert.match(main,/does not by itself erase/);}
   if(path==='/policies'){await page.screenshot({path:`${dir}/${language}-${width}.png`,fullPage:true});assert.equal(await page.locator('main a[href="/privacy#optional-ai"]').count(),1);}
   results.push({language,width,path,status:'PASS'});
  }
  await page.goto(base+'/');const homeNav=page.getByRole('navigation',{name:language==='es'?'Políticas':'Policies',exact:true});await homeNav.waitFor();for(const href of paths)assert.equal(await homeNav.locator(`a[href="${href}"]`).count(),1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.goto(base+'/privacy#optional-ai');assert.equal(await page.locator('#optional-ai').count(),1);
  await page.goto(base+'/terms#health-and-training');assert.equal(await page.locator('#health-and-training').count(),1);
  await page.goto(base+'/login?mode=signup');await page.getByRole('navigation',{name:language==='es'?'Políticas':'Policies',exact:true}).waitFor();assert.ok(await page.locator('a[href="/policies"]').count()>=2);await context.close();
 }
}finally{await browser.close();writeFileSync(dir+'/report.json',JSON.stringify({results,errors,unexpected,scope:'Public read-only pages; synthetic logged-out browser. No accounts, consent grants, email or provider traffic.'},null,2));}assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);}
main().catch(e=>{console.error(e);process.exitCode=1});
