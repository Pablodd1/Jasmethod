import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as parser from "./public-inquiry";
import * as once from "./public-inquiry-receipt";
import { PUBLIC_CONTACT_EMAIL } from "./public-contact";
const requestId="12345678-1234-4123-8123-123456789abc",base="https://app.example.invalid";
const payload={name:"Synthetic visitor",email:"visitor@example.invalid",topic:"question",message:"Synthetic product-only inquiry without health information.",website:"",consent:true,requestId};
function fixture(opts:{telegram?:boolean;telegramReceipt?:unknown;accepted?:string[];fail?:boolean}={}){
  const rows=new Map<string,any>();let smtp=0,telegram=0;
  const event={async findUnique({where}:any){return rows.get(where.id)||null;},async findUniqueOrThrow({where}:any){const r=rows.get(where.id);if(!r)throw Error("Missing fixture receipt");return r;},async create({data}:any){rows.set(data.id,{...data});return data;},async update({where,data}:any){const r={...rows.get(where.id),...data};rows.set(where.id,r);return r;}};
  const db:any={appEvent:event,$executeRaw:async()=>1};db.$transaction=async(fn:any)=>fn(db);
  const deps:Record<string,unknown>={"next/server":{NextResponse:{json:Response.json}},"@/lib/db":{prisma:db},"@/lib/public-inquiry":parser,"@/lib/public-inquiry-receipt":once,"@/lib/public-contact":{PUBLIC_CONTACT_EMAIL},
    "@/lib/support-delivery":{supportTelegramConfigured:()=>!!opts.telegram,deliverSupportMessage:async()=>{telegram++;return opts.telegramReceipt??null;}},
    nodemailer:{__esModule:true,default:{createTransport:()=>({async sendMail(options:any){smtp++;assert.equal(options.to,PUBLIC_CONTACT_EMAIL);assert.equal(options.replyTo,payload.email);if(opts.fail)throw Error("Synthetic timeout");return {accepted:opts.accepted??[PUBLIC_CONTACT_EMAIL]};},close(){}})}}};
  const compiled=ts.transpileModule(readFileSync("src/app/api/public-inquiry/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  const loaded={exports:{} as any};runInNewContext(compiled,{module:loaded,exports:loaded.exports,Buffer,Response,URL,process:{env:{SMTP_HOST:"mail.example.invalid",SMTP_FROM:"sender@example.invalid",SMTP_USER:"synthetic",SMTP_PASS:"synthetic"}},require:(name:string)=>{if(name in deps)return deps[name];throw Error("Unexpected inquiry dependency: "+name);}});
  return {post:(body:any=payload,origin=base)=>loaded.exports.POST(new Request(base+"/api/public-inquiry",{method:"POST",headers:{origin,"content-type":"application/json"},body:JSON.stringify(body)})),counts:()=>({smtp,telegram}),rows};
}
test("actual inquiry route requires origin and explicit consent before storage or any transport",async()=>{
  const f=fixture();assert.equal((await f.post(payload,"https://foreign.example.invalid")).status,403);assert.equal((await f.post({...payload,consent:false})).status,400);assert.equal(f.rows.size,0);assert.deepEqual(f.counts(),{smtp:0,telegram:0});
});
test("actual inquiry route persists a minimal consent receipt and accepts a matching SMTP recipient once",async()=>{
  const f=fixture();for(let n=0;n<2;n++){const response=await f.post();assert.equal(response.status,200);const result=await response.json();assert.equal(result.state,"accepted");assert.match(result.message,/not confirmed/);}
  assert.deepEqual(f.counts(),{smtp:1,telegram:0});assert.equal(f.rows.size,1);const row=[...f.rows.values()][0];assert.equal(row.source,"public-inquiry-receipt");assert.doesNotMatch(row.meta,/visitor@example|Synthetic product/);assert.match(row.meta,/reply_to_inquiry/);
  assert.equal((await f.post({...payload,message:payload.message+" changed"})).status,409);assert.equal(f.counts().smtp,1);
});
test("actual inquiry route holds mismatched or timed-out SMTP receipts without false success or resend",async()=>{
  for(const opts of [{accepted:["other@example.invalid"]},{fail:true}]){const f=fixture(opts);for(let n=0;n<2;n++){const r=await f.post();assert.equal(r.status,202);assert.equal((await r.json()).ok,false);}assert.equal(f.counts().smtp,1);}
});
test("an uncertain Telegram attempt cannot silently fall back to email",async()=>{
  const f=fixture({telegram:true});const r=await f.post();assert.equal(r.status,202);assert.equal((await r.json()).state,"unknown");assert.deepEqual(f.counts(),{smtp:0,telegram:1});
  const accepted=fixture({telegram:true,telegramReceipt:{id:"synthetic-receipt"}});const response=await accepted.post();assert.equal(response.status,200);assert.equal((await response.json()).channel,"telegram");assert.deepEqual(accepted.counts(),{smtp:0,telegram:1});
});
