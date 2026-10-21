import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { ApiError, canCoach } from "./access";
import { profilePatch } from "./profile-update";
import { profileUnitPatch } from "./profile-unit-fields";
import * as duration from "./universal-workout-card";
import * as science from "./science";
import * as unitFields from "./profile-unit-fields";
const require=createRequire(import.meta.url);
function load(file:string,deps:Record<string,unknown>) {
  const output={exports:{} as any};
  const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{module:output,exports:output.exports,require:(name:string)=>name in deps?deps[name]:require(name),Date,Response,Request,console,setTimeout});return output.exports;
}
test("coach controls distinguish dose, planned preference, missing achieved zones and baseline review",()=>{
  const {AdminCoachEditor}=load("src/components/admin-coach-editor.tsx",{"@/lib/science":science,"@/lib/universal-workout-card":duration});
  const html=renderToStaticMarkup(React.createElement(AdminCoachEditor,{athleteId:"synthetic",timezone:"UTC",profile:{intensityPct:100,experience:"advanced"},profileRevision:"current",workouts:[],onRefresh:()=>{},onPreviewPlan:()=>{},onReviewBaselines:()=>{}}));
  assert.match(html,/Workout dose scale/);assert.match(html,/80% minimum/);assert.match(html,/Achieved physiological zone distribution: —/);
  assert.match(html,/never a quota/);assert.match(html,/Preview cycle/);assert.match(html,/physiological thresholds/);
  assert.doesNotMatch(html,/Intensity %|Actual in this plan/);
});
test("measurement inputs render associated clock, weight and feet/inches fields in the effective units",()=>{
  const {ProfileMeasurementInput}=load("src/components/ProfileMeasurementInput.tsx",{"@/lib/profile-unit-fields":unitFields});
  const render=(field:string,value:number,units:string)=>renderToStaticMarkup(React.createElement(ProfileMeasurementInput,{field,value,units,label:"Reference",id:`profile-${field}`,onChange:()=>{},onValidityChange:()=>{}}));
  const run=render("runPaceBase",300,"imperial");assert.match(run,/min:sec\/mi/);assert.match(run,/value="8:03"/);assert.match(run,/for="profile-runPaceBase"/);
  const swim=render("swimPaceBase",90,"imperial");assert.match(swim,/min:sec\/100 yd/);assert.match(swim,/value="1:22"/);
  const height=render("heightCm",178,"imperial");assert.match(height,/feet and inches/);assert.match(height,/profile-heightCm-heightFeet/);assert.match(height,/profile-heightCm-heightInches/);
  assert.match(render("weightKg",70,"imperial"),/value="154.3"/);assert.match(render("weightKg",70,"metric"),/value="70"/);
});
test("real measurement handlers retain invalid drafts, convert once, and redisplay on language/units changes without canonical writes",()=>{
  const cells:any[]=[],effects:(()=>void)[]=[];let cursor=0,tree:any,canonical="300.123",units="imperial",error:string|null=null,writes=0;
  const hooks={...React,useState(initial:any){const index=cursor++;if(!(index in cells))cells[index]=typeof initial==="function"?initial():initial;return [cells[index],(next:any)=>{cells[index]=typeof next==="function"?next(cells[index]):next;}];},
    useRef(initial:any){const index=cursor++;return cells[index]??(cells[index]={current:initial});},
    useEffect(effect:()=>void,deps:any[]){const index=cursor++,prior=cells[index];if(!prior||deps.some((value,i)=>value!==prior[i])){cells[index]=deps;effects.push(effect);}}};
  const {ProfileMeasurementInput}=load("src/components/ProfileMeasurementInput.tsx",{react:hooks,"@/lib/profile-unit-fields":unitFields});
  function render(){cursor=0;tree=ProfileMeasurementInput({field:"runPaceBase",value:canonical,units,label:"Threshold",onChange:(value:string)=>{canonical=value;writes++;},onValidityChange:(_:string,message:string|null)=>{error=message;}});while(effects.length)effects.shift()!();cursor=0;tree=ProfileMeasurementInput({field:"runPaceBase",value:canonical,units,label:"Threshold",onChange:(value:string)=>{canonical=value;writes++;},onValidityChange:(_:string,message:string|null)=>{error=message;}});}
  const inputs=(value:any):any[]=>Array.isArray(value)?value.flatMap(inputs):React.isValidElement(value)?[(value as any),...inputs((value as any).props.children)]:[];
  const input=()=>inputs(tree).find(node=>node.type==="input");
  render();assert.equal(input().props.value,"8:03");assert.equal(writes,0);
  input().props.onChange({target:{value:"8:"}});render();assert.equal(canonical,"300.123");assert.ok(error);assert.equal(input().props.value,"8:");
  input().props.onChange({target:{value:"8:03"}});render();assert.equal(canonical,"300.123","unchanged displayed clock preserves subsecond metric reference");assert.equal(error,null);
  units="metric";render();assert.equal(input().props.value,"5:00");const before=writes;
  units="imperial";render();assert.equal(canonical,"300.123");assert.equal(writes,before,"unit switches never write measurements");
  input().props.onChange({target:{value:"9:00"}});render();assert.ok(Math.abs(Number(canonical)-540/1.609344)<1e-9);
});

