import {test} from "node:test";
import assert from "node:assert/strict";
import {readWriteReceipt} from "./client-save-receipt";
test("save receipts reject rejected, ambiguous and malformed responses before a draft can be cleared",async()=>{
  for(const response of [Response.json({error:"Rejected"},{status:500}),Response.json({ok:false}),Response.json({ok:true}),Response.json({ok:true,log:{}}),new Response("gateway failure",{status:502})])await assert.rejects(readWriteReceipt(response,"log"));
  assert.deepEqual(await readWriteReceipt(Response.json({ok:true,log:{id:"persisted"}}),"log"),{ok:true,log:{id:"persisted"}});
  await assert.rejects(readWriteReceipt(Response.json({ok:true,race:{id:""}}),"race"));
  await assert.rejects(readWriteReceipt(Response.json({ok:true,race:{id:"other-record"}}),"race","expected-record"));
  assert.deepEqual(await readWriteReceipt(Response.json({ok:true})),{ok:true});
});
