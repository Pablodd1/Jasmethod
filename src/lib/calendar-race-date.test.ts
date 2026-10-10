import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as dates from "./dates";

test("calendar race month bounds and display preserve entered calendar days across timezones and DST",async()=>{
 for(const timezone of ["America/New_York","Pacific/Auckland"]) {
  const rows=["2026-10-31T23:45:00Z","2026-11-01T00:00:00Z","2026-11-15T15:45:00Z","2026-12-01T00:00:00Z"].map((date,i)=>({id:`event-${i}`,date:new Date(date),name:"Synthetic race",priority:1}));
  const deps:Record<string,unknown>={
   "@/lib/workout-update":{workoutRevision:()=>"fixture"},"next/server":{NextResponse:Response},"@/lib/dates":dates,"@/lib/access":{},
   "@/lib/auth":{getCurrentUser:async()=>({id:"athlete",timezone})},
   "@/lib/db":{prisma:{calendarEvent:{findMany:async()=>[]},workout:{findMany:async()=>[]},trainingPlan:{findMany:async()=>[]},race:{findMany:async({where}:any)=>{assert.equal(where.userId,"athlete");assert.equal(where.date.gte.toISOString(),"2026-11-01T00:00:00.000Z");assert.equal(where.date.lt.toISOString(),"2026-12-01T00:00:00.000Z");return rows.filter(row=>row.date>=where.date.gte&&row.date<where.date.lt)}}}},
  };
  const compiled=ts.transpileModule(fs.readFileSync("src/app/api/calendar/route.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const mod:any={exports:{}};vm.runInNewContext(compiled,{module:mod,exports:mod.exports,require:(id:string)=>{if(id in deps)return deps[id];throw Error(id)},URL,Response,Request});
  const response=await mod.exports.GET(new Request("https://example.test/api/calendar?month=2026-11"));assert.equal(response.status,200);
  const result=await response.json();assert.deepEqual(result.races.map((row:any)=>row.dateKey),["2026-11-01","2026-11-15"]);
  for(const row of result.races)assert.equal(dates.dateKey(new Date(row.date),timezone),row.dateKey);
 }
});
