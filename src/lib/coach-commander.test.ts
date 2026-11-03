import {test} from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {commanderDraft,commanderReceipt} from "./coach-commander";
import {commanderPlan,getCommanderState,commanderRequestHash} from "./coach-commander-service";
import {prisma} from "./db";
const token="a".repeat(64),actor={id:"commander-owner",timezone:"America/New_York",language:"en"};
test("commander extracts explicit plan horizon/start without guessing race dates or ambiguous numbers",()=>{
  assert.deepEqual(commanderDraft("Build my 8 week plan starting 2026-11-02"),{area:"plan",weeks:8,startDate:"2026-11-02",questions:[]});
  assert.equal(commanderDraft("My race is 2027-01-31; build a plan")?.startDate,undefined);
  assert.equal(commanderDraft("Plan starting 2026-02-30")?.startDate,undefined);
  assert.equal(commanderDraft("Build 8 weeks or 12 weeks")?.weeks,undefined);
  assert.equal(commanderDraft("I can train every weekday")?.area,"profile");
  assert.equal(commanderDraft("Build my 12 week triathlon plan")?.area,"plan");
  assert.equal(commanderDraft("Quiero un plan de triathlon de 8 semanas")?.weeks,8);
  assert.equal(commanderDraft("Find my triathlon venue")?.area,"race");
  assert.equal(commanderDraft("hello"),null);
  assert.equal(commanderDraft("x".repeat(4001)),null);
});
function audit(raw:Record<string,unknown>={weeks:8,startDate:"2026-11-02"}){return {id:"receipt-owner",entityId:"plan-owner",createdAt:new Date("2026-10-24T12:00Z"),after:JSON.stringify({planId:"plan-owner",name:"Reviewed cycle",previewToken:token,commander:{origin:"private_coach",sourceMessageId:null,requestHash:commanderRequestHash(raw)}})};}

test("manual baseline choice changes request identity while omitted and false preserve legacy receipts",()=>{
  const raw={weeks:8,startDate:"2026-11-02"};
  const legacy=createHash("sha256").update(JSON.stringify({weeks:8,startDate:"2026-11-02",easyPct:null,trainingWindow:null,sourceMessageId:null,confirmDoubleDay:false,confirmEventTradeoffs:false})).digest("hex");
  assert.equal(commanderRequestHash(raw),legacy);
  assert.equal(commanderRequestHash({...raw,manualBaselinePlanning:false}),legacy);
  assert.notEqual(commanderRequestHash({...raw,manualBaselinePlanning:true}),legacy);
});
test("only an actual well-formed plan audit becomes a receipt",()=>{
  assert.equal(commanderReceipt(null),null);
  assert.equal(commanderReceipt({...audit(),after:'{"ok":true}'}),null);
  assert.equal(commanderReceipt({...audit(),entityId:"another-plan"}),null);
  assert.equal(commanderReceipt(audit())?.planId,"plan-owner");
});
test("commander rejects arbitrary writes, invalid fields and foreign source messages before generation",async()=>{
  const original=prisma.coachConversationMessage.findFirst;
  let calls=0;
  (prisma.coachConversationMessage as any).findFirst=async({where}:any)=>{assert.equal(where.userId,actor.id);assert.equal(where.role,"user");return null;};
  const generate=async()=>{calls++;return Response.json({ok:true});};
  const raw={action:"preview",weeks:8,startDate:"2026-11-02"};
  try{
    for(const patch of [{athleteId:"foreign"},{action:"delete"},{weeks:3},{weeks:"8"},{startDate:"2026-02-30"},{easyPct:NaN},{trainingWindow:"night"},{confirmDoubleDay:"true"},{manualBaselinePlanning:"true"},{manualBaselinePlanning:1},{manualBaselinePlanning:null},{sourceMessageId:"foreign-message"},{manualBaselinePlanning:true,sourceMessageId:"foreign-message"}])await assert.rejects(commanderPlan(new Request("http://localhost/api/assistant/plan"),actor,{...raw,...patch},generate));
    assert.equal(calls,0);
  }finally{prisma.coachConversationMessage.findFirst=original;}
});
test("preview reuses existing planner and preserves error statuses without saving",async()=>{
  const response=await commanderPlan(new Request("http://localhost/api/assistant/plan",{headers:{origin:"http://localhost"}}),actor,{action:"preview",weeks:8,startDate:"2026-11-02"},async req=>{
    const body=await req.json();assert.equal(body.preview,true);assert.equal(body.commanderContext.origin,"private_coach");assert.equal(body.commanderContext.sourceMessageId,null);
    assert.equal(body.weeks,8);assert.equal(body.confirmed,undefined);assert.equal(body.manualBaselinePlanning,false);
    return Response.json({error:"Missing current setup evidence"},{status:422});
  });
  assert.equal(response.status,422);assert.equal((await response.json()).error,"Missing current setup evidence");
});

