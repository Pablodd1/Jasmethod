import test from "node:test";
import assert from "node:assert/strict";
import { deliverInquiryOnce,type InquiryReceiptStore } from "./public-inquiry-receipt";
const inquiry={name:"Synthetic visitor",email:"visitor@example.invalid",topic:"question" as const,message:"Synthetic question about the app only."},requestId="12345678-1234-4123-8123-123456789abc";
function store(){let row:any=null;const value:InquiryReceiptStore={async claim(_request,hash,receipt){if(row)return {fresh:false,row};row={id:"receipt",before:hash,after:JSON.stringify(receipt)};return {fresh:true,row};},async finish(_id,receipt){row.after=JSON.stringify(receipt);}};return {value,read:()=>row};}
test("public inquiry records purpose/version, deduplicates concurrent delivery and binds the exact request",async()=>{
  const s=store();let sends=0;const opts={requestId,inquiry,store:s.value,available:true,deliver:async()=>{sends++;return {channel:"smtp" as const};}};
  const results=await Promise.all([deliverInquiryOnce(opts),deliverInquiryOnce(opts)]);assert.equal(sends,1);assert.ok(results.some(r=>r.status===200));assert.ok(results.every(r=>[200,202].includes(r.status)));
  assert.equal((await deliverInquiryOnce(opts)).status,200);assert.equal(sends,1);
  assert.equal((await deliverInquiryOnce({...opts,inquiry:{...inquiry,message:inquiry.message+" Changed."}})).status,409);
  const audit=JSON.parse(s.read().after);assert.equal(audit.purpose,"reply_to_inquiry");assert.equal(audit.consentVersion,"public-inquiry-reply-v1");assert.doesNotMatch(JSON.stringify(s.read()),/visitor@example|Synthetic question/);
});
test("unavailable or uncertain inquiry transport never claims delivered and never automatically resends",async()=>{
  for(const available of [false,true]){const s=store();let sends=0;const opts={requestId,inquiry,store:s.value,available,deliver:async()=>{sends++;throw Error("Synthetic timeout");}};
    const first=await deliverInquiryOnce(opts),again=await deliverInquiryOnce(opts);assert.equal(first.body.ok,false);assert.equal(again.body.ok,false);assert.equal(first.status,available?202:503);assert.equal(sends,available?1:0);}
});
test("invalid request IDs cannot reserve or send an inquiry",async()=>{const s=store();const result=await deliverInquiryOnce({requestId:"invalid",inquiry,store:s.value,available:true,deliver:async()=>{throw Error("must not send");}});assert.equal(result.status,400);assert.equal(s.read(),null);});
