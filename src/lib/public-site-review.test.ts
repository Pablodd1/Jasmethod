import test from "node:test";
import assert from "node:assert/strict";
import { renderWebsite } from "./test-helpers/public-website";
import { GET } from "../app/sitemap.xml/route";
import { deliverInquiryOnce } from "./public-inquiry-receipt";
test("public consultation routes remain reachable and indexed after the navigation redesign",async()=>{
 const html=renderWebsite("en"),xml=await (await GET()).text();
 for(const path of ["/book","/contact","/blog","/faq"]){assert.ok(html.includes('href="'+path+'"'));assert.ok(xml.includes('<loc>https://jasmiamimethod.fit'+path+'</loc>'));}
 const booking=renderWebsite("en","/book");assert.match(booking,/Jeffrey Draesel DC/);assert.match(booking,/href="\/contact"/);assert.match(booking,/No appointment has been created|until Cal.com confirms/);
});
test("an accepted inquiry receipt never claims verified inbox delivery or human reading",async()=>{
 const result=await deliverInquiryOnce({requestId:"12345678-1234-4123-8123-123456789abc",inquiry:{name:"Synthetic",email:"visitor@example.invalid",topic:"demo",message:"A synthetic product demonstration inquiry."},available:true,store:{async claim(_id,hash,receipt){return {fresh:true,row:{id:"receipt",before:hash,after:JSON.stringify(receipt)}};},async finish(){}},deliver:async()=>({channel:"smtp"})});
 assert.equal(result.status,200);assert.equal(result.body.ok,true);assert.match("message" in result.body?result.body.message||"":"",/inbox arrival and reading are not confirmed/);
});
