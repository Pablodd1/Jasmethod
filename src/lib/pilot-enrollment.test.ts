import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as pilot from "./pilot-limit";

function fixture(file: string, total: number, role = "admin") {
  const state = { created: 0, sessions: 0, audit: 0, locked: false, isolation: "", counts: 0 };
  const existing = { id: "existing", email: "athlete@example.invalid", name: "Fixture", passwordHash: "fixture-hash", role: "athlete", onboarded: false };
  const db: any = {
    $executeRaw: async () => { state.locked = true; return 1; },
    user: {
      findUnique: async () => file.includes("/login/") ? existing : null,
      count: async () => { assert.equal(state.locked, true); state.counts++; return total; },
      create: async ({ data }: any) => { assert.equal(state.locked, true); state.created++; return { ...data, id: "created", onboarded: false }; },
    },
    auditLog: { create: async () => { state.audit++; } },
    $transaction: async (work: any, options: any) => { state.isolation = options.isolationLevel; return work(db); },
  };
  class ApiError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: { json: (data: unknown, init?: ResponseInit) => Response.json(data, init) } },
    "@/lib/db": { prisma: db }, "@/lib/pilot-limit": pilot,
    "@/lib/auth": { getCurrentUser: async () => ({ id: "operator", role }), hashPassword: () => "fixture-hash", verifyPassword: () => true, isRevokedDemoPassword: () => false,
      createSession: async () => { state.sessions++; return "fixture-session"; }, setSessionCookie: async () => {} },
    "@/lib/email": { sendEmail: async () => {}, welcomeEmail: () => ({ subject: "fixture", html: "fixture" }) },
    "@/lib/cycle": { youthPolicy: () => ({ allowed: true }) },
    "@/lib/admin": { isAdminEmail: () => false, syncAdminRole: async () => "athlete" },
    "@/lib/ratelimit": { rateLimit: () => ({ ok: true }), clientIp: () => "fixture-ip" },
    "@/lib/access": { ApiError, errorResponse: (error: ApiError) => Response.json({ error: error.message }, { status: error.status || 500 }) },
    crypto: {},
  };
  const exports: any = {};
  const source = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, Response, console: { error: () => {} }, require: (name: string) => {
    if (!(name in dependencies)) throw new Error(`Unmocked dependency ${name}`);
    return dependencies[name];
  } });
  const request = () => new Request("https://fixture.example.invalid/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "athlete@example.invalid", password: "fixture-password", tempPassword: "fixture-password", name: "Fixture", birthYear: 1990 }) });
  return { state, post: () => exports.POST(request()) as Promise<Response> };
}

test("password and admin-coach enrollment reject a full pilot before creation", async () => {
  for (const file of ["src/app/api/auth/signup/route.ts", "src/app/api/admin/coaches/route.ts"]) {
    const f = fixture(file, 50), response = await f.post();
    assert.equal(response.status, 409);
    assert.equal((await response.json()).code, "pilot_full");
    assert.equal(f.state.created + f.state.sessions + f.state.audit, 0);
    assert.equal(f.state.isolation, "ReadCommitted");
  }
});

test("last seat allows password and coach creation and keeps coach audit transactional", async () => {
  for (const file of ["src/app/api/auth/signup/route.ts", "src/app/api/admin/coaches/route.ts"]) {
    const f = fixture(file, 49), response = await f.post();
    assert.equal(response.status, 200); assert.equal(f.state.created, 1);
    assert.equal(f.state.audit, file.includes("/coaches/") ? 1 : 0);
    if (file.includes("/signup/")) assert.equal((await response.json()).user.onboarded, false);
  }
});

test("password sign-in remains available at capacity and returns onboarding state", async () => {
  const f = fixture("src/app/api/auth/login/route.ts", 50), response = await f.post();
  assert.equal(response.status, 200); assert.equal((await response.json()).user.onboarded, false);
  assert.equal(f.state.sessions, 1); assert.equal(f.state.counts + f.state.created, 0);
});

test("athletes cannot use coach provisioning even when capacity is available", async () => {
  const f = fixture("src/app/api/admin/coaches/route.ts", 1, "athlete");
  assert.equal((await f.post()).status, 403); assert.equal(f.state.counts + f.state.created, 0);
});