function editorFixture(role:string|null,assigned=true) {
  const profiles:Record<string,any>={owner:{weightKg:70,intensityPct:100},other:{weightKg:90,intensityPct:80}};
  const writes:any[]=[];let lookups=0;
  const actor=role?{id:"coach",role}:null;
  const {PATCH}=load("src/app/api/admin/athletes/[id]/editor/route.ts",{
    "@/lib/auth":{getCurrentUser:async()=>actor},
    "@/lib/access":{canCoach,canAccessAthlete:async(_:any,id:string)=>assigned&&id==="owner",ApiError,errorResponse:(error:any)=>Response.json({error:error.message},{status:error.status??500})},
    "@/lib/db":{prisma:{user:{findUnique:async({where}:any)=>{lookups++;return {id:where.id,timezone:"UTC"};}}}},
    "@/lib/dates":{},"@/lib/workout-update":{},
    "@/lib/profile-service":{profileRevision:()=>"next",saveProfile:async(actorId:string,athlete:any,body:any)=>{
      if(body.expectedRevision!=="current")throw new ApiError("Profile changed",409);
      const {expectedRevision,...fields}=body;const patch=profilePatch(fields,athlete.timezone);
      writes.push({actorId,athleteId:athlete.id,before:{...profiles[athlete.id]},after:patch});Object.assign(profiles[athlete.id],patch);return profiles[athlete.id];
    }},
  });
  return {profiles,writes,lookups:()=>lookups,run:(fields:any,id="owner")=>PATCH(new Request("https://example.invalid/editor",{method:"PATCH",body:JSON.stringify({action:"setProfile",expectedRevision:"current",...fields})}),{params:Promise.resolve({id})})};
}
test("coach unit edits keep role, assignment, owner scope and stale-revision rejection before persistence",async()=>{
  for(const [role,assigned,status] of [[null,true,401],["athlete",true,403],["coach",false,403]] as const) {
    const f=editorFixture(role,assigned);assert.equal((await f.run({intensityPct:80})).status,status);assert.equal(f.writes.length,0);assert.equal(f.lookups(),0);
  }
  const f=editorFixture("coach"),beforeOther=JSON.stringify(f.profiles.other);
  assert.equal((await f.run({intensityPct:80},"other")).status,403);
  assert.equal((await f.run({intensityPct:80,expectedRevision:"stale"})).status,409);
  const patch=profileUnitPatch({weightKg:"154.3234"},{},"imperial");
  assert.equal((await f.run({...patch,intensityPct:85})).status,200);
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].actorId,"coach");assert.equal(f.writes[0].athleteId,"owner");
  assert.ok(Math.abs(f.profiles.owner.weightKg-70)<1e-6);assert.equal(f.profiles.owner.intensityPct,85);assert.equal(JSON.stringify(f.profiles.other),beforeOther);
  assert.equal((await f.run({easyPct:80})).status,400,"cycle preference must not become a duplicate profile field");
});
