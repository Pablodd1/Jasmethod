import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  buildClientDiagnostics, classifyError, crashScreenCopy, formatDiagnostics, parseBrowser, sanitizeBuildId, sanitizeRoute,
  sanitizeStack, sanitizeText,
} from "./client-error-diagnostics";

const src = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

// Invented values only.
const UA = {
  iosSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iosChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1",
  iosFirefox: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15",
  iosInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0.0 (iPhone14,5; iOS 17_5; en_US; en-US; scale=3.00; 1170x2532; 0)",
  iosWebView: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  winChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  winEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.87",
  winFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
};

test("routes keep their shape and lose queries, fragments, hosts and identifiers", () => {
  assert.equal(sanitizeRoute("/checkin"), "/checkin");
  assert.equal(sanitizeRoute("/checkin?sessionId=abc123&token=secret#top"), "/checkin");
  assert.equal(sanitizeRoute("https://app.example.test/today?x=1"), "/today");
  assert.equal(sanitizeRoute("/races/12345"), "/races/:id");
  assert.equal(sanitizeRoute("/admin/athletes/3f2a9c1e-7b4d-4e8a-9c1d-5a6b7c8d9e0f"), "/admin/athletes/:id");
  assert.equal(sanitizeRoute("/admin/athletes/cm2x9k4a70000abcd1234efgh5"), "/admin/athletes/:id");
  assert.equal(sanitizeRoute("/reset-password/a1b2c3d4e5f6a7b8c9d0e1f2"), "/reset-password/:id");
  assert.equal(sanitizeRoute("/u/someone%40example.com/plan"), "/u/:id/plan");
  assert.equal(sanitizeRoute("/u/someone@example.com"), "/u/:id");
  assert.equal(sanitizeRoute("/api/connectors/google-cal/callback"), "/api/connectors/google-cal/callback");
  for (const odd of ["", null, undefined, "//evil.example/x", "javascript:alert(1)", "not a path"]) assert.equal(sanitizeRoute(odd as string), "/");
  assert.ok(sanitizeRoute("/" + "a/".repeat(200)).length <= 120);
});

test("message and stack text lose URLs, e-mail addresses, tokens and secrets", () => {
  // Assembled at run time so the file holds no complete token-shaped string.
  const fixtureJwt = ["eyJhbGciOiJub25lIn0", "eyJzdWIiOiJ0ZXN0In0", "c2lnbmF0dXJl"].join(".");
  const dirty = [
    "Failed https://api.example.test/v1/athletes/42?access_token=abc123&x=1#frag for jane.doe@example.com",
    "token=fixture-token-value-1234 password: fixture-password Authorization: Bearer abcdefghijklmnop.qrstuv",
    `jwt ${fixtureJwt} and id 98765432101234`,
    "long AbCdEf0123456789AbCdEf0123456789 opaque",
  ].join(" ");
  const clean = sanitizeText(dirty, 1000);
  for (const leaked of ["jane.doe", "example.com", "access_token", "abc123", "fixture-token-value", "fixture-password", "abcdefghijklmnop", "eyJhbGci", "98765432101234", "AbCdEf0123456789AbCdEf0123456789"]) {
    assert.ok(!clean.includes(leaked), `${leaked} must not survive: ${clean}`);
  }
  assert.match(clean, /<url>/);
  assert.match(clean, /<email>/);
  assert.match(clean, /<token>/);
  // Ordinary technical text is untouched.
  const plain = "Cannot read properties of undefined (reading 'availableMin')";
  assert.equal(sanitizeText(plain), plain);
  // Build assets stay readable so the crash can be matched to a chunk and a build.
  assert.equal(sanitizeText("Loading chunk 234 failed. (https://app.example.test/_next/static/chunks/app/checkin/page-3f9a1c2b7d4e5f60.js?v=1)"),
    "Loading chunk 234 failed. (/_next/static/chunks/app/checkin/page-3f9a1c2b7d4e5f60.js)");
  assert.match(sanitizeText("https://app.example.test/_next/static/chunks/main-app-5bd5d8c1a2f3e4b6c7d8.js"), /^\/_next\/static\/chunks\/main-app-5bd5d8c1a2f3e4b6c7d8\.js$/);
  assert.equal(sanitizeText(undefined), "");
  assert.equal(sanitizeText({ toString: () => "x" }), "x");
  const long = sanitizeText("word ".repeat(200), 50);
  assert.equal(long.length, 50);
  assert.ok(long.endsWith("…"));
});

