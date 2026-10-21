import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { ApiError } from "./access";
import { readScenarioJson, scenarioError, SCENARIO_HEADERS } from "./race-scenario-http";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_REQUEST_BYTES } from "./upload-limits";
import { parseRaceCourseGpx, RACE_GPX_MAX_BYTES } from "./race-course";

function route() {
  let parses = 0;
  const deps: Record<string, unknown> = {
    "@/lib/access": { ApiError, trainingAccess: async () => ({ actor: { id: "synthetic" } }) },
    "@/lib/ratelimit": { rateLimit: () => ({ ok: true }) },
    "@/lib/race-course": { parseRaceCourseGpx: (gpx: string) => { parses++; return parseRaceCourseGpx(gpx); } },
    "@/lib/race-scenario-http": { readScenarioJson, scenarioError, SCENARIO_HEADERS },
    "@/lib/upload-limits": { MAX_UPLOAD_REQUEST_BYTES },
  };
  const mod = { exports: {} as { POST: (request: Request) => Promise<Response> } };
  const code = ts.transpileModule(fs.readFileSync("src/app/api/race-scenarios/course/route.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module: mod, exports: mod.exports, Response, require: (name: string) => {
    assert.ok(name in deps, name); return deps[name];
  } });
  return { post: mod.exports.POST, parses: () => parses };
}

test("course parser and authenticated JSON route stay below the hosting request limit", async () => {
  assert.equal(RACE_GPX_MAX_BYTES, MAX_UPLOAD_BYTES);
  assert.equal(MAX_UPLOAD_BYTES, 4_000_000);
  assert.ok(MAX_UPLOAD_REQUEST_BYTES < 4_500_000);
  assert.throws(() => parseRaceCourseGpx("x".repeat(MAX_UPLOAD_BYTES + 1)), /at most 4 MB/);
  const fixture = route();
  const declared = await fixture.post(new Request("https://example.invalid/api/race-scenarios/course", {
    method: "POST", headers: { "Content-Length": String(MAX_UPLOAD_REQUEST_BYTES + 1) }, body: "{}",
  }));
  assert.equal(declared.status, 413); assert.equal(fixture.parses(), 0);
  const streamed = await fixture.post(new Request("https://example.invalid/api/race-scenarios/course", {
    method: "POST", body: JSON.stringify({ gpx: "é".repeat(MAX_UPLOAD_REQUEST_BYTES / 2 + 1) }),
  }));
  assert.equal(streamed.status, 413); assert.equal(fixture.parses(), 0);
  assert.match(streamed.headers.get("cache-control")!, /no-store/);
});
