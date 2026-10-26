import test from "node:test";
import assert from "node:assert/strict";
import { readGarminDeliveryRequest } from "./garmin-delivery-request";
import { GarminError } from "./garmin-config";
const request=(value:unknown,headers:Record<string,string>={})=>new Request("https://app.example/action",{method:"POST",headers:{origin:"https://app.example","content-type":"application/json",...headers},body:JSON.stringify(value)});
test("delivery requests bind origin and refuse client-selected athlete identities",async()=>{
 const old=process.env.APP_URL;process.env.APP_URL="https://app.example";
 try{for(const value of [{userId:"other",enabled:true},{athleteId:"other",enabled:true},[],null])await assert.rejects(readGarminDeliveryRequest(request(value),"fixture-origin",["enabled"]));
 await assert.rejects(readGarminDeliveryRequest(request({enabled:true},{origin:"https://other.example"}),"fixture-origin",["enabled"]));
 assert.deepEqual(await readGarminDeliveryRequest(request({enabled:false}),"fixture-valid",["enabled"]),{enabled:false});}finally{if(old==null)delete process.env.APP_URL;else process.env.APP_URL=old;}
});
test("delivery request oversized stream is refused before JSON processing",async()=>{const old=process.env.APP_URL;process.env.APP_URL="https://app.example";try{await assert.rejects(readGarminDeliveryRequest(request({sessionId:"x".repeat(3000)}),"fixture-large",["sessionId"]),(e:unknown)=>e instanceof GarminError && e.status===413);}finally{if(old==null)delete process.env.APP_URL;else process.env.APP_URL=old;}});