test("stacks keep only frames, in Chrome and Safari formats, with URLs reduced to build paths", () => {
  const chrome = [
    "TypeError: Cannot read properties of undefined",
    "    at Page (https://app.example.test/_next/static/chunks/app/checkin/page-aaaa1111bbbb2222.js:1:2345)",
    "    at renderWithHooks (https://app.example.test/_next/static/chunks/framework-cccc3333dddd4444.js:1:1234)",
  ].join("\n");
  assert.deepEqual(sanitizeStack(chrome), [
    "at Page (/_next/static/chunks/app/checkin/page-aaaa1111bbbb2222.js:1:2345)",
    "at renderWithHooks (/_next/static/chunks/framework-cccc3333dddd4444.js:1:1234)",
  ]);
  const safari = [
    "Page@https://app.example.test/_next/static/chunks/app/checkin/page-aaaa1111bbbb2222.js:1:2345",
    "@https://app.example.test/_next/static/chunks/framework-cccc3333dddd4444.js:1:1234",
    "forEach@[native code]",
    "global code@https://app.example.test/somewhere/else?token=zzz:1:1",
  ].join("\n");
  assert.deepEqual(sanitizeStack(safari), [
    "Page@/_next/static/chunks/app/checkin/page-aaaa1111bbbb2222.js:1:2345",
    "@/_next/static/chunks/framework-cccc3333dddd4444.js:1:1234",
    "forEach@[native code]",
    "global code@<url>",
  ]);
  assert.equal(sanitizeStack(Array.from({ length: 30 }, (_, i) => `    at f${i} (file.js:${i}:1)`).join("\n")).length, 8);
  assert.deepEqual(sanitizeStack(undefined), []);
  assert.deepEqual(sanitizeStack(42), []);
  assert.ok(sanitizeStack(`    at ${"x".repeat(900)} (a.js:1:1)`)[0].length <= 200);
});

test("browser details are family, version, OS and engine only", () => {
  assert.deepEqual(parseBrowser(UA.iosSafari), { family: "Safari", version: "17.5", os: "iOS 17.5", engine: "WebKit" });
  assert.deepEqual(parseBrowser(UA.iosChrome), { family: "Chrome on iOS", version: "126", os: "iOS 17.5", engine: "WebKit" });
  assert.deepEqual(parseBrowser(UA.iosFirefox), { family: "Firefox on iOS", version: "127", os: "iOS 16.7", engine: "WebKit" });
  assert.deepEqual(parseBrowser(UA.iosInstagram), { family: "Instagram in-app browser", version: null, os: "iOS 17.5", engine: "WebKit" });
  assert.deepEqual(parseBrowser(UA.iosWebView), { family: "iOS in-app WebView", version: null, os: "iOS 17.5", engine: "WebKit" });
  assert.deepEqual(parseBrowser(UA.macSafari), { family: "Safari", version: "17.5", os: "macOS", engine: "WebKit" });
  assert.deepEqual(parseBrowser(UA.winChrome), { family: "Chrome", version: "126", os: "Windows", engine: "Blink" });
  assert.deepEqual(parseBrowser(UA.winEdge), { family: "Edge", version: "126", os: "Windows", engine: "Blink" });
  assert.deepEqual(parseBrowser(UA.winFirefox), { family: "Firefox", version: "127", os: "Windows", engine: "Gecko" });
  assert.deepEqual(parseBrowser(UA.androidChrome), { family: "Chrome", version: "126", os: "Android 14", engine: "Blink" });
  assert.deepEqual(parseBrowser(""), { family: "unknown", version: null, os: "unknown", engine: "unknown" });
  assert.deepEqual(parseBrowser(undefined).family, "unknown");
  for (const ua of Object.values(UA)) assert.ok(!/Mozilla|AppleWebKit|KHTML|15E148/.test(JSON.stringify(parseBrowser(ua))));
});

