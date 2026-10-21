import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  GOOGLE_CALENDAR_CALLBACK_PATH, GOOGLE_SIGN_IN_CALLBACK_PATH, calendarRedirectUri, checkGoogleRedirectConfig, describeNearMiss,
  formatRedirectCheck, parseCheckArgs, parseEnvFile, runRedirectCheck, signInRedirectUri, type GoogleEnv, type RedirectCheckInput,
} from "./oauth-redirect-check";

// Invented values only: none of these is a real client ID, project number or secret.
const ORIGIN = "https://app.example.test";
const CALENDAR = `${ORIGIN}${GOOGLE_CALENDAR_CALLBACK_PATH}`;
const SIGN_IN = `${ORIGIN}${GOOGLE_SIGN_IN_CALLBACK_PATH}`;
const CLIENT_ID = "123456789012-abcdefghijklmnop.apps.googleusercontent.com";
const SECRET = "fixture-secret-0000-not-a-credential";
const good: GoogleEnv = { NEXT_PUBLIC_APP_URL: ORIGIN, GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: SECRET };
const ids = (env: GoogleEnv, extra: Omit<Partial<RedirectCheckInput>, "env"> = {}) =>
  checkGoogleRedirectConfig({ env, ...extra }).findings.map((finding) => finding.id);
const src = (file: string) => readFileSync(join(process.cwd(), file), "utf8");

test("the Calendar redirect is built exactly as src/lib/oauth.ts builds it", () => {
  assert.deepEqual(calendarRedirectUri(good), { uri: CALENDAR, source: "NEXT_PUBLIC_APP_URL" });
  assert.deepEqual(calendarRedirectUri({}), { uri: `http://localhost:3000${GOOGLE_CALENDAR_CALLBACK_PATH}`, source: "default-localhost" });
  // A valid override wins in both normal and smoke mode; an override without a scheme is ignored.
  const override = `${ORIGIN}${GOOGLE_CALENDAR_CALLBACK_PATH}`;
  assert.deepEqual(calendarRedirectUri({ ...good, GOOGLE_REDIRECT_URI: override }), { uri: override, source: "GOOGLE_REDIRECT_URI" });
  assert.deepEqual(calendarRedirectUri({ ...good, GOOGLE_REDIRECT_URI: override }, true).source, "GOOGLE_REDIRECT_URI");
  assert.equal(calendarRedirectUri({ ...good, GOOGLE_REDIRECT_URI: "app.example.test/cb" }).source, "NEXT_PUBLIC_APP_URL");
  // The smoke test prefers APP_URL; normal mode never does.
  const env = { ...good, APP_URL: "https://smoke.example.test" };
  assert.equal(calendarRedirectUri(env).uri, CALENDAR);
  assert.equal(calendarRedirectUri(env, true).uri, `https://smoke.example.test${GOOGLE_CALENDAR_CALLBACK_PATH}`);
});

test("the sign-in redirect uses APP_URL first and only the origin", () => {
  assert.equal(signInRedirectUri(good), SIGN_IN);
  assert.equal(signInRedirectUri({ ...good, APP_URL: "https://other.example.test/some/path/" }), `https://other.example.test${GOOGLE_SIGN_IN_CALLBACK_PATH}`);
  assert.equal(signInRedirectUri({}), null);
  assert.equal(signInRedirectUri({ APP_URL: "not a url" }), null);
});

test("a correct configuration produces no findings and lists the two URIs to register", () => {
  const result = checkGoogleRedirectConfig({ env: good });
  assert.deepEqual(result.findings, []);
  assert.equal(result.status, "partial"); // registration was not compared
  assert.equal(result.calendarRedirectUri, CALENDAR);
  assert.deepEqual(result.required, [{ uri: CALENDAR, purposes: ["calendar"] }, { uri: SIGN_IN, purposes: ["sign-in"] }]);
  assert.ok(result.notVerified.some((item) => /Cloud console/.test(item)));
  assert.ok(result.notVerified.some((item) => /refresh token/.test(item)));
});

test("an exact registered list passes; the rest of the checklist stays unverified", () => {
  const result = checkGoogleRedirectConfig({ env: good, registered: [SIGN_IN, CALENDAR, "https://unrelated.example.test/keep/me"] });
  assert.equal(result.status, "pass");
  assert.deepEqual(result.registration.results.map((r) => r.status), ["registered", "registered"]);
  assert.ok(!result.notVerified.some((item) => /Authorized redirect URIs/.test(item)));
  assert.ok(result.notVerified.some((item) => /Calendar API/.test(item)));
});

