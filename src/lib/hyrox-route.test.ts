import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import * as hyrox from "./hyrox";
const require = createRequire(import.meta.url);
const ts = require("typescript");
function fixture() {
  const state = { authenticated: true, pace: 300 as number | null, reads: [] as any[] };
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: Response },
    "@/lib/auth": { getCurrentUser: async () => state.authenticated ? { id: "fixture-user" } : null },
    "@/lib/db": { prisma: { athleteProfile: { findUnique: async (query: any) => { state.reads.push(query); return { runPaceBase: state.pace, sex: "female" }; } } } },
    "@/lib/hyrox": hyrox,
  };
  const exports: any = {};
  const js = ts.transpileModule(readFileSync("src/app/api/hyrox/split-planner/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { exports, require: (key: string) => { if (!(key in deps)) throw Error("Unmocked dependency"); return deps[key]; }, Response, Request, URL });
  const request = (body: unknown) => new Request("https://app.example.com/api/hyrox/split-planner", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { state, api: exports, request };
}
test("HYROX GET and POST use the same athlete profile scenario and never fabricate missing pace", async () => {
  const { state, api, request } = fixture();
  const get = await api.GET(new Request("https://app.example.com/api/hyrox/split-planner?target=80&pro=1"));
  const post = await api.POST(request({ target: 80, pro: true, actualSecs: Array(16).fill(null) }));
  assert.equal(get.status, 200); assert.equal(post.status, 200);
  const g = await get.json(), p = await post.json();
  assert.deepEqual(g.plan, p.plan); assert.equal(g.plan.runPaceSecPerKm, 300);
  assert.equal(p.analysis.stationGaps.length, 0); assert.match(g.plan.notes.join(" "), /Women Pro/);
  assert.ok(state.reads.every(q => q.where.userId === "fixture-user"));
  state.pace = null;
  assert.equal((await api.GET(new Request("https://app.example.com/api/hyrox/split-planner?target=80"))).status, 400);
  assert.equal((await api.POST(request({ target: 80, actualSecs: Array(16).fill(null) }))).status, 400);
  assert.equal((await api.POST(request({ target: 80, pace: 310, actualSecs: Array(16).fill("") }))).status, 200);
});
test("HYROX rejects unauthenticated access and malformed actual splits without writes", async () => {
  const { state, api, request } = fixture();
  state.authenticated = false;
  assert.equal((await api.GET(new Request("https://app.example.com/api/hyrox/split-planner?target=80"))).status, 401);
  assert.equal((await api.POST(request({}))).status, 401); assert.equal(state.reads.length, 0);
  state.authenticated = true;
  for (const bad of [Array(16).fill(0), Array(16).fill(-1), Array(16).fill("300abc"), []]) {
    assert.equal((await api.POST(request({ target: 80, actualSecs: bad }))).status, 400);
  }
  assert.equal((await api.POST(request({ target: 25, actualSecs: Array(16).fill(null) }))).status, 400);
  assert.equal((await api.POST(request({ target: 80, sex: "invalid", actualSecs: Array(16).fill(null) }))).status, 400);
});