test("the build id is a short commit SHA or 'unknown'", () => {
  assert.equal(sanitizeBuildId("5462742CC709194CA2A45033787CFC048AB4EA4C"), "5462742");
  for (const bad of [undefined, "", "main", "not a sha", "abc", "5462742; drop table"]) assert.equal(sanitizeBuildId(bad), "unknown");
});

test("errors are classified without guessing", () => {
  assert.equal(classifyError("ChunkLoadError", ""), "chunk-load");
  assert.equal(classifyError("Error", "Loading chunk 12 failed."), "chunk-load");
  assert.equal(classifyError("TypeError", "Importing a module script failed."), "chunk-load");
  assert.equal(classifyError("TypeError", "Failed to fetch dynamically imported module: x"), "chunk-load");
  assert.equal(classifyError("Error", "Hydration failed because the initial UI does not match"), "hydration");
  assert.equal(classifyError("Error", "Minified React error #418; visit ..."), "hydration");
  assert.equal(classifyError("TypeError", "Cannot read properties of undefined"), "other");
});

test("a full report contains the evidence and none of the sensitive input", () => {
  const error = Object.assign(new TypeError("Cannot read 'x' for jane.doe@example.com at https://app.example.test/checkin?token=SECRETVALUE123"), {
    stack: "TypeError: Cannot read 'x'\n    at Page (https://app.example.test/_next/static/chunks/app/checkin/page-aaaa1111bbbb2222.js:1:2345)",
    digest: "1234567890",
  });
  const d = buildClientDiagnostics({
    error, pathname: "/checkin", userAgent: UA.iosSafari, buildId: "5462742cc709194ca2a45033787cfc048ab4ea4c",
    documentLoadType: "navigate", referrer: "https://app.example.test/today?session=SECRETVALUE123", origin: "https://app.example.test",
    now: new Date("2026-10-19T14:03:11.000Z"), online: true, standalone: false,
  });
  const text = formatDiagnostics(d);
  assert.equal(text, [
    "JMM client error report (sanitized; review before sharing)",
    "Time: 2026-10-19T14:03:11.000Z",
    "Route: /checkin",
    "Build: 5462742",
    "Browser: Safari 17.5 on iOS 17.5 (WebKit), browser",
    "Online: yes",
    "Kind: other",
    "Error: TypeError: Cannot read 'x' for <email> at <url>",
    "Digest: 1234567890",
    "Page load: navigate; entered from /today (describes how the page was first loaded, not the last tap)",
    "Preceding action: not captured. Ask what was tapped just before the error.",
    "Stack (top frames):",
    "  at Page (/_next/static/chunks/app/checkin/page-aaaa1111bbbb2222.js:1:2345)",
  ].join("\n"));
  for (const leaked of ["jane.doe", "SECRETVALUE123", "Mozilla", "AppleWebKit", "token="]) assert.ok(!text.includes(leaked) && !JSON.stringify(d).includes(leaked), leaked);
});

