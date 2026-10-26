/** Synthetic browser acceptance only. No Garmin traffic, credentials or real athletes. */
const assert = require('node:assert/strict');
const {mkdirSync,writeFileSync} = require('node:fs');
const {chromium} = require('playwright');
const base=process.env.JMM_UI_TEST_BASE||'http://127.0.0.1:3220';
assert.match(base,/^http:\/\/127\.0\.0\.1:\d+$/);
const dir='.local/jmm-garmin-browser';mkdirSync(dir,{recursive:true});
const results=[],errors=[],unexpected=[];
async function main(){const browser=await chromium.launch({headless:true});try{
 for(const language of ['en','es'])for(const width of [390,1280]){
  const es=language==='es',context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage();
  let configured=false,status='disconnected',statusFailure=false,revokeFailure=false,starts=0,disconnects=0;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin!==base){unexpected.push('external request');return route.abort();}
   if(!url.pathname.startsWith('/api/'))return route.continue();
   if(url.pathname==='/api/auth/me')return route.fulfill({json:{user:{id:'synthetic-garmin-owner',name:'Synthetic athlete',email:'athlete@example.invalid',language,timezone:'America/New_York',role:'athlete',onboarded:true}}});
   if(url.pathname==='/api/connectors/garmin/connection'){
    if(req.method()==='GET')return route.fulfill(statusFailure?{status:503,json:{error:'Synthetic status unavailable'}}:{json:{configured,status,permissions:status==='connected'?['ACTIVITY_EXPORT','WORKOUT_IMPORT']:[],lastError:null}});
    assert.equal(req.method(),'POST');const body=req.postDataJSON();disconnects++;
    if(body.consent==='garmin-manual-revocation-reported-v1'){assert.equal(status,'revocation_required');status='disconnected';return route.fulfill({json:{disconnected:true,providerRevoked:false,manualRevocationReported:true}});}
    assert.deepEqual(body,{});
    if(revokeFailure){status='revocation_required';return route.fulfill({status:503,json:{error:es?'Revocación sin confirmar':'Provider revocation unconfirmed'}});}
    status='disconnected';return route.fulfill({json:{disconnected:true,providerRevoked:true}});
   }
   if(url.pathname==='/api/connectors/garmin/authorize'){
    assert.equal(req.method(),'POST');assert.deepEqual(req.postDataJSON(),{consent:'garmin-direct-v1'});starts++;
    return route.fulfill({status:503,json:{error:es?'Autorización rechazada de prueba':'Synthetic authorization rejected'}});
   }
   if(url.pathname==='/api/connectors')return route.fulfill({json:{providers:[],connectors:[],capabilities:{intervalsConnector:false}}});
   if(req.method()!=='GET')unexpected.push(req.method()+' '+url.pathname);
   return route.fulfill({json:{observations:[],history:{bySource:[]},providers:[],configured:false,verified:false,enabled:false}});
  });
  const card=page.locator('#garmin-direct-connection');
  async function open(){await page.goto(base+'/connectors');await card.getByRole('heading').waitFor();}
  async function shot(step){assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await card.scrollIntoViewIfNeeded();const artifact=`${language}-${width}-${step}.png`;await page.screenshot({path:`${dir}/${artifact}`});results.push({language,width,step,artifact,status:'PASS'});}
  await open();await card.getByText(es?/Pendiente: credenciales/:/Awaiting production credentials/).waitFor();assert.equal(await card.getByRole('checkbox').count(),0);await shot('01-awaiting-configuration');
  configured=true;await open();const consent=card.getByRole('checkbox');const connect=card.getByRole('button',{name:es?'Continuar a Garmin':'Continue to Garmin',exact:true});await consent.waitFor();assert.equal(await consent.isChecked(),false);assert.equal(await connect.isEnabled(),false);await shot('02-consent-unchecked');
  await consent.check();await connect.click();await card.getByRole('alert').filter({hasText:es?'Autorización rechazada de prueba':'Synthetic authorization rejected'}).waitFor();assert.equal(starts,1);await shot('03-authorization-error');
  status='connected';await open();await card.getByText(es?'Autorizada':'Authorized',{exact:true}).waitFor();await card.getByText(es?/Importaciones: no verificadas/:/Imports: unverified/).waitFor();assert.equal(await card.getByRole('checkbox').count(),0);await shot('04-authorized-not-imported');
  revokeFailure=true;await card.getByRole('button',{name:es?'Desconectar Garmin':'Disconnect Garmin',exact:true}).click();await card.getByRole('alert').waitFor();await card.getByText(es?'Revocación sin confirmar':'Revocation unconfirmed',{exact:true}).waitFor();assert.equal(status,'revocation_required');await shot('05-revocation-unconfirmed');
  revokeFailure=false;await card.getByRole('button',{name:es?'Desconectar Garmin':'Disconnect Garmin',exact:true}).click();await card.getByText(es?'Sin autorizar':'Not authorized',{exact:true}).waitFor();await shot('06-disconnected');
  status='revocation_required';await open();await card.getByText(es?'Recuperar una desconexión sin confirmar':'Recover an unconfirmed disconnection',{exact:true}).click();const manual=card.getByLabel(es?'He eliminado JMM en Garmin.':'I removed JMM in Garmin.',{exact:true}),clear=card.getByRole('button',{name:es?'Limpiar conexión local':'Clear local connection',exact:true});assert.equal(await manual.isChecked(),false);assert.equal(await clear.isEnabled(),false);await manual.check();await clear.click();await card.getByText(es?'Sin autorizar':'Not authorized',{exact:true}).waitFor();await shot('07-manual-removal-reported');
  statusFailure=true;await open();await card.getByRole('alert').waitFor();assert.equal(await card.getByRole('button').count(),0);await shot('08-status-unavailable');assert.equal(disconnects,3);
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
}finally{await browser.close();writeFileSync(`${dir}/report.json`,JSON.stringify({results,errors,unexpected},null,2));}}
main().catch(e=>{console.error(e);process.exitCode=1;});
