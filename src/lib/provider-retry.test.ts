import test from "node:test";
import assert from "node:assert/strict";
import { providerRetryAfterMs } from "./provider-retry";
test("provider cooldown preserves long Retry-After values, handles HTTP dates and bounds malformed responses",()=>{
 const now=Date.parse("2026-10-25T12:00:00Z");
 assert.equal(providerRetryAfterMs("370",now),370000);
 assert.equal(providerRetryAfterMs("Sun, 25 Oct 2026 12:06:10 GMT",now),370000);
 for(const value of [null,"bad","-1","0","Infinity"])assert.equal(providerRetryAfterMs(value,now),60000);
 assert.equal(providerRetryAfterMs("999999999999999",now),86400000);
});
