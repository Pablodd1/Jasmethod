import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSessionNutrition } from './session-nutrition';
import { profilePatch } from './profile-update';
import { postFuelLabel, calendarDescription, telegramPlan, gmailPlanHtml } from './plan-formats';
import { canonicalSession } from './canonical-session';
import { buildTrainingCalendar } from './training-export';
const now=new Date('2026-10-07T12:00Z');
const session={id:'session-a',dateLocal:'2026-10-07',timezone:'UTC',startTime:'08:00',sport:'bike',durationMin:180,intensity:'z4',verdict:'ready' as const};
const context={version:'nutrition-context-v1',carbohydratePractice:{observedAt:'2026-10-01',sport:'bike',durationMin:180,intensity:'z4',conditions:'PRIVATE_CONDITIONS',productMixture:'PRIVATE_MIXTURE',toleratedGPerHour:50,targetGPerHour:80,giSymptoms:'mild',reviewedHighIntake:true},sweatMeasurement:null,turnaround:{sessionId:'session-a',dateLocal:'2026-10-07',durationMin:180,intensity:'z4',startTime:'08:00',nextSessionInHours:3}};
const profile={weightKg:70,gutTrained:true,nutritionContext:JSON.stringify(context)};
test('shared runtime nutrition respects practice and specific turnaround without exposing private context in messages',()=>{
  const result=buildSessionNutrition(profile,session,now)!;
  assert.equal(result.fuel.carbsPerHourG,50);
  assert.equal(result.fuel.caffeineMg,undefined);
  assert.match(result.post.note,/PER HOUR/);
  assert.match(postFuelLabel(result.post),/PER HOUR/);
  const formatted={...session,title:'Bike',fuel:result.fuel,post:result.post};
  for(const text of [calendarDescription(formatted),telegramPlan('Test','Oct 7',[formatted]),gmailPlanHtml('Test','Oct 7',[formatted]).html]) {
    assert.match(text,/PER HOUR/);
    assert.match(text,/overdrink/);
    assert.doesNotMatch(text,/PRIVATE_CONDITIONS|PRIVATE_MIXTURE|GI symptoms/);
  }
  assert.equal(buildSessionNutrition(profile,{...session,verdict:'blocked'},now),null);
  assert.equal(buildSessionNutrition(profile,{...session,verdict:'rest'},now),null);
  assert.doesNotMatch(buildSessionNutrition(profile,{...session,startTime:'09:00'},now)!.post.note,/PER HOUR/);
});
test('nutrition profile field round trips, omitted edits preserve it and explicit null clears',()=>{
  const saved=profilePatch({nutritionContext:context},'UTC');
  assert.equal(JSON.parse(saved.nutritionContext).version,'nutrition-context-v1');
  assert.equal(Object.hasOwn(profilePatch({weightKg:70},'UTC'),'nutritionContext'),false);
  assert.equal(profilePatch({nutritionContext:null},'UTC').nutritionContext,null);
  assert.throws(()=>profilePatch({nutritionContext:{version:'unknown'}},'UTC'),/unsupported version/);
});
test('nutrition changes invalidate canonical revision and ICS uses resolved nutrition, not raw intensity',()=>{
  const workout={id:session.id,userId:'athlete',sport:'bike',title:'Bike',durationMin:1,date:now,intensity:'z2'};
  const prescription={sport:'bike',durationMin:1,verdict:'full',steps:[{name:'Easy',seconds:60,zone:'z2',phase:'active'}]};
  const input={athleteId:'athlete',workout,prescription,profile,dateLocal:session.dateLocal,timezone:'UTC'};
  const canonical=canonicalSession(input);
  assert.notEqual(canonical.revision,canonicalSession({...input,profile:{...profile,nutritionContext:null}}).revision);
  const nutrition=buildSessionNutrition(profile,session,now)!;
  const text=buildTrainingCalendar({athlete:{name:'Test',email:'test@example.invalid',timezone:'UTC'},workouts:[],metrics:[],sleep:[],checkins:[],resolvedSessions:{[session.id]:canonical},resolvedNutrition:{[session.id]:nutrition},plan:{name:'Test',days:[{date:now,week:1,dayOff:false,sessions:[workout]}]}});
  const calendarContent = text.replace(/\r\n[ \t]/g, "");
  assert.match(calendarContent,/PER HOUR/);
  assert.match(calendarContent,/50g\/h|50 g\/h|50 g TOTAL carbohydrate\/hour/);
  assert.doesNotMatch(calendarContent,/PRIVATE_CONDITIONS/);
});