test("explicit inline baseline preview reaches the same protected planner with a matching request hash",async()=>{
  const raw={action:"preview",weeks:8,startDate:"2026-11-02",manualBaselinePlanning:true};let calls=0;
  const response=await commanderPlan(new Request("http://localhost/api/assistant/plan"),actor,raw,async req=>{
    calls++;const body=await req.json();
    assert.equal(body.manualBaselinePlanning,true);
    assert.equal(body.preview,true);
    assert.equal(body.commanderContext.requestHash,commanderRequestHash(body));
    assert.equal(body.athleteId,undefined);
    return Response.json({error:"The athlete must confirm a separately reported recent baseline before manual-baseline planning."},{status:409});
  });
  assert.equal(calls,1);assert.equal(response.status,409);
  assert.match((await response.json()).error,/athlete must confirm/);
});

test("baseline receipt replays once but cannot authorize another planning basis",async()=>{
  const original=prisma.auditLog.findMany;let rows:any[]=[],calls=0;
  const body={action:"confirm",weeks:8,startDate:"2026-11-02",manualBaselinePlanning:true,previewToken:token};
  (prisma.auditLog as any).findMany=async({where}:any)=>{assert.equal(where.actorId,actor.id);assert.equal(where.subjectId,actor.id);return rows;};
  const generate=async(req:Request)=>{calls++;const forwarded=await req.json();assert.equal(forwarded.manualBaselinePlanning,true);rows=[audit(body)];return Response.json({ok:true});};
  try{
    const first=await(await commanderPlan(new Request("http://localhost/api/assistant/plan"),actor,body,generate)).json();
    assert.equal(first.receipt.planId,"plan-owner");assert.equal(calls,1);
    const replay=await(await commanderPlan(new Request("http://localhost/api/assistant/plan"),actor,body,generate)).json();
    assert.equal(replay.replayed,true);assert.equal(calls,1);
    await assert.rejects(commanderPlan(new Request("http://localhost/api/assistant/plan"),actor,{...body,manualBaselinePlanning:false},generate),/different reviewed inputs/);
    const {manualBaselinePlanning:_,...omitted}=body;
    await assert.rejects(commanderPlan(new Request("http://localhost/api/assistant/plan"),actor,omitted,generate),/different reviewed inputs/);
    assert.equal(calls,1);
  }finally{prisma.auditLog.findMany=original;}
});
test("confirmed receipt survives reload and replay never calls planner twice",async()=>{
  const originals={profile:prisma.athleteProfile.findUnique,plans:prisma.trainingPlan.findMany,audits:prisma.auditLog.findMany,setup:prisma.auditLog.findFirst};
  let rows:any[]=[],calls=0;
  (prisma.athleteProfile as any).findUnique=async({where}:any)=>{assert.equal(where.userId,actor.id);return null;};
  (prisma.trainingPlan as any).findMany=async()=>[];
  (prisma.auditLog as any).findFirst=async()=>null;
  (prisma.auditLog as any).findMany=async({where}:any)=>{assert.equal(where.actorId,actor.id);assert.equal(where.subjectId,actor.id);return rows;};
  const body={action:"confirm",weeks:8,startDate:"2026-11-02",previewToken:token};
  const generate=async()=>{calls++;rows=[audit()];return Response.json({ok:true});};
  try{
    const first=await (await commanderPlan(new Request("http://localhost/api/assistant/plan"),actor,body,generate)).json();
    assert.equal(first.receipt.planId,"plan-owner");assert.equal(calls,1);
    const reloaded=await getCommanderState(actor);assert.equal(reloaded.receipt?.id,first.receipt.id);
    const replay=await (await commanderPlan(new Request("http://localhost/api/assistant/plan"),actor,body,generate)).json();assert.equal(replay.replayed,true);assert.equal(calls,1);
    await assert.rejects(commanderPlan(new Request("http://localhost/api/assistant/plan"),actor,{...body,weeks:12},generate),/different reviewed inputs/);assert.equal(calls,1);
  }finally{prisma.athleteProfile.findUnique=originals.profile;prisma.trainingPlan.findMany=originals.plans;prisma.auditLog.findMany=originals.audits;prisma.auditLog.findFirst=originals.setup;}
});
