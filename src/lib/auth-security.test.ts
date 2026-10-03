/** Synthetic auth regressions. All database, cookie, and OAuth I/O is mocked. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const nextHeaders = require("next/headers");
const crypto = require("crypto");
const uniquePassword = "Synthetic-only-unique-2026!";
const legacyHash = (password: string) => `synthetic-salt:${createHash("sha256").update(`synthetic-salt::${password}`).digest("hex")}`;
const revokedDigest = "0ead2060b65992dca4769af601a1b3a35ef38cfad2c2c465bb160ea764157c5d";

test("retired demo access and legacy sessions fail closed without production mutations", async (t) => {
  let reads = 0, writes = 0, cookieWrites = 0;
  let currentUser: any = null;
  let cookieToken = "synthetic-cookie-token";
  const sessions = new Map<string, any>();
  const prisma = {
    user: {
      findUnique: async () => { reads++; return currentUser; },
      create: async ({ data }: any) => { writes++; currentUser = { id: "synthetic-new", ...data }; return currentUser; },
      update: async () => { writes++; throw new Error("Unexpected role mutation"); },
    },
    authSession: {
      findUnique: async ({ where }: any) => { reads++; return sessions.get(where.tokenHash) ?? null; },
      create: async ({ data }: any) => { writes++; sessions.set(data.tokenHash, { ...data, user: currentUser }); return data; },
      deleteMany: async () => { writes++; return { count: 1 }; },
    },
  };
  const globalPrisma = globalThis as unknown as { prisma?: unknown };
  const previousPrisma = globalPrisma.prisma;
  globalPrisma.prisma = prisma;
  const cookieMock = t.mock.method(nextHeaders, "cookies", async () => ({
    get: (name: string) => ({ value: name === "jmm_google_signin" ? "synthetic-state" : cookieToken }),
    set: (_name: string, token: string) => { cookieWrites++; cookieToken = token; },
    delete: () => { cookieWrites++; },
  }));
  const envKeys = ["SMTP_HOST", "ADMIN_EMAILS", "DEMO_LOGIN_ENABLED", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "NEXT_PUBLIC_APP_URL"];
  const previousEnv = new Map(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  process.env.DEMO_LOGIN_ENABLED = "true";
  t.after(() => {
    cookieMock.mock.restore();
    globalPrisma.prisma = previousPrisma;
    for (const [key, value] of previousEnv) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  const auth = await import("./auth");
  const demo = await import("../app/api/auth/demo/route");
  const login = await import("../app/api/auth/login/route");
  const signup = await import("../app/api/auth/signup/route");
  const google = await import("../app/api/auth/google/callback/route");
  const reset = () => { reads = 0; writes = 0; cookieWrites = 0; currentUser = null; sessions.clear(); cookieToken = "synthetic-cookie-token"; };
  let requestNumber = 0;
  const request = (password: string, extra = {}) => new Request("http://localhost/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": `synthetic-${requestNumber++}` },
    body: JSON.stringify({ email: "synthetic-athlete@example.invalid", password, name: "Synthetic Athlete", ...extra }),
  });
  const user = (passwordHash: string) => ({ id: "synthetic-athlete", name: "Synthetic Athlete", email: "synthetic-athlete@example.invalid", role: "athlete", passwordHash });
  const session = (passwordHash: string) => ({ user: user(passwordHash), expiresAt: new Date(Date.now() + 60_000) });

  await t.test("environment cannot restore demo endpoint and it never touches storage or cookies", async () => {
    for (const enabled of ["true", "false", "1", undefined]) {
      reset();
      if (enabled === undefined) delete process.env.DEMO_LOGIN_ENABLED; else process.env.DEMO_LOGIN_ENABLED = enabled;
      const get = await demo.GET();
      assert.deepEqual(await get.json(), { enabled: false });
      assert.equal(get.headers.get("cache-control"), "no-store");
      const post = await (demo.POST as (req: Request) => Promise<Response>)(new Request("http://localhost/api/auth/demo", { method: "POST", body: "malformed-json" }));
      assert.equal(post.status, 410);
      assert.equal(post.headers.get("set-cookie"), null);
      assert.equal(post.headers.get("cache-control"), "no-store");
      assert.equal(reads + writes + cookieWrites, 0);
    }
  });
  await t.test("public auth component no longer fetches or renders shared-account entry", () => {
    const source = readFileSync("src/components/auth-card.tsx", "utf8");
    assert.doesNotMatch(source, /\/api\/auth\/demo|demoEnabled|one tap to sign in|@jasmiamimethod\.com|@gmail\.com/);
  });
  await t.test("password policy uses its denylisted SHA digest without retaining a plaintext candidate", () => {
    assert.equal(auth.isRevokedPasswordDigest(revokedDigest), true);
    assert.equal(auth.isRevokedPasswordDigest(createHash("sha256").update(uniquePassword).digest("hex")), false);
    assert.equal(auth.isRevokedDemoPassword(uniquePassword), false);
    const source = readFileSync("src/lib/auth.ts", "utf8");
    assert.doesNotMatch(source, /blockedHashCache|REVOKED_DEMO_PASSWORD\s*=/);
  });
  await t.test("login and signup reject a synthetic input whose digest is denied before database access", async () => {
    // Inject only a digest result for an unrelated synthetic marker. The retired
    // password is never reconstructed, embedded, logged, or used by this test.
    const marker = "synthetic-policy-denial-vector";
    const realCreateHash = crypto.createHash;
    const digestMock = t.mock.method(crypto, "createHash", (algorithm: string) => {
      const hash = realCreateHash(algorithm);
      const update = hash.update.bind(hash), digest = hash.digest.bind(hash);
      let synthetic = false;
      hash.update = (value: any, ...args: any[]) => { synthetic ||= value === marker; update(value, ...args); return hash; };
      hash.digest = (...args: any[]) => synthetic ? revokedDigest : digest(...args);
      return hash;
    });
    try {
      for (const [route, status] of [[login, 401], [signup, 400]] as const) {
        reset();
        assert.equal((await route.POST(request(marker))).status, status);
        assert.equal(reads + writes + cookieWrites, 0);
      }
    } finally { digestMock.mock.restore(); }
  });
  await t.test("legacy raw-SHA session cookies fail lookup without modifying their records", async () => {
    reset();
    const oldHash = createHash("sha256").update(cookieToken).digest("hex");
    const oldSession = session(auth.hashPassword(uniquePassword));
    sessions.set(oldHash, oldSession);
    assert.notEqual(auth.hashToken(cookieToken), oldHash);
    assert.match(auth.hashToken(cookieToken), /^v2:[a-f0-9]{64}$/);
    assert.equal(await auth.getCurrentUser(), null);
    assert.equal(sessions.get(oldHash), oldSession);
    assert.equal(writes + cookieWrites, 0);
    sessions.set(auth.hashToken(cookieToken), oldSession);
    assert.equal((await auth.getCurrentUser())?.id, "synthetic-athlete");
    assert.equal(writes + cookieWrites, 0);
  });
  await t.test("malformed password hashes deny even namespaced sessions without mutation", async () => {
    for (const passwordHash of ["malformed", "$2b$10$broken", "salt:deadbeef"]) {
      reset(); currentUser = user(passwordHash);
      sessions.set(auth.hashToken(cookieToken), session(passwordHash));
      assert.equal(await auth.getCurrentUser(), null);
      assert.equal((await login.POST(request(uniquePassword))).status, 401);
      assert.equal(writes + cookieWrites, 0);
    }
  });
  await t.test("legitimate bcrypt and legacy SHA login plus signup create usable namespaced sessions", async () => {
    for (const passwordHash of [auth.hashPassword(uniquePassword), legacyHash(uniquePassword)]) {
      reset(); currentUser = user(passwordHash);
      assert.equal(auth.verifyPassword(uniquePassword, passwordHash), true);
      assert.equal((await login.POST(request(uniquePassword))).status, 200);
      assert.equal(writes, 1); assert.equal(cookieWrites, 1);
      assert.ok(sessions.has(auth.hashToken(cookieToken)));
      assert.equal((await auth.getCurrentUser())?.id, "synthetic-athlete");
    }
    reset();
    assert.equal((await signup.POST(request(uniquePassword))).status, 200);
    assert.equal(writes, 2); assert.equal(cookieWrites, 1);
    assert.ok(sessions.has(auth.hashToken(cookieToken)));
    assert.equal((await auth.getCurrentUser())?.id, "synthetic-new");
  });
  await t.test("legacy unsigned OAuth callback fails closed without creating a session", async () => {
    reset(); currentUser = user(auth.hashPassword(uniquePassword));
    process.env.GOOGLE_CLIENT_ID = "synthetic-client";
    process.env.GOOGLE_CLIENT_SECRET = "synthetic-oauth-fixture";
    const tokenPayload = Buffer.from(JSON.stringify({ email: currentUser.email, email_verified: true, aud: "synthetic-client" })).toString("base64url");
    const fetchMock = t.mock.method(globalThis, "fetch", async (url: any) => {
      assert.equal(url, "https://oauth2.googleapis.com/token");
      return new Response(JSON.stringify({ id_token: `synthetic.${tokenPayload}.synthetic` }), { status: 200 });
    });
    try {
      const response = await google.GET(new Request("http://localhost/api/auth/google/callback?code=synthetic-code&state=synthetic-state"));
      assert.equal(response.status, 303);
      assert.match(response.headers.get("location") || "", /\/login\?.*error=invalid_state/);
      assert.doesNotMatch(response.headers.get("set-cookie") || "", /jmm_session=/);
      assert.equal(sessions.size, 0);
      assert.equal(writes, 0);
      assert.equal(fetchMock.mock.callCount(), 0);
    } finally { fetchMock.mock.restore(); }
  });
});
