/**
 * Offline configuration check for the Google OAuth redirect URIs.
 *
 * Why it exists: Google rejects an authorization request with `Error 400: redirect_uri_mismatch`
 * when the `redirect_uri` the app sends is not byte-for-byte one of the "Authorized redirect URIs"
 * registered on the OAuth client. The app builds that value from environment variables
 * (src/lib/oauth.ts for Calendar, src/lib/sign-in-config.ts + social-sign-in.ts for sign-in), so the
 * value actually sent is easy to get wrong and hard to see.
 *
 * What it does: reproduces the value the app will send, flags configuration that cannot match, and,
 * when the owner supplies the list of URIs currently registered in the Google Cloud console,
 * compares them exactly and names near misses.
 *
 * What it cannot do: see the Google Cloud console, the consent screen, API enablement or token
 * refresh. Those stay owner-verified (see `notVerified` and docs/OWNER-SETUP.md). It makes no network
 * request, changes no setting and never returns a secret: the client secret is reported as
 * present/absent only, and the client ID is reported as present / well-formed / matches-expected only.
 *
 * The pure functions here mirror src/lib/oauth.ts. oauth-redirect-check.test.ts asserts that the
 * mirrored expressions are still present in those files, so a change there fails the test here.
 */

export const GOOGLE_CALENDAR_CALLBACK_PATH = "/api/connectors/google-cal/callback";
export const GOOGLE_SIGN_IN_CALLBACK_PATH = "/api/auth/google/callback";
export const GOOGLE_ENV_KEYS = [
  "NEXT_PUBLIC_APP_URL",
  "APP_URL",
  "GOOGLE_REDIRECT_URI",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
] as const;
export type GoogleEnvKey = (typeof GOOGLE_ENV_KEYS)[number];
export type GoogleEnv = Partial<Record<GoogleEnvKey, string | undefined>>;

export type Severity = "error" | "warning" | "info";
export interface Finding { id: string; severity: Severity; message: string; fix?: string }
export type RedirectSource = "GOOGLE_REDIRECT_URI" | "APP_URL" | "NEXT_PUBLIC_APP_URL" | "default-localhost";
export type UriPurpose = "calendar" | "sign-in" | "calendar-smoke";
export interface RequiredUri { uri: string; purposes: UriPurpose[] }
export interface RegisteredComparison {
  uri: string;
  status: "registered" | "near-miss" | "missing";
  /** The registered entry that is almost, but not exactly, this URI. */
  nearMiss?: { registered: string; reason: string };
}
export interface RedirectCheckInput {
  env: GoogleEnv;
  /** Exact "Authorized redirect URIs" currently listed on the OAuth client. Omit when not available. */
  registered?: string[];
  /** The client ID the owner expects the deployment to use (compared, never echoed). */
  expectClientId?: string;
  /** Default true. Set false to skip the credential presence checks. */
  checkCredentials?: boolean;
  /** Default false: production requires https. True allows http on localhost/127.0.0.1. */
  allowLocalhost?: boolean;
}
export interface RedirectCheckResult {
  status: "pass" | "partial" | "fail";
  calendarRedirectUri: string;
  calendarRedirectSource: RedirectSource;
  signInRedirectUri: string | null;
  /** Every URI the OAuth client must list, for the configuration as given. */
  required: RequiredUri[];
  credentials: {
    checked: boolean;
    clientIdPresent: boolean;
    clientIdWellFormed: boolean | null;
    clientIdMatchesExpected: boolean | null;
    clientSecretPresent: boolean;
  };
  registration: { compared: boolean; entries: number; results: RegisteredComparison[] };
  findings: Finding[];
  notVerified: string[];
}

const NOT_VERIFIED = [
  "Whether the Authorized redirect URIs on the Google Cloud console match (unless you passed --registered or --registered-file).",
  "Whether the Google Calendar API is enabled for the project.",
  "The OAuth consent screen: publishing status, test users, and the sensitive calendar scope.",
  "Whether a real athlete can complete consent, and whether the refresh token works after the access token expires.",
];

