/** Synthetic localhost-only acceptance; no production or provider traffic. */
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { hashToken } from '../src/lib/auth';
import { dayBounds, dateKey } from '../src/lib/dates';
import { DOUBLE_DAY_VERSION } from '../src/lib/double-day';
for(const key of ['DATABASE_URL','DIRECT_URL']){const u=new URL(process.env[key]||'');assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55432');assert.equal(u.pathname,'/jmm_launch_integration_test');}
assert.notEqual(process.env.VERCEL_ENV,'production');
const base='http://127.0.0.1:3220',db=new PrismaClient();
// Use a fixed-offset zone whose current local hour is noon; this keeps the
// after-first / before-second scenario valid at every CI launch time.
const offset=new Date().getUTCHours()-12;
const timezone=offset===0?'Etc/GMT':`Etc/GMT${offset>0?'+':''}${offset}`;
const day=dayBounds(timezone);
let userId='';
async function main(){
 const user=await db.user.create({data:{name:'Synthetic double-day athlete',email:`double-${randomUUID()}@example.invalid`,passwordHash:bcrypt.hashSync(randomBytes(32).toString('hex'),4),timezone,onboarded:true,profile:{create:{birthYear:1990,goal:'cycle',experience:'advanced',weeklyHours:8}},reminder:{create:{emailEnabled:false,telegramEnabled:false}}}});userId=user.id;
 const token=randomBytes(32).toString('hex');await db.authSession.create({data:{userId,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+3600000)}});
 async function api(path:string,body?:unknown,method=body===undefined?'GET':'POST',expected=200){const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',cookie:`jmm_session=${token}`},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual'});const text=await r.text();assert.equal(r.status,expected,`${path}: ${text.slice(0,600)}`);try{return JSON.parse(text);}catch{return text;}}
 const current=await api('/api/profile');
 const setup={adultConfirmed:true,profileConfirmed:true,goalDescription:'Sustainable cycling with an optional easy pair',baselineWeeklyMinutes:480,baselineObservedAt:day.key,interruptions:'none',restrictions:'none',qualifiedReview:'none_needed',trainingDays:[0,1,2,3,4,5,6],maxSessionMinutes:180,equipmentAccess:'Familiar stationary bike and safe movement space',planWeeks:4,doubleDay:{version:DOUBLE_DAY_VERSION,weekday:new Date(day.key+'T12:00Z').getUTCDay(),purpose:'Keep one convenient optional pair without adding weekly work',firstStart:'07:00',secondStart:'18:00',athleteAgreed:true,priorTolerance:true,foodFluidsAvailable:true,recheckBetween:true}};
 await api('/api/profile',{expectedRevision:current.revision,expectedSetupRevision:current.setupRevision,experience:'advanced',weeklyHours:8,setup},'PUT');
 const request={distance:'cycle',weeks:4,startDate:day.key};
 const preview=await api('/api/plan/generate',{...request,preview:true});
 assert.equal(preview.doubleDayAgreementRequired,true);
 assert.equal(preview.preview.weeksPreview[0].sessions.filter((s:any)=>s.doubleDayRole).length,2);
 await api('/api/plan/generate',{...request,previewToken:preview.previewToken},'POST',422);
 assert.equal(await db.trainingPlan.count({where:{userId}}),0,'missing pair confirmation cannot save a plan');
 const generated=await api('/api/plan/generate',{...request,previewToken:preview.previewToken,confirmDoubleDay:true});
 const sessions=generated.plan.sessions.filter((w:any)=>dateKey(new Date(w.date),timezone)===day.key);
 assert.equal(sessions.length,2);
 const first=sessions.find((w:any)=>JSON.parse(w.originalPlan).doubleDay.role==='primary');
 const second=sessions.find((w:any)=>JSON.parse(w.originalPlan).doubleDay.role==='secondary');
 assert.equal(JSON.parse(second.originalPlan).doubleDay.pair[0].id,first.id);
 const checkin={sleep:4,soreness:2,motivation:4,energy:4,stress:2,sick:false,newPain:false,urgentSymptoms:false,availableMinutes:180};
 await api('/api/checkin',checkin);
 let today=await api('/api/today');
 assert.equal(today.sessions.find((s:any)=>s.id===first.id).verdict,'ready');
 assert.equal(today.sessions.find((s:any)=>s.id===second.id).verdict,'blocked');
 await api('/api/workout/approve?sessionId='+encodeURIComponent(second.id),undefined,'GET',409);
 await api('/api/plan',{sessionId:first.id,feedbackStatus:'completed',completed:true,actualDurationMin:first.durationMin,actualSport:first.sport,rpe:3},'PUT');
 today=await api('/api/today');assert.equal(today.sessions.find((s:any)=>s.id===second.id).verdict,'blocked');
 await api('/api/checkin',checkin);
 today=await api('/api/today');assert.equal(today.sessions.find((s:any)=>s.id===second.id).verdict,'ready','post-first actuals and fresh check-in may clear the easy second session');
 const updated=await api('/api/profile');
 await api('/api/profile',{expectedRevision:updated.revision,expectedSetupRevision:updated.setupRevision,experience:'advanced',weeklyHours:8,setup:{...updated.setup,doubleDay:null}},'PUT');
 today=await api('/api/today');assert.equal(today.sessions.find((s:any)=>s.id===second.id).verdict,'blocked','revocation holds the optional second bout');
 // Standalone manual prescriptions count too; absence of planDay cannot bypass load review.
 const hard=[];
 for(let i=0;i<2;i++)hard.push(await db.workout.create({data:{userId,date:day.start,sport:'bike',title:'Synthetic standalone demanding session',type:'interval',durationMin:20,intensity:'z5',planned:true,prescription:JSON.stringify({sport:'bike',title:'Hard fixture',type:'interval',intensity:'z5',verdict:'full',durationMin:20,steps:[{name:'Hard work',seconds:1200,zone:'z5',phase:'active',target:{type:'open'}}]})}}));
 today=await api('/api/today');for(const w of hard){const shown=today.sessions.find((s:any)=>s.id===w.id);assert.equal(shown.verdict,'blocked');assert.match(shown.prescription.detail.main,/Two demanding/);}
 console.log('PASS optional-pair preview/confirmation, persistent IDs, first-session report, recheck, no premature FIT and consent revocation');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(userId)await db.user.delete({where:{id:userId}});await db.$disconnect();});
