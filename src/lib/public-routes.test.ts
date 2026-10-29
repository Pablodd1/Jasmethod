import test from "node:test";
import assert from "node:assert/strict";
import { publicRoute,publicHref } from "./public-routes";
test("public language links preserve context and fragments without localizing athlete or API routes",()=>{
  assert.equal(publicHref("es","/"),"/es");assert.equal(publicHref("es","/science/sleep"),"/es/science/sleep");assert.equal(publicHref("es","/privacy#optional-ai"),"/es/privacy#optional-ai");
  for(const path of ["/api/auth/me","/training","/settings","/blog/why-a-daily-coach-needs-context"])assert.equal(publicHref("es",path),path);
  assert.deepEqual(publicRoute("/es/science/sleep/"),{locale:"es",base:"/science/sleep",localized:true});
  assert.equal(publicRoute("/es/training").localized,false);assert.equal(publicRoute("/esoteric").locale,"en");assert.equal(publicRoute("/science/j-metrics").localized,false);
});
