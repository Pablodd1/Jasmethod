/** Synthetic localhost-only acceptance; no production or provider traffic. */
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import {randomBytes,randomUUID} from 'node:crypto';
import {PrismaClient} from '@prisma/client';
import {hashToken} from '../src/lib/auth';
import {mkdir,writeFile} from 'node:fs/promises';
for(const key of ['DATABASE_URL','DIRECT_URL']){const u=new URL(process.env[key]||'');assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55432');assert.equal(u.pathname,'/jmm_launch_integration_test');}
assert.notEqual(process.env.VERCEL_ENV,'production');
const base='http://127.0.0.1:3220',db=new PrismaClient(),ids:string[]=[];
const now=new Date(),date=now.toISOString().slice(0,10),checks:string[]=[];
const input:any={name:'Synthetic 10 km execution',eventType:'run_road',startAt:null,weather:{kind:'unknown',source:'',issuedAt:null,validFrom:null,validTo:null,temperatureC:null,humidityPct:null,windMps:null},legs:[{id:'run',sport:'run',distanceM:10000,baseline:{sourceId:null,source:'manual',observedAt:date,context:'Recent flat 5 km session',protocol:'Self-reported duration and distance',sport:'run',metric:'pace_sec_km',value:300},target:330,targetConfirmed:true,segments:[],flatCourseConfirmed:true,timeMultiplier:1,bike:null,hrTargetBpm:null}],transitionSeconds:0,practicedCarbsGph:null,sensitivityPercent:5};
async function main(){
 const users=await Promise.all([1,2].map(async n=>{const user=await db.user.create({data:{name:`Synthetic race athlete ${n}`,email:`race-${randomUUID()}@example.invalid`,passwordHash:bcrypt.hashSync(randomBytes(32).toString('hex'),4),timezone:'UTC',onboarded:true,profile:{create:{birthYear:1990,goal:'run',experience:'advanced',weeklyHours:5}},reminder:{create:{emailEnabled:false,telegramEnabled:false}}}});ids.push(user.id);const token=randomBytes(32).toString('hex');await db.authSession.create({data:{userId:user.id,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+3600000)}});return {...user,token};}));
 async function api(path:string,body?:unknown,expected=200,user=users[0]){const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',origin:base,cookie:`jmm_session=${user.token}`},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual'});const text=await r.text();assert.equal(r.status,expected,`${path}: ${text.slice(0,600)}`);assert.match(r.headers.get('cache-control')??'',/no-store/);return JSON.parse(text);}
 assert.equal((await fetch(base+'/api/race-scenarios')).status,401);checks.push('anonymous 401');
 const crossSite=await fetch(base+'/api/race-scenarios',{method:'POST',headers:{'Content-Type':'application/json',origin:'https://other.example.invalid',cookie:`jmm_session=${users[0].token}`},body:JSON.stringify({input})});assert.equal(crossSite.status,403);checks.push('cross-origin saves rejected');
 const initial=await api('/api/race-scenarios');
 const preview=await api('/api/race-scenarios/preview',{input});assert.equal(preview.result.durationSeconds,3300);assert.equal(await db.auditLog.count({where:{subjectId:users[0].id,action:'race.scenario'}}),0);checks.push('preview computes explicit baseline-backed pace without saving');
 const saved=await api('/api/race-scenarios',{input,expectedRevision:initial.revision,result:{durationSeconds:1}},201);assert.equal(saved.result.durationSeconds,3300);checks.push('save recomputes untrusted result');
 await api('/api/race-scenarios',{input,expectedRevision:initial.revision},409);checks.push('stale revision rejected');
 let state=await api('/api/race-scenarios');assert.equal(state.snapshots.length,1);assert.equal(state.snapshots[0].stale,false);
 const other=await api('/api/race-scenarios',undefined,200,users[1]);assert.equal(other.snapshots.length,0);
 await api('/api/race-scenarios?athleteId='+users[1].id,undefined,403);checks.push('athlete access isolation');
 const foreignRace=await db.race.create({data:{userId:users[1].id,name:'Other athlete race',distance:'10k',date:now}});
 await api('/api/race-scenarios/preview',{input,metadata:{raceId:foreignRace.id}},404);
 const foreignTest=await db.benchmarkTest.create({data:{userId:users[1].id,name:'5 km',type:'run5k',date:now,result:1500,completed:true}});
 const claimed=structuredClone(input);claimed.legs[0].baseline={...claimed.legs[0].baseline,sourceId:foreignTest.id,source:'benchmark'};
 await api('/api/race-scenarios/preview',{input:claimed},404);checks.push('foreign race and anchor IDs rejected');
 const ownTest=await db.benchmarkTest.create({data:{userId:users[0].id,name:'5 km',type:'run5k',date:now,result:1500,completed:true}});
 claimed.legs[0].baseline.sourceId=ownTest.id;
 const authoritative=await api('/api/race-scenarios/preview',{input:claimed});assert.match(authoritative.input.legs[0].baseline.protocol,/not independently verified/);
 claimed.legs[0].baseline.value=299;await api('/api/race-scenarios/preview',{input:claimed},409);checks.push('saved anchor value and provenance authoritative');
 state=await api('/api/race-scenarios');assert.equal(state.snapshots[0].stale,true);checks.push('changed evidence flags snapshot stale');
 const concurrent=await Promise.all([1,2].map(()=>fetch(base+'/api/race-scenarios',{method:'POST',headers:{'Content-Type':'application/json',origin:base,cookie:`jmm_session=${users[0].token}`},body:JSON.stringify({input,expectedRevision:state.revision})})));assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,409]);checks.push('concurrent save one success one revision conflict');
 const bad=structuredClone(input);bad.legs[0].target=-1;await api('/api/race-scenarios/preview',{input:bad},400);
 await api('/api/race-scenarios/weather',{latitude:0,longitude:0,at:now.toISOString(),timeZone:'UTC',athleteId:users[0].id},400);
 await api('/api/race-scenarios/course',{gpx:'<!DOCTYPE gpx><gpx version="1.1"></gpx>'},400);
 const gpx='<?xml version="1.0"?><gpx version="1.1"><trk><trkseg><trkpt lat="40" lon="-73"><ele>10</ele></trkpt><trkpt lat="40.001" lon="-73"><ele>20</ele></trkpt><trkpt lat="40.002" lon="-73"><ele>10</ele></trkpt></trkseg></trk></gpx>';
 const course=await api('/api/race-scenarios/course',{gpx});assert.ok(course.segments[0].gradePct>0);assert.ok(course.segments[1].gradePct<0);checks.push('bounded GPX and event-only weather boundary');
 const legacy=await fetch(base+'/api/race-forecast',{headers:{cookie:`jmm_session=${users[0].token}`}});const gated=await legacy.json();assert.equal(gated.forecast,null);checks.push('legacy personalized forecast remains disabled');
 const profile=await db.athleteProfile.findUnique({where:{userId:users[0].id}});assert.equal(profile?.ftp,null);assert.equal(await db.trainingPlan.count({where:{userId:users[0].id}}),0);checks.push('no profile or plan mutation');
 await mkdir('.local/jmm-race-scenario-integration',{recursive:true});await writeFile('.local/jmm-race-scenario-integration/report.json',JSON.stringify({status:'passed',checks},null,2));console.log(`PASS ${checks.length} race scenario acceptance checks`,checks);
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await db.user.deleteMany({where:{id:{in:ids}}});await db.$disconnect();});
