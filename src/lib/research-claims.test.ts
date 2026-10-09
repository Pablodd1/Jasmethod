import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {RESEARCH_SOURCES} from "./research";
test("legacy synthesis references do not claim intervention validation",()=>{
 const byId=(id:string)=>RESEARCH_SOURCES.find(source=>source.id===id)!;
 assert.equal(byId("seiler2009").level,"B");assert.match(byId("seiler2009").ref,/Sportscience/);
 assert.equal(byId("buchheit2014").level,"B");assert.match(byId("buchheit2014").claim,/not validation/);
 assert.equal(byId("stoggl2016").level,"C");assert.match(byId("stoggl2016").ref,/unverified/);
});
test("legacy session descriptions cannot claim a best dose or a race prediction",()=>{
 const source=readFileSync("src/lib/science.ts","utf8");
 assert.doesNotMatch(source,/Best fitness-per-minute|single best marathon|Int J Sports Physiol Perform 4:417-429/);
 assert.match(source,/CSS is not a directly measured lactate threshold/);
});