test("a missing Calendar URI is reported with the exact value to add and the unrelated entries are left alone", () => {
  const result = checkGoogleRedirectConfig({ env: good, registered: [SIGN_IN, "https://unrelated.example.test/cb"] });
  assert.equal(result.status, "fail");
  const finding = result.findings.find((f) => f.id === "not-registered");
  assert.match(finding?.message ?? "", new RegExp(CALENDAR.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")));
  assert.match(finding?.fix ?? "", /Keep the other entries/);
  assert.deepEqual(result.registration.results.map((r) => r.status), ["missing", "registered"]);
});

test("near misses are named: old host, trailing slash, scheme, www, path, case and whitespace", () => {
  const cases: Array<[string, RegExp]> = [
    ["https://old-name.vercel.app" + GOOGLE_CALENDAR_CALLBACK_PATH, /different host \(old-name\.vercel\.app\)/],
    [CALENDAR + "/", /trailing slash/],
    [CALENDAR.replace("https:", "http:"), /uses http instead of https/],
    ["https://www.app.example.test" + GOOGLE_CALENDAR_CALLBACK_PATH, /www\. prefix/],
    [`${ORIGIN}/api/connectors/google_cal/callback`, /different path/],
    [`${ORIGIN}/API/connectors/google-cal/callback`, /letter case in the path/],
    [CALENDAR + "?x=1", /query string or fragment/],
    [` ${CALENDAR}`, /whitespace/],
    ["https://APP.example.test" + GOOGLE_CALENDAR_CALLBACK_PATH, /letter case in the host/],
  ];
  for (const [candidate, reason] of cases) assert.match(describeNearMiss(CALENDAR, candidate) ?? "no match", reason, candidate);
  // Unrelated registrations are not mistaken for typos.
  assert.equal(describeNearMiss(CALENDAR, `${ORIGIN}/api/connectors/strava/callback`), null);
  assert.equal(describeNearMiss(CALENDAR, "http://localhost:3000" + GOOGLE_CALENDAR_CALLBACK_PATH.replace("google-cal", "oura")), null);
  assert.equal(describeNearMiss(CALENDAR, "not a url"), null);
  assert.equal(describeNearMiss(CALENDAR, CALENDAR), null);
  const result = checkGoogleRedirectConfig({ env: good, registered: [SIGN_IN, CALENDAR + "/"] });
  const finding = result.findings.find((f) => f.id === "registered-near-miss");
  assert.match(finding?.message ?? "", /trailing slash/);
  assert.equal(result.registration.results[0].nearMiss?.registered, CALENDAR + "/");
});

test("the sign-in callback registered for Calendar is not reported as a Calendar typo", () => {
  const result = checkGoogleRedirectConfig({ env: good, registered: [SIGN_IN] });
  const calendar = result.registration.results.find((r) => r.uri === CALENDAR);
  assert.equal(calendar?.status, "missing");
  assert.equal(calendar?.nearMiss, undefined);
});

test("configuration that can never match is an error", () => {
  assert.ok(ids({ ...good, NEXT_PUBLIC_APP_URL: undefined }).includes("missing-app-origin"));
  assert.ok(ids({ ...good, NEXT_PUBLIC_APP_URL: "http://app.example.test" }).includes("redirect-not-https"));
  assert.ok(ids({ ...good, NEXT_PUBLIC_APP_URL: `${ORIGIN}/` }).includes("redirect-double-slash"));
  assert.ok(ids({ ...good, NEXT_PUBLIC_APP_URL: `${ORIGIN}/app` }).includes("app-origin-has-path"));
  assert.ok(ids({ ...good, NEXT_PUBLIC_APP_URL: `${ORIGIN}/app` }).includes("redirect-wrong-path"));
  assert.ok(ids({ ...good, GOOGLE_REDIRECT_URI: `${ORIGIN}/api/connectors/google/callback` }).includes("redirect-wrong-path"));
  assert.ok(ids({ ...good, GOOGLE_REDIRECT_URI: "app.example.test/api/connectors/google-cal/callback" }).includes("override-ignored"));
  assert.ok(ids({ ...good, NEXT_PUBLIC_APP_URL: "not a url" }).includes("app-origin-invalid"));
  assert.ok(ids({ ...good, NEXT_PUBLIC_APP_URL: "not a url" }).includes("signin-origin-unusable"));
  assert.equal(checkGoogleRedirectConfig({ env: { ...good, NEXT_PUBLIC_APP_URL: `${ORIGIN}/` } }).status, "fail");
});

test("invisible characters in a value are reported without printing the value", () => {
  const env: GoogleEnv = { ...good, NEXT_PUBLIC_APP_URL: `${ORIGIN}\n`, GOOGLE_CLIENT_SECRET: `${SECRET} ` };
  const result = checkGoogleRedirectConfig({ env, registered: [CALENDAR, SIGN_IN] });
  const contaminated = result.findings.filter((f) => f.id === "value-contaminated");
  assert.deepEqual(contaminated.map((f) => f.message.split(" ")[0]), ["NEXT_PUBLIC_APP_URL", "GOOGLE_CLIENT_SECRET"]);
  assert.match(contaminated[0].message, /line break/);
  assert.match(contaminated[1].message, /whitespace/);
  assert.equal(result.status, "fail");
  // What to register is the clean value, so the owner is not told to register a URI containing a newline.
  assert.deepEqual(result.required.map((r) => r.uri), [CALENDAR, SIGN_IN]);
  assert.ok(!JSON.stringify(result).includes(SECRET));
  assert.ok(!formatRedirectCheck(result).includes(SECRET));
  // The app sends the contaminated value, and the report makes the newline visible.
  assert.match(formatRedirectCheck(result), /redirect_uri: https:\/\/app\.example\.test\\n\/api\/connectors/);
  // A value wrapped in quotes is caught, and a quoted override is not silently honoured.
  assert.ok(ids({ ...good, GOOGLE_REDIRECT_URI: `"${CALENDAR}"` }).includes("override-ignored"));
  assert.ok(ids({ ...good, GOOGLE_REDIRECT_URI: `"${CALENDAR}"` }).includes("value-contaminated"));
});

test("legacy hosts and mismatched origins are warnings, not errors", () => {
  const legacy = checkGoogleRedirectConfig({ env: { ...good, NEXT_PUBLIC_APP_URL: "https://old-name.vercel.app" } });
  assert.deepEqual(legacy.findings.map((f) => [f.id, f.severity]), [["legacy-host", "warning"]]);
  const split = checkGoogleRedirectConfig({ env: { ...good, APP_URL: "https://other.example.test" } });
  assert.deepEqual(split.findings.map((f) => [f.id, f.severity]), [["origins-differ", "warning"]]);
  assert.deepEqual(split.required.map((r) => r.uri), [CALENDAR, `https://other.example.test${GOOGLE_SIGN_IN_CALLBACK_PATH}`, `https://other.example.test${GOOGLE_CALENDAR_CALLBACK_PATH}`]);
  assert.deepEqual(split.required.map((r) => r.purposes), [["calendar"], ["sign-in"], ["calendar-smoke"]]);
  const override = checkGoogleRedirectConfig({ env: { ...good, GOOGLE_REDIRECT_URI: `https://other.example.test${GOOGLE_CALENDAR_CALLBACK_PATH}` } });
  assert.deepEqual(override.findings.map((f) => f.id), ["override-origin-differs"]);
  assert.equal(override.calendarRedirectSource, "GOOGLE_REDIRECT_URI");
  assert.equal(checkGoogleRedirectConfig({ env: good, registered: [CALENDAR, SIGN_IN, "https://old-name.vercel.app/cb"] }).findings.at(0)?.id, "legacy-registered-kept");
  assert.equal(checkGoogleRedirectConfig({ env: good, registered: [CALENDAR, SIGN_IN, "https://old-name.vercel.app/cb"] }).status, "pass");
});

test("one URI serving two purposes is listed once", () => {
  const result = checkGoogleRedirectConfig({ env: { ...good, GOOGLE_REDIRECT_URI: SIGN_IN } });
  assert.equal(result.required.length, 1);
  assert.deepEqual(result.required[0].purposes, ["calendar", "sign-in"]);
  assert.ok(ids({ ...good, GOOGLE_REDIRECT_URI: SIGN_IN }).includes("redirect-wrong-path"));
});

test("localhost over http is an error in production mode and allowed with --allow-localhost", () => {
  const dev: GoogleEnv = { ...good, NEXT_PUBLIC_APP_URL: "http://localhost:3000" };
  assert.ok(ids(dev).includes("redirect-not-https") && ids(dev).includes("signin-not-https"));
  assert.deepEqual(ids(dev, { allowLocalhost: true }), []);
  assert.ok(ids({ ...dev, NEXT_PUBLIC_APP_URL: "http://app.example.test" }, { allowLocalhost: true }).includes("redirect-not-https"));
});

test("credentials are checked for presence and shape only, and never echoed", () => {
  assert.deepEqual(ids({ NEXT_PUBLIC_APP_URL: ORIGIN }), ["missing-client-id", "missing-client-secret"]);
  assert.deepEqual(ids({ NEXT_PUBLIC_APP_URL: ORIGIN }, { checkCredentials: false }), []);
  assert.ok(ids({ ...good, GOOGLE_CLIENT_ID: "not-a-google-client" }).includes("client-id-shape"));
  const matches = checkGoogleRedirectConfig({ env: good, expectClientId: CLIENT_ID });
  assert.equal(matches.credentials.clientIdMatchesExpected, true);
  const other = checkGoogleRedirectConfig({ env: good, expectClientId: "999999999999-zzzz.apps.googleusercontent.com" });
  assert.equal(other.credentials.clientIdMatchesExpected, false);
  assert.ok(other.findings.some((f) => f.id === "client-id-mismatch" && f.severity === "error"));
  for (const result of [matches, other]) {
    const text = JSON.stringify(result) + formatRedirectCheck(result);
    assert.ok(!text.includes(SECRET) && !text.includes(CLIENT_ID) && !text.includes("999999999999"));
  }
  assert.deepEqual(matches.credentials, { checked: true, clientIdPresent: true, clientIdWellFormed: true, clientIdMatchesExpected: true, clientSecretPresent: true });
});

test("an empty registered list is flagged and nothing is reported as registered", () => {
  const result = checkGoogleRedirectConfig({ env: good, registered: [] });
  assert.ok(result.findings.some((f) => f.id === "registered-empty"));
  assert.deepEqual(result.registration.results.map((r) => r.status), ["missing", "missing"]);
  assert.equal(result.status, "fail");
});

test("env files: only the keys this check reads are kept, quotes and \\n escapes are decoded", () => {
  const parsed = parseEnvFile([
    "# comment",
    `NEXT_PUBLIC_APP_URL="${ORIGIN}\\n"`,
    `export GOOGLE_CLIENT_ID='${CLIENT_ID}'`,
    `GOOGLE_CLIENT_SECRET=${SECRET}`,
    "UNRELATED_SETTING=value-that-must-not-be-kept",
    "ANOTHER_SETTING=another-value-to-drop",
    "garbage line",
  ].join("\n"));
  assert.deepEqual(Object.keys(parsed).sort(), ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "NEXT_PUBLIC_APP_URL"]);
  assert.equal(parsed.NEXT_PUBLIC_APP_URL, `${ORIGIN}\n`);
  assert.equal(parsed.GOOGLE_CLIENT_ID, CLIENT_ID);
  assert.ok(!JSON.stringify(parsed).includes("must-not-be-kept") && !JSON.stringify(parsed).includes("another-value-to-drop"));
  assert.ok(ids(parsed).includes("value-contaminated")); // the stored newline from vercel env pull is found
});

test("argument parsing: repeatable and comma-separated URIs, = syntax, and clear errors", () => {
  const parsed = parseCheckArgs(["--registered", `${CALENDAR}, ${SIGN_IN}`, `--registered=${ORIGIN}/x`, "--registered-file", "u.txt", "--env-file=e.env", "--expect-client-id", "id", "--no-credential-check", "--allow-localhost", "--json"]);
  assert.deepEqual("args" in parsed && parsed.args, {
    registered: [CALENDAR, SIGN_IN, `${ORIGIN}/x`], registeredFile: "u.txt", envFile: "e.env", expectClientId: "id",
    json: true, credentialCheck: false, allowLocalhost: true, help: false,
  });
  assert.deepEqual(parseCheckArgs(["--registered"]), { error: "--registered needs a value" });
  assert.deepEqual(parseCheckArgs(["--registered", "--json"]), { error: "--registered needs a value" });
  assert.deepEqual(parseCheckArgs(["--nope"]), { error: "Unknown option --nope" });
});

test("the command: exit codes, JSON output, env-file isolation and file errors", () => {
  const files: Record<string, string> = {
    "uris.txt": `# from the console\n${CALENDAR}\n\n${SIGN_IN}\n`,
    "prod.env": `NEXT_PUBLIC_APP_URL="${ORIGIN}"\nGOOGLE_CLIENT_ID="${CLIENT_ID}"\nGOOGLE_CLIENT_SECRET="${SECRET}"\n`,
  };
  const read = (path: string) => { if (!(path in files)) throw new Error("ENOENT"); return files[path]; };

  const ok = runRedirectCheck(["--registered-file", "uris.txt"], good, read);
  assert.equal(ok.exitCode, 0);
  assert.match(ok.stdout, /RESULT: PASS for configuration and the supplied registered list/);
  assert.match(ok.stdout, /Not verified by this check/);

  const partial = runRedirectCheck([], good, read);
  assert.equal(partial.exitCode, 0);
  assert.match(partial.stdout, /registration was NOT compared/);

  const missing = runRedirectCheck(["--registered", SIGN_IN], good, read);
  assert.equal(missing.exitCode, 1);
  assert.match(missing.stdout, /RESULT: FAIL/);
  assert.match(missing.stdout, new RegExp(`Add exactly ${CALENDAR.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`));

  // --env-file replaces the process environment, so a developer's local values cannot leak into a production check.
  const fromFile = runRedirectCheck(["--env-file", "prod.env", "--registered-file", "uris.txt"], { NEXT_PUBLIC_APP_URL: "http://localhost:3000" }, read);
  assert.equal(fromFile.exitCode, 0);
  const json = JSON.parse(runRedirectCheck(["--env-file", "prod.env", "--json"], {}, read).stdout);
  assert.equal(json.calendarRedirectUri, CALENDAR);
  assert.ok(!JSON.stringify(json).includes(SECRET) && !JSON.stringify(json).includes(CLIENT_ID));

  assert.equal(runRedirectCheck(["--registered-file", "missing.txt"], good, read).exitCode, 2);
  assert.match(runRedirectCheck(["--env-file", "missing.env"], good, read).stderr, /Could not read the file given to --env-file/);
  assert.equal(runRedirectCheck(["--bogus"], good, read).exitCode, 2);
  assert.equal(runRedirectCheck(["--help"], good, read).exitCode, 0);
  // Only the five relevant keys are ever read from the process environment.
  const noisy = runRedirectCheck(["--json"], { ...good, UNRELATED_SETTING: "value-that-must-not-be-kept" } as GoogleEnv, read);
  assert.ok(!noisy.stdout.includes("must-not-be-kept"));
});

test("drift guard: the checker still mirrors src/lib/oauth.ts and the sign-in code", () => {
  const oauth = src("src/lib/oauth.ts");
  assert.ok(oauth.includes('const base = (smoke ? process.env.APP_URL : undefined) || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";'));
  assert.ok(oauth.includes("const override = process.env[`${p.env}_REDIRECT_URI`];"));
  assert.ok(oauth.includes("override && /^https?:\\/\\//.test(override)"));
  assert.ok(oauth.includes("`${base}/api/connectors/${route}/callback`"));
  assert.match(oauth, /"google-cal": \{\s*env: "GOOGLE",/);
  const signInConfig = src("src/lib/sign-in-config.ts");
  assert.ok(signInConfig.includes("const value = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;"));
  assert.ok(signInConfig.includes("return url.origin;"));
  assert.ok(src("src/lib/social-sign-in.ts").includes("const redirectUri = `${base}/api/auth/${provider}/callback`;"));
  // The routes the paths point at exist.
  assert.ok(readFileSync(join(process.cwd(), "src/app/api/connectors/google-cal/callback/route.ts"), "utf8").length > 0);
  // The command-line wrapper stays a thin shell around runRedirectCheck.
  const script = src("scripts/check-google-calendar-redirect.ts");
  assert.ok(script.includes("runRedirectCheck(process.argv.slice(2), process.env"));
  assert.ok(src("package.json").includes('"check:google-calendar"'));
});
