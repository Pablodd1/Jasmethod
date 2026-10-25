/** Synthetic browser consent journeys. Provider transports are covered by zero-call unit tests. */
const assert=require('node:assert/strict');
const {mkdirSync,writeFileSync}=require('node:fs');
const {chromium}=require('playwright');
const base=process.env.JMM_UI_TEST_BASE||'http://127.0.0.1:3220';assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
const dir='.local/jmm-ai-consent-browser';mkdirSync(dir,{recursive:true});const results=[],errors=[],unexpected=[];
const file={name:'synthetic.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4N8AAAAASUVORK5CYII=','base64')};
async function main(){const browser=await chromium.launch({headless:true});try{
 for(const language of ['en','es']){
  const es=language==='es',context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();let photoCalls=0,mealCalls=0,chatCalls=[];
  const conversation=()=>({ok:true,conversation:{id:'synthetic-private-chat',messages:[]},proposal:null,receipt:null,savedReceipt:null,pendingActions:[],sessions:[],capabilities:{externalAi:true,textProvider:'DeepSeek',imageUnderstanding:true,imageProvider:'OpenAI'}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==base){unexpected.push('external');return route.abort();}if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname==='/api/auth/me')return route.fulfill({json:{user:{id:'synthetic-consent-owner',email:'athlete@example.invalid',name:'Synthetic',role:'athlete',language,timezone:'UTC',onboarded:true}}});
   if(url.pathname==='/api/nutrition/photo'){photoCalls++;const body=req.postDataJSON();assert.equal(body.photoConsent,true);assert.equal(body.photoProviderConsent,'google_gemini');assert.equal(body.photoSource,'food_photo');return route.fulfill({json:{ok:true,analysis:{food:'Synthetic reviewed estimate',calories:20,proteinG:1,carbsG:2,fatG:1,notes:'Review this estimate'}}});}
   if(url.pathname==='/api/nutrition'){if(req.method()==='POST'){mealCalls++;return route.fulfill({json:{ok:true,log:{id:'synthetic-manual-meal'}}});}return route.fulfill({json:{daily:[],logs:{nutrition:[],hydration:[]}}});}
   if(url.pathname==='/api/assistant'){if(req.method()==='POST')chatCalls.push(req.postDataJSON());return route.fulfill({json:conversation()});}
   if(req.method()!=='GET')unexpected.push(req.method()+' '+url.pathname);return route.fulfill({json:{ok:true}});
  });
  await page.goto(base+'/nutrition');await page.locator('#food-photo').setInputFiles(file);
  const consent=page.getByRole('checkbox',{name:/Google Gemini/}),analyze=page.getByRole('button',{name:es?'Analizar esta foto con Google Gemini':'Analyze this photo with Google Gemini',exact:true});
  assert.equal(await consent.isChecked(),false);assert.equal(await analyze.isEnabled(),false);assert.equal(photoCalls,0);
  await page.getByPlaceholder('Oatmeal + banana').fill('Synthetic manual meal');await page.getByRole('button',{name:'Log Meal',exact:true}).click();
  await page.getByText(/Save confirmed by the server|Guardado confirmado/).waitFor();assert.equal(mealCalls,1);assert.equal(photoCalls,0);
  await consent.check();await analyze.click();await page.getByText('Review this estimate',{exact:true}).waitFor();assert.equal(photoCalls,1);assert.equal(await consent.isChecked(),false);assert.equal(await analyze.isEnabled(),false);
  await page.screenshot({path:`${dir}/nutrition-${language}-390.png`,fullPage:true});
  await page.goto(base+'/coach');await page.getByText(es?'Herramientas opcionales: registro, imágenes e IA':'Optional tools: logging, images & AI',{exact:true}).click();
  await page.locator('input[type=file]').setInputFiles(file);
  const source=page.getByRole('combobox',{name:es?'Origen de la captura':'Screenshot source'}),imageConsent=page.getByRole('checkbox',{name:es?/Permitir a OpenAI/:/Allow OpenAI/});
  assert.equal(await source.inputValue(),'unknown');assert.equal(await imageConsent.isEnabled(),false);
  for(const value of ['device','imported','unknown']){await source.selectOption(value);assert.equal(await imageConsent.isEnabled(),false);}
  assert.equal(chatCalls.length,0);
  await page.getByRole('textbox',{name:es?'Tu mensaje':'Your message',exact:true}).fill('What is RPE?');
  await page.getByRole('button',{name:es?'Enviar solo texto':'Send text only',exact:true}).first().click();
  await page.getByRole('textbox',{name:es?'Tu mensaje':'Your message',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('textarea')?.value==='');
  assert.equal(chatCalls.length,1);assert.equal(chatCalls[0].image,undefined);
  await source.selectOption('manual_note');await imageConsent.check();
  await page.getByRole('textbox',{name:es?'Tu mensaje':'Your message',exact:true}).fill('Review my manually authored note');
  await page.getByRole('button',{name:es?'Enviar mensaje':'Send message',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('textarea')?.value==='');
  assert.equal(chatCalls.length,2);assert.equal(chatCalls[1].imageSource,'manual_note');assert.equal(chatCalls[1].imageConsent,true);assert.equal(chatCalls[1].imageProviderConsent,'openai');
  assert.equal(await page.getByRole('checkbox',{name:/two previous DeepSeek|dos respuestas previas/}).count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:`${dir}/coach-${language}-390.png`,fullPage:true});
  results.push({language,status:'PASS',checks:['unchecked per-photo Gemini consent','manual meal works without AI','one-photo consent consumed','device/imported/unknown screenshot sources blocked','text-only fallback','explicit manual source and OpenAI consent','legacy memory UI removed','mobile geometry']});await context.close();
 }
}finally{await browser.close();writeFileSync(dir+'/report.json',JSON.stringify({results,errors,unexpected,scope:'Synthetic UI fixture; provider zero-call and real HTTP refusal tests are separate'},null,2));}
assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);}
main().catch(error=>{console.error(error);process.exitCode=1;});
