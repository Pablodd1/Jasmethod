import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { parseSupportMessage } from "./support-delivery";
import { PUBLIC_CONTACT_EMAIL } from "./public-contact";
import { supportContacts } from "./support-contact";

const require = createRequire(import.meta.url);
const ts = require("typescript");
function fixture() {
  const state = { authenticated: true, configured: true, count: 0, sends: 0, locks: 0, creates: [] as any[], updates: [] as any[] };
  const db = {
    $queryRaw: async () => { state.locks++; },
    appEvent: {
      count: async () => state.count,
      create: async (input: any) => { state.creates.push(input); return { id: "fixture-event" }; },
      update: async (input: any) => { state.updates.push(input); return {}; },
    },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run(db),
  };
  const deps: Record<string, unknown> = {
    "next/server": { NextResponse: Response },
    "@/lib/support-contact": { supportContacts },
    "@/lib/support-delivery": { parseSupportMessage, supportTelegramConfigured: () => state.configured, deliverSupportMessage: async () => { state.sends++; return 72; } },
    "@/lib/auth": { getCurrentUser: async () => state.authenticated ? { id: "fixture-user", email: "fixture@example.com" } : null },
    "@/lib/db": { prisma: db },
  };
  const exports: any = {};
  const js = ts.transpileModule(readFileSync("src/app/api/support/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(js, { exports, require: (key: string) => { if (!(key in deps)) throw Error("Unmocked dependency"); return deps[key]; }, Response, Request, Buffer, URL, Date, process: { env: { SMTP_PASS: "secret" } } });
  function request(body: unknown = { category: "login", message: "I need help with my account." }, headers: Record<string, string> = {}) {
    return new Request("https://app.example.com/api/support", { method: "POST", headers: { origin: "https://app.example.com", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  }
  return { state, api: exports, request };
}

test("support route rejects cross-origin, logged-out, unavailable, and oversized requests before sending", async () => {
  const { api, state, request } = fixture();
  assert.equal((await api.POST(request(undefined, { origin: "https://other.example.com" }))).status, 403);
  state.authenticated = false;
  assert.equal((await api.POST(request())).status, 401);
  state.authenticated = true; state.configured = false;
  assert.equal((await api.POST(request())).status, 503);
  state.configured = true;
  assert.equal((await api.POST(request({ category: "login", message: "x".repeat(9000) }))).status, 413);
  assert.equal(state.sends, 0);
  assert.equal(state.creates.length, 0);
});

test("support route reserves with a user lock, rejects quota, and stores no message or email", async () => {
  const { api, state, request } = fixture();
  state.count = 3;
  assert.equal((await api.POST(request())).status, 429);
  assert.equal(state.locks, 1);
  assert.equal(state.sends, 0);
  state.count = 0;
  const response = await api.POST(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.equal(state.sends, 1);
  assert.equal(state.locks, 2);
  const stored = JSON.stringify([state.creates, state.updates]);
  assert.doesNotMatch(stored, /I need help|fixture@example.com/);
  assert.match(stored, /accepted/);
  assert.match(stored, /72/);
});

test("public support config returns only allowed destinations and capability", async () => {
  const { api } = fixture();
  assert.deepEqual(await api.GET().json(), { email: PUBLIC_CONTACT_EMAIL, telegramUsername: null, telegramSupportAvailable: true });
});
