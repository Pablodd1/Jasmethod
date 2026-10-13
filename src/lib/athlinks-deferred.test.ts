import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as availability from "./athlinks-availability";

function load(file: string, dependencies: Record<string, unknown>, extras = {}) {
  const exports: any = {};
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, Response, URL, URLSearchParams, AbortSignal, process: { env: { ATHLINKS_API_KEY: "synthetic-key" } },
    require: (name: string) => { if (!(name in dependencies)) throw Error(`Unexpected dependency: ${name}`); return dependencies[name]; }, ...extras });
  return exports;
}

test("deferred Athlinks blocks direct provider calls and cron without touching saved data", async () => {
  let calls = 0;
  const forbidden = () => { calls++; throw Error("No external calls or data writes allowed"); };
  const lib = load("src/lib/athlinks.ts", {
    "./db": { prisma: { connector: { findMany: forbidden, update: forbidden }, race: { create: forbidden, update: forbidden } } },
    "./athlinks-availability": availability,
  }, { fetch: forbidden });
  assert.equal(lib.athlinksConfigured(), true, "A stored credential does not activate a deferred provider");
  await assert.rejects(lib.searchAthletes("Synthetic"), /deferred/);
  await assert.rejects(lib.getAthleteResults("synthetic-profile"), /deferred/);
  assert.deepEqual(JSON.parse(JSON.stringify(await lib.syncAthlinksForAllUsers())), { users: 0, imported: 0, merged: 0, errors: [], deferred: true });
  assert.equal(calls, 0);
});

test("Athlinks search/link/refresh stay authenticated and fail closed before provider or database work", async () => {
  for (const authenticated of [false, true]) {
    let forbiddenCalls = 0;
    const forbidden = () => { forbiddenCalls++; throw Error("Unexpected operation"); };
    const dependencies = {
      "next/server": { NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) } },
      "@/lib/auth": { getCurrentUser: async () => authenticated ? { id: "synthetic-athlete" } : null },
      "@/lib/ratelimit": { rateLimit: forbidden },
      "@/lib/db": { prisma: { connector: { findUnique: forbidden, upsert: forbidden, update: forbidden } } },
      "@/lib/athlinks": { athlinksConfigured: () => true, searchAthletes: forbidden, getAthleteResults: forbidden, importAthlinksResults: forbidden },
      "@/lib/athlinks-availability": availability,
    };
    const route = load("src/app/api/connectors/athlinks/route.ts", dependencies);
    const search = load("src/app/api/connectors/athlinks/search/route.ts", dependencies);
    for (const response of await Promise.all([route.POST(new Request("https://example.invalid/api", { method: "POST" })), route.PATCH(), search.GET(new Request("https://example.invalid/api?q=Synthetic"))])) {
      assert.equal(response.status, authenticated ? 503 : 401);
      if (authenticated) assert.equal((await response.json()).code, "provider_deferred");
    }
    assert.equal(forbiddenCalls, 0);
  }
});

test("deferred Athlinks keeps saved status readable and preserves athlete-scoped explicit unlink", async () => {
  let raceDeletes = 0;
  let connectorDeletes = 0;
  const route = load("src/app/api/connectors/athlinks/route.ts", {
    "next/server": { NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) } },
    "@/lib/auth": { getCurrentUser: async () => ({ id: "synthetic-athlete" }) },
    "@/lib/ratelimit": {},
    "@/lib/athlinks": { athlinksConfigured: () => true },
    "@/lib/athlinks-availability": availability,
    "@/lib/db": { prisma: {
      connector: {
        findUnique: async ({ where }: any) => { assert.equal(where.userId_provider.userId, "synthetic-athlete"); return { externalRef: "saved-profile", status: "error", lastSyncAt: null }; },
        deleteMany: async ({ where }: any) => { assert.equal(where.userId, "synthetic-athlete"); assert.equal(where.provider, "athlinks"); connectorDeletes++; },
      },
      race: { count: async ({ where }: any) => { assert.equal(where.userId, "synthetic-athlete"); assert.equal(where.source, "athlinks"); return 3; }, deleteMany: async () => { raceDeletes++; } },
    } },
  });
  const saved = await (await route.GET()).json();
  assert.equal(saved.deferred, true); assert.equal(saved.linked, true); assert.equal(saved.raceCount, 3);
  assert.equal((await route.DELETE()).status, 200);
  assert.equal(connectorDeletes, 1); assert.equal(raceDeletes, 0);
});