test("unusual inputs never throw and never invent evidence", () => {
  for (const error of [null, undefined, "plain string", 42, {}, { message: 7 }, { name: "<script>", message: "m", digest: "has spaces!" }, Object.create(null)]) {
    const d = buildClientDiagnostics({ error, pathname: "/x" });
    assert.ok(typeof formatDiagnostics(d) === "string");
    assert.equal(d.digest, null);
    assert.equal(d.build, "unknown");
    assert.equal(d.online, null);
    assert.equal(d.displayMode, null);
    assert.equal(d.documentLoadType, null);
    assert.equal(d.entryReferrerRoute, null);
    assert.match(d.errorName, /^[A-Za-z][A-Za-z0-9_.]*$/);
  }
  // A referrer on another site is dropped; an unknown load type is dropped.
  const other = buildClientDiagnostics({ error: new Error("x"), pathname: "/x", referrer: "https://elsewhere.example/page", origin: "https://app.example.test", documentLoadType: "teleport" });
  assert.equal(other.entryReferrerRoute, null);
  assert.equal(other.documentLoadType, null);
  assert.match(formatDiagnostics(other), /Page load: unknown \(/);
  // Standalone (home-screen) launches are reported when known.
  assert.match(formatDiagnostics(buildClientDiagnostics({ error: new Error("x"), pathname: "/x", userAgent: UA.iosSafari, standalone: true })), /, standalone/);
});

test("crash screen wording exists in both languages, adapts to a chunk-load failure and promises nothing", () => {
  for (const kind of ["chunk-load", "hydration", "other"] as const) {
    const en = crashScreenCopy(false, kind), es = crashScreenCopy(true, kind);
    assert.deepEqual(Object.keys(en), Object.keys(es));
    for (const value of [...Object.values(en), ...Object.values(es)]) assert.ok(value.length > 0);
    // No claim about saved data, safety of data or a guaranteed fix.
    assert.doesNotMatch(Object.values(en).join(" "), /\b(saved|safe|fixed|resolved|guarantee)/i);
    assert.doesNotMatch(Object.values(es).join(" "), /(guardad|segur|arreglad|resuelt|garant)/i);
  }
  assert.notEqual(crashScreenCopy(false, "chunk-load").body, crashScreenCopy(false, "other").body);
  assert.match(crashScreenCopy(false, "chunk-load").body, /Reload/);
});

test("the crash screen is wired as a boundary, shows only sanitized text and reports to the existing intake", () => {
  const screen = src("src/components/crash-screen.tsx");
  assert.match(screen, /^"use client";/);
  assert.match(screen, /tabIndex=\{-1\}/);
  assert.match(screen, /heading\.current\?\.focus\(\)/);
  assert.match(screen, /formatDiagnostics\(info\.diagnostics\)/);
  assert.match(screen, /onClick=\{\(\) => reset\(\)\}/);
  assert.match(screen, /window\.location\.reload\(\)/);
  assert.match(screen, /href="\/today"/);
  // The clipboard call is guarded and failure is reported to the athlete.
  assert.match(screen, /try \{ await navigator\.clipboard\.writeText\(text\); setCopied\("done"\); \} catch \{ setCopied\("failed"\); \}/);
  // Raw error text is never rendered or sent: everything goes through buildClientDiagnostics.
  const code = screen.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); // comments may mention the rule
  assert.ok(!/error\.(message|stack)/.test(code), "crash-screen must not read error.message or error.stack");
  assert.match(screen, /process\.env\.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA/);
  // One report, to the endpoint ErrorTelemetry already uses, with only the sanitized fields the route reads.
  assert.equal((screen.match(/fetch\(/g) ?? []).length, 1);
  assert.match(screen, /fetch\("\/api\/telemetry\/error"/);
  assert.match(screen, /clientErrorPayload\(/);
  assert.doesNotMatch(screen, /stack: d\.stack/);
  const intake = src("src/app/api/telemetry/error/route.ts");
  assert.match(intake, /acceptedClientError\(await readTelemetryBody\(req\)\)/);
  assert.doesNotMatch(intake, /userAgent:|stack:/);

  const route = src("src/app/error.tsx");
  assert.match(route, /^"use client";/);
  assert.match(route, /export default function \w+\(\{ error, reset \}/);
  assert.match(route, /<CrashScreen error=\{error\} reset=\{reset\} \/>/);

  const global = src("src/app/global-error.tsx");
  assert.match(global, /^"use client";/);
  assert.match(global, /<html lang="en">/);
  assert.match(global, /<body /);
  assert.match(global, /<CrashScreen error=\{error\} reset=\{reset\} bare \/>/);
  // global-error replaces the layout, so the page stylesheet is absent: no className dependence there.
  assert.ok(!/className=/.test(global));
});

test("the diagnostics code uses nothing the oldest supported Safari would reject while the crash screen loads", () => {
  const code = src("src/lib/client-error-diagnostics.ts") + src("src/components/crash-screen.tsx");
  assert.ok(!code.includes("(?<"), "regex lookbehind throws a SyntaxError in Safari before 16.4");
  assert.ok(!/\.replaceAll\(|\.at\(|structuredClone|Object\.hasOwn\(/.test(code));
  assert.ok(!/\\p\{/.test(code), "unicode property escapes are avoided");
});