/** Mirrors `config()` in src/lib/oauth.ts: the exact `redirect_uri` the Calendar flow sends to Google. */
export function calendarRedirectUri(env: GoogleEnv, smoke = false): { uri: string; source: RedirectSource } {
  const base = (smoke ? env.APP_URL : undefined) || env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const override = env.GOOGLE_REDIRECT_URI;
  if (override && /^https?:\/\//.test(override)) return { uri: override, source: "GOOGLE_REDIRECT_URI" };
  const source: RedirectSource = smoke && env.APP_URL ? "APP_URL" : env.NEXT_PUBLIC_APP_URL ? "NEXT_PUBLIC_APP_URL" : "default-localhost";
  return { uri: `${base}${GOOGLE_CALENDAR_CALLBACK_PATH}`, source };
}

/** Mirrors `signInBase()` + startSignIn(): `null` when sign-in cannot start (no origin, or an invalid one). */
export function signInRedirectUri(env: GoogleEnv): string | null {
  const value = env.APP_URL || env.NEXT_PUBLIC_APP_URL;
  if (!value) return null;
  try { return `${new URL(value).origin}${GOOGLE_SIGN_IN_CALLBACK_PATH}`; } catch { return null; }
}

function parse(value: string): URL | null {
  try { return new URL(value); } catch { return null; }
}

/** Why a registered entry that is not an exact match is still a near miss, or null when it is unrelated. */
export function describeNearMiss(expected: string, candidate: string): string | null {
  if (expected === candidate) return null;
  if (candidate !== candidate.trim()) return "it has leading or trailing whitespace";
  const e = parse(expected), c = parse(candidate);
  if (!e || !c) return null;
  const sameHost = e.host === c.host, samePath = e.pathname === c.pathname;
  if (sameHost && samePath) {
    if (e.protocol !== c.protocol) return `it uses ${c.protocol.slice(0, -1)} instead of ${e.protocol.slice(0, -1)}`;
    if (e.search !== c.search || e.hash !== c.hash) return "it adds a query string or fragment";
    return "it differs only by letter case in the host or by an explicit default port";
  }
  if (samePath) {
    const bare = (host: string) => host.replace(/^www\./, "");
    return bare(e.host) === bare(c.host) ? "it differs only by a www. prefix" : `it is registered for a different host (${c.host})`;
  }
  if (sameHost) {
    if (e.pathname === c.pathname.replace(/\/+$/, "")) return "it has a trailing slash";
    if (e.pathname.toLowerCase() === c.pathname.toLowerCase()) return "it differs only by letter case in the path";
    // Only Google-looking paths count; other providers' callbacks on the same host are unrelated.
    return /google/i.test(c.pathname) ? `it is registered for a different path (${c.pathname})` : null;
  }
  return null;
}

/** A value that cannot be what its author meant: invisible whitespace, a stray line break, wrapping quotes. */
function contamination(value: string): string | null {
  if (/[\r\n]/.test(value)) return "contains a line break";
  if (value !== value.trim()) return "has leading or trailing whitespace";
  if (/^(["']).*\1$/.test(value)) return "is wrapped in quotation marks";
  if (/\s/.test(value)) return "contains whitespace";
  return null;
}

const isLocalhost = (hostname: string) => hostname === "localhost" || hostname === "127.0.0.1";
const GOOGLE_CLIENT_ID_SHAPE = /^\d{6,}-[a-z0-9]+\.apps\.googleusercontent\.com$/;

export function checkGoogleRedirectConfig(input: RedirectCheckInput): RedirectCheckResult {
  const { env } = input;
  const checkCredentials = input.checkCredentials !== false;
  const allowLocalhost = input.allowLocalhost === true;
  const findings: Finding[] = [];
  const add = (finding: Finding) => findings.push(finding);

  // ── Stray characters in any value the redirect or credentials are built from ──────────────
  for (const key of GOOGLE_ENV_KEYS) {
    const value = env[key];
    if (!value) continue;
    const problem = contamination(value);
    if (problem) add({
      id: "value-contaminated",
      severity: "error",
      message: `${key} ${problem}. The app uses the value exactly as stored (no trimming), so Google receives it with the extra characters.`,
      fix: `Re-enter ${key} with no extra characters. If it was piped from echo, use printf '%s' so no newline is stored.`,
    });
  }

  // ── The application origin ────────────────────────────────────────────────────────────────
  const appOrigin = env.NEXT_PUBLIC_APP_URL;
  if (!appOrigin) {
    add({
      id: "missing-app-origin",
      severity: "error",
      message: "NEXT_PUBLIC_APP_URL is not set. The Calendar redirect falls back to http://localhost:3000 unless GOOGLE_REDIRECT_URI overrides it.",
      fix: "Set NEXT_PUBLIC_APP_URL to the public HTTPS origin of the deployment, with no path and no trailing slash.",
    });
  } else {
    const parsed = parse(appOrigin);
    if (!parsed) add({ id: "app-origin-invalid", severity: "error", message: "NEXT_PUBLIC_APP_URL is not a valid absolute URL.", fix: "Use the form https://your-domain.example (no path, no trailing slash)." });
    else if (parsed.pathname !== "/" || parsed.search || parsed.hash) add({
      id: "app-origin-has-path",
      severity: "error",
      message: "NEXT_PUBLIC_APP_URL contains a path, query string or fragment. The Calendar redirect appends its path to this value as-is, while sign-in keeps only the origin, so the two disagree.",
      fix: "Use the bare origin, e.g. https://your-domain.example",
    });
  }

  // ── The Calendar redirect URI actually sent ───────────────────────────────────────────────
  const calendar = calendarRedirectUri(env);
  const overrideSet = Boolean(env.GOOGLE_REDIRECT_URI);
  if (overrideSet && calendar.source !== "GOOGLE_REDIRECT_URI") add({
    id: "override-ignored",
    severity: "error",
    message: "GOOGLE_REDIRECT_URI is set but does not start with http:// or https://, so the app silently ignores it and builds the redirect from NEXT_PUBLIC_APP_URL instead.",
    fix: "Set it to the full callback URL, or clear it to use the value built from NEXT_PUBLIC_APP_URL.",
  });
  const cal = parse(calendar.uri);
  if (!cal) {
    add({ id: "redirect-invalid", severity: "error", message: "The Calendar redirect URI the app would send is not a valid URL.", fix: "Correct NEXT_PUBLIC_APP_URL or GOOGLE_REDIRECT_URI." });
  } else {
    if (cal.protocol !== "https:" && !(allowLocalhost && isLocalhost(cal.hostname))) add({
      id: "redirect-not-https",
      severity: "error",
      message: `The Calendar redirect URI uses ${cal.protocol.slice(0, -1)}. Google requires https for a production web client (http is accepted only for localhost).`,
      fix: "Use the https origin of the deployment.",
    });
    if (cal.pathname.startsWith("//")) add({
      id: "redirect-double-slash",
      severity: "error",
      message: "The Calendar redirect URI contains a double slash before /api (the origin ends with a slash and the app appends its path). This cannot match a registered URI.",
      fix: "Remove the trailing slash from the value in use (NEXT_PUBLIC_APP_URL, or APP_URL for the smoke test).",
    });
    else if (cal.pathname !== GOOGLE_CALENDAR_CALLBACK_PATH) add({
      id: "redirect-wrong-path",
      severity: "error",
      message: `The Calendar redirect path is ${cal.pathname}, but the callback route is served at ${GOOGLE_CALENDAR_CALLBACK_PATH}. Google would send the athlete to a URL the app does not handle.`,
      fix: `Use ${GOOGLE_CALENDAR_CALLBACK_PATH}.`,
    });
    if (cal.search || cal.hash) add({
      id: "redirect-has-query",
      severity: "warning",
      message: "The Calendar redirect URI includes a query string or fragment. Google compares the whole string, and the app expects exactly origin + path.",
      fix: "Remove the query string or fragment.",
    });
    if (/(^|\.)vercel\.app$/.test(cal.hostname)) add({
      id: "legacy-host",
      severity: "warning",
      message: `The Calendar redirect uses ${cal.hostname}, a deployment hostname rather than the public custom domain. A registration for the custom domain does not cover it.`,
      fix: "Confirm this is the origin athletes use; otherwise point NEXT_PUBLIC_APP_URL (and any override) at the public domain.",
    });
    const base = appOrigin ? parse(appOrigin) : null;
    if (calendar.source === "GOOGLE_REDIRECT_URI" && base && base.origin !== cal.origin) add({
      id: "override-origin-differs",
      severity: "warning",
      message: "GOOGLE_REDIRECT_URI is on a different origin from NEXT_PUBLIC_APP_URL. The athlete starts on one host and returns to another; the app then redirects to NEXT_PUBLIC_APP_URL.",
      fix: "Align both on the canonical origin unless this is deliberate.",
    });
  }

  // ── The sign-in redirect URI actually sent ────────────────────────────────────────────────
  const signIn = signInRedirectUri(env);
  if (!signIn) add({
    id: "signin-origin-unusable",
    severity: "error",
    message: "Neither APP_URL nor NEXT_PUBLIC_APP_URL holds a valid absolute URL, so Google sign-in cannot start in production.",
    fix: "Set APP_URL (preferred) or NEXT_PUBLIC_APP_URL to the public HTTPS origin.",
  });
  else {
    const parsedSignIn = new URL(signIn);
    if (parsedSignIn.protocol !== "https:" && !(allowLocalhost && isLocalhost(parsedSignIn.hostname))) add({
      id: "signin-not-https",
      severity: "error",
      message: "The sign-in origin is not https. The app rejects it in production.",
      fix: "Use the https origin of the deployment.",
    });
  }
  const appUrl = env.APP_URL ? parse(env.APP_URL) : null;
  const publicUrl = appOrigin ? parse(appOrigin) : null;
  if (appUrl && publicUrl && appUrl.origin !== publicUrl.origin) add({
    id: "origins-differ",
    severity: "warning",
    message: "APP_URL and NEXT_PUBLIC_APP_URL are different origins. Sign-in uses APP_URL and Calendar uses NEXT_PUBLIC_APP_URL, so each one's callback must be registered.",
    fix: "Keep both on the canonical origin unless the difference is deliberate.",
  });

  // ── URIs the client must list ─────────────────────────────────────────────────────────────
  // What must be registered is the value the app will send once stray characters are removed.
  const tidy = (value?: string) => (value === undefined ? undefined : value.trim().replace(/^(["'])(.*)\1$/, "$2").trim());
  const intendedEnv: GoogleEnv = { ...env, NEXT_PUBLIC_APP_URL: tidy(env.NEXT_PUBLIC_APP_URL), APP_URL: tidy(env.APP_URL), GOOGLE_REDIRECT_URI: tidy(env.GOOGLE_REDIRECT_URI) };
  const required: RequiredUri[] = [];
  const need = (uri: string | null, purpose: UriPurpose) => {
    if (!uri) return;
    const existing = required.find((item) => item.uri === uri);
    if (existing) { if (!existing.purposes.includes(purpose)) existing.purposes.push(purpose); }
    else required.push({ uri, purposes: [purpose] });
  };
  const intendedCalendar = calendarRedirectUri(intendedEnv).uri;
  need(intendedCalendar, "calendar");
  need(signInRedirectUri(intendedEnv), "sign-in");
  // The Calendar smoke test builds its redirect from APP_URL first (src/lib/oauth.ts); register it only when it differs.
  const intendedSmoke = calendarRedirectUri(intendedEnv, true).uri;
  if (intendedSmoke !== intendedCalendar) need(intendedSmoke, "calendar-smoke");

  // ── Credentials (presence and shape only; values are never returned) ───────────────────
  const clientId = env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = env.GOOGLE_CLIENT_SECRET ?? "";
  const credentials: RedirectCheckResult["credentials"] = {
    checked: checkCredentials,
    clientIdPresent: Boolean(clientId),
    clientIdWellFormed: clientId ? GOOGLE_CLIENT_ID_SHAPE.test(clientId) : null,
    clientIdMatchesExpected: input.expectClientId && clientId ? clientId === input.expectClientId : null,
    clientSecretPresent: Boolean(clientSecret),
  };
  if (checkCredentials) {
    if (!clientId) add({ id: "missing-client-id", severity: "error", message: "GOOGLE_CLIENT_ID is not set, so the Calendar connection and Google sign-in are unavailable.", fix: "Set it in the deployment's environment (see docs/OWNER-SETUP.md)." });
    else if (credentials.clientIdWellFormed === false) add({ id: "client-id-shape", severity: "warning", message: "GOOGLE_CLIENT_ID does not look like a Google OAuth client ID (digits-suffix.apps.googleusercontent.com).", fix: "Copy it again from Google Cloud console → Credentials → OAuth 2.0 Client IDs." });
    if (!clientSecret) add({ id: "missing-client-secret", severity: "error", message: "GOOGLE_CLIENT_SECRET is not set.", fix: "Set it in the deployment's secret manager. Never commit it." });
    if (input.expectClientId && clientId && credentials.clientIdMatchesExpected === false) add({
      id: "client-id-mismatch",
      severity: "error",
      message: "GOOGLE_CLIENT_ID is not the client ID you expected. Redirect URIs must be registered on the client the deployment actually uses.",
      fix: "Register the URIs on the client whose ID matches the deployment, or update the deployment to the intended client.",
    });
  }

  // ── Comparison with the console's list ────────────────────────────────────────────────────
  const compared = input.registered !== undefined;
  const registered = input.registered ?? [];
  const results: RegisteredComparison[] = [];
  if (compared) {
    if (registered.length === 0) add({ id: "registered-empty", severity: "warning", message: "The registered list is empty. Nothing can match.", fix: "Paste the Authorized redirect URIs from the OAuth client, one per entry." });
    for (const { uri, purposes } of required) {
      if (registered.includes(uri)) { results.push({ uri, status: "registered" }); continue; }
      let near: { registered: string; reason: string } | undefined;
      for (const candidate of registered) {
        if (required.some((item) => item.uri === candidate)) continue; // another URI this app needs, not a typo
        const reason = describeNearMiss(uri, candidate);
        if (reason) { near = { registered: candidate, reason }; break; }
      }
      results.push(near ? { uri, status: "near-miss", nearMiss: near } : { uri, status: "missing" });
      add({
        id: near ? "registered-near-miss" : "not-registered",
        severity: "error",
        message: near
          ? `${uri} (${purposes.join(", ")}) is not registered. The closest entry, ${near.registered}, does not match because ${near.reason}.`
          : `${uri} (${purposes.join(", ")}) is not in the registered list.`,
        fix: `Add exactly ${uri} to Authorized redirect URIs on the OAuth client used by GOOGLE_CLIENT_ID. Keep the other entries.`,
      });
    }
    const legacy = registered.filter((entry) => /vercel\.app/.test(entry));
    if (legacy.length) add({
      id: "legacy-registered-kept",
      severity: "info",
      message: `${legacy.length} registered entr${legacy.length === 1 ? "y uses" : "ies use"} a vercel.app host. Leave unrelated entries in place unless you have confirmed no deployment still uses them.`,
    });
  }

  const errors = findings.some((finding) => finding.severity === "error");
  return {
    status: errors ? "fail" : compared ? "pass" : "partial",
    calendarRedirectUri: calendar.uri,
    calendarRedirectSource: calendar.source,
    signInRedirectUri: signIn,
    required,
    credentials,
    registration: { compared, entries: registered.length, results },
    findings,
    notVerified: compared ? NOT_VERIFIED.slice(1) : NOT_VERIFIED,
  };
}

// ── Environment file parsing (only the keys this check reads) ─────────────────────────────────

/** Reads KEY=VALUE lines, returning only the keys in GOOGLE_ENV_KEYS. Other lines are never kept. */
export function parseEnvFile(text: string): GoogleEnv {
  const env: GoogleEnv = {};
  for (const raw of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(raw);
    if (!match || !(GOOGLE_ENV_KEYS as readonly string[]).includes(match[1])) continue;
    let value = match[2].trim();
    if (/^".*"$/.test(value)) value = value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\"/g, '"');
    else if (/^'.*'$/.test(value)) value = value.slice(1, -1);
    env[match[1] as GoogleEnvKey] = value;
  }
  return env;
}

// ── Command line ─────────────────────────────────────────────────────────────────────────────

export interface CheckArgs {
  registered: string[];
  registeredFile?: string;
  envFile?: string;
  expectClientId?: string;
  json: boolean;
  credentialCheck: boolean;
  allowLocalhost: boolean;
  help: boolean;
}

export const CHECK_USAGE = `Usage: npm run check:google-calendar -- [options]

Offline check of the Google OAuth redirect URIs. Makes no network request and prints no secrets.

  --registered <uri[,uri...]>   Authorized redirect URIs currently on the OAuth client (repeatable)
  --registered-file <path>      Same, one URI per line (blank lines and # comments ignored)
  --env-file <path>             Read the settings from a file (e.g. pulled production env) instead of this process's environment
  --expect-client-id <id>       Fail if GOOGLE_CLIENT_ID is a different client (compared, never printed)
  --no-credential-check         Skip the client ID / secret presence checks
  --allow-localhost             Allow http on localhost (development only)
  --json                        Machine-readable output
  --help

Exit codes: 0 no configuration errors (see "registration" for whether the console list was compared),
            1 configuration errors found, 2 usage error.`;

export function parseCheckArgs(argv: string[]): { args: CheckArgs } | { error: string } {
  const args: CheckArgs = { registered: [], json: false, credentialCheck: true, allowLocalhost: false, help: false };
  const valued = new Set(["--registered", "--registered-file", "--env-file", "--expect-client-id"]);
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const eq = token.startsWith("--") ? token.indexOf("=") : -1;
    const flag = eq === -1 ? token : token.slice(0, eq);
    if (flag === "--json") args.json = true;
    else if (flag === "--help" || flag === "-h") args.help = true;
    else if (flag === "--no-credential-check") args.credentialCheck = false;
    else if (flag === "--allow-localhost") args.allowLocalhost = true;
    else if (valued.has(flag)) {
      const value = eq === -1 ? argv[++i] : token.slice(eq + 1);
      if (value === undefined || value === "" || (eq === -1 && value.startsWith("--"))) return { error: `${flag} needs a value` };
      if (flag === "--registered") args.registered.push(...value.split(",").map((item) => item.trim()).filter(Boolean));
      else if (flag === "--registered-file") args.registeredFile = value;
      else if (flag === "--env-file") args.envFile = value;
      else args.expectClientId = value;
    } else return { error: `Unknown option ${flag}` };
  }
  return { args };
}

const LABEL: Record<UriPurpose, string> = { calendar: "Calendar connection", "sign-in": "Google sign-in", "calendar-smoke": "Calendar smoke test" };

/** Makes stray line breaks and tabs in a value visible instead of silently reflowing the report. */
const visible = (value: string) => value.replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t");

export function formatRedirectCheck(result: RedirectCheckResult): string {
  const lines: string[] = [];
  lines.push("Google OAuth redirect check (offline: reads configuration only)");
  lines.push("");
  lines.push(`Calendar flow sends redirect_uri: ${visible(result.calendarRedirectUri)}  [from ${result.calendarRedirectSource}]`);
  lines.push(`Sign-in flow sends redirect_uri:  ${result.signInRedirectUri ? visible(result.signInRedirectUri) : "(cannot start: no usable origin)"}`);
  lines.push("");
  lines.push("Register these exact URIs under Authorized redirect URIs on the OAuth client used by GOOGLE_CLIENT_ID:");
  result.required.forEach((item, index) => lines.push(`  ${index + 1}. ${item.uri}   (${item.purposes.map((purpose) => LABEL[purpose]).join(", ")})`));
  lines.push("");
  const c = result.credentials;
  if (c.checked) {
    lines.push(`Credentials: GOOGLE_CLIENT_ID ${c.clientIdPresent ? "present" : "MISSING"}${c.clientIdWellFormed === false ? " (unexpected format)" : ""}${c.clientIdMatchesExpected === null ? "" : c.clientIdMatchesExpected ? ", matches the expected client" : ", DIFFERS from the expected client"}; GOOGLE_CLIENT_SECRET ${c.clientSecretPresent ? "present" : "MISSING"} (values are never printed)`);
  } else lines.push("Credentials: not checked");
  lines.push(result.registration.compared
    ? `Registered list: compared against ${result.registration.entries} entr${result.registration.entries === 1 ? "y" : "ies"}: ${result.registration.results.map((r) => `${r.status} ${r.uri}`).join("; ") || "nothing to compare"}`
    : "Registered list: NOT compared (pass --registered or --registered-file to check what the console holds)");
  lines.push("");
  if (result.findings.length) {
    lines.push("Findings:");
    for (const finding of result.findings) {
      lines.push(`  [${finding.severity.toUpperCase()}] ${finding.id}: ${finding.message}`);
      if (finding.fix) lines.push(`      Fix: ${finding.fix}`);
    }
    lines.push("");
  }
  lines.push("Not verified by this check:");
  for (const item of result.notVerified) lines.push(`  - ${item}`);
  lines.push("");
  const errors = result.findings.filter((f) => f.severity === "error").length;
  const warnings = result.findings.filter((f) => f.severity === "warning").length;
  lines.push(result.status === "fail"
    ? `RESULT: FAIL (${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"})`
    : result.status === "pass"
      ? `RESULT: PASS for configuration and the supplied registered list (${warnings} warning${warnings === 1 ? "" : "s"}); the items above are still unverified`
      : `RESULT: no configuration errors found, but registration was NOT compared (${warnings} warning${warnings === 1 ? "" : "s"})`);
  return lines.join("\n");
}

export interface CheckRun { exitCode: 0 | 1 | 2; stdout: string; stderr: string }

/** The whole command, with the environment and file reads injected so it can be tested without a process. */
export function runRedirectCheck(argv: string[], processEnv: GoogleEnv, readFile: (path: string) => string): CheckRun {
  const parsed = parseCheckArgs(argv);
  if ("error" in parsed) return { exitCode: 2, stdout: "", stderr: `${parsed.error}\n\n${CHECK_USAGE}` };
  const { args } = parsed;
  if (args.help) return { exitCode: 0, stdout: CHECK_USAGE, stderr: "" };
  let env: GoogleEnv = { ...processEnv };
  const read = (path: string): string | null => { try { return readFile(path); } catch { return null; } };
  if (args.envFile) {
    const text = read(args.envFile);
    if (text === null) return { exitCode: 2, stdout: "", stderr: `Could not read the file given to --env-file: ${args.envFile}` };
    env = parseEnvFile(text);
  }
  const registered = [...args.registered];
  if (args.registeredFile) {
    const text = read(args.registeredFile);
    if (text === null) return { exitCode: 2, stdout: "", stderr: `Could not read the file given to --registered-file: ${args.registeredFile}` };
    registered.push(...text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")));
  }
  const result = checkGoogleRedirectConfig({
    env: Object.fromEntries(GOOGLE_ENV_KEYS.map((key) => [key, env[key]])) as GoogleEnv,
    registered: args.registered.length || args.registeredFile ? registered : undefined,
    expectClientId: args.expectClientId,
    checkCredentials: args.credentialCheck,
    allowLocalhost: args.allowLocalhost,
  });
  return {
    exitCode: result.status === "fail" ? 1 : 0,
    stdout: args.json ? JSON.stringify(result, null, 2) : formatRedirectCheck(result),
    stderr: "",
  };
}
