/**
 * Sanitized diagnostics for a client-side crash ("Application error: a client-side exception has occurred").
 *
 * Purpose: when a page crashes in an athlete's browser, give the athlete (or the owner who is helping them)
 * a short block of text that identifies the route, the build, the browser and the top of the stack, so a
 * crash such as the reported Safari one can be traced to a real cause instead of being guessed at.
 *
 * Privacy rules, enforced here and tested in client-error-diagnostics.test.ts:
 *  - Nothing is sent anywhere. The text is built in the browser and shown on screen; the athlete chooses
 *    whether to copy and share it.
 *  - The route keeps only the path shape: no query string, no fragment, and anything that looks like an
 *    id, token or e-mail address is replaced by ":id".
 *  - The message and the stack have URLs reduced to a same-site path (query and host removed), and e-mail
 *    addresses, tokens, secrets in key=value form and long digit runs replaced by placeholders.
 *  - The full user-agent string is never kept; only browser family, version (major, or major.minor for Safari), OS and engine.
 *  - No cookie, storage, form value, account field or athlete data is read.
 *
 * What this does NOT capture: the athlete's last tap. A browser does not expose it, and the page-load
 * type and entry referrer below describe how the document was first loaded, not the latest navigation.
 * The report says so, so nobody reads them as the preceding action.
 */

export type ErrorKind = "chunk-load" | "hydration" | "other";
export type Engine = "WebKit" | "Blink" | "Gecko" | "unknown";
export interface BrowserInfo { family: string; version: string | null; os: string; engine: Engine }

export interface DiagnosticsInput {
  error: unknown;
  /** location.pathname, or a full URL. Only the path shape is kept. */
  pathname: string;
  userAgent?: string;
  /** NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA when the platform exposes it. */
  buildId?: string;
  /** Navigation Timing type of the initial document load. */
  documentLoadType?: string;
  /** document.referrer of the initial document load. */
  referrer?: string;
  /** location.origin; a referrer is kept only when it is on this origin. */
  origin?: string;
  now?: Date;
  online?: boolean;
  /** True when launched from the home screen (navigator.standalone or display-mode: standalone). */
  standalone?: boolean;
}

export interface ClientDiagnostics {
  occurredAt: string;
  route: string;
  build: string;
  browser: BrowserInfo;
  displayMode: "standalone" | "browser" | null;
  online: boolean | null;
  kind: ErrorKind;
  errorName: string;
  message: string;
  digest: string | null;
  documentLoadType: string | null;
  entryReferrerRoute: string | null;
  stack: string[];
}

const MAX_MESSAGE = 240;
const MAX_FRAMES = 8;
const MAX_FRAME = 200;
const MAX_ROUTE = 120;

/** A path segment that identifies a person or a record rather than a page. */
function looksLikeIdentifier(segment: string): boolean {
  if (/^\d+$/.test(segment)) return true; // numeric id
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true; // uuid
  if (/@/.test(segment)) return true; // e-mail address
  if (/^[0-9a-f]{12,}$/i.test(segment)) return true; // hex id / hash
  return segment.length >= 20 && /^[A-Za-z0-9_-]+$/.test(segment) && /\d/.test(segment); // cuid, token
}

/** Path shape only: no host, query or fragment; identifier-like segments become ":id". */
export function sanitizeRoute(value: string | null | undefined): string {
  if (!value) return "/";
  let path = String(value);
  try { if (/^[a-z][a-z0-9+.-]*:/i.test(path)) path = new URL(path).pathname; } catch { return "/"; }
  path = path.split("#")[0].split("?")[0];
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  const cleaned = path.split("/").map((segment) => {
    let decoded = segment;
    try { decoded = decodeURIComponent(segment); } catch { /* keep the raw segment */ }
    return looksLikeIdentifier(decoded) || looksLikeIdentifier(segment) ? ":id" : segment.replace(/[^A-Za-z0-9._~%!$&'()*+,;=:@-]/g, "");
  }).join("/");
  return cleaned.slice(0, MAX_ROUTE) || "/";
}

/** Keeps the useful part of a URL (a same-site build asset path) and drops host, query and fragment. */
function urlToPath(url: string): string {
  try {
    const { pathname } = new URL(url);
    return /^\/_next\/static\//.test(pathname) ? pathname : "<url>";
  } catch { return "<url>"; }
}

/** Replaces e-mail addresses, tokens, secrets and URLs. Applied to the message and to every stack frame. */
export function sanitizeText(value: unknown, max = MAX_MESSAGE): string {
  let text = typeof value === "string" ? value : value == null ? "" : String(value);
  text = text
    .replace(/https?:\/\/[^\s)'"<>]+/gi, (url) => urlToPath(url))
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "<email>")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]*)?/g, "<token>")
    .replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, "$1 <token>")
    .replace(/\b(token|secret|password|passwd|authorization|api[_-]?key|access[_-]?key|session|cookie|code|state|key)\s*[=:]\s*["']?[^\s"',;&]+/gi, "$1=<redacted>")
    // Long mixed-character strings are tokens, except a path segment (build asset names carry a content hash).
    // No regex lookbehind here: this code runs inside the crash screen, and older Safari rejects lookbehind at parse time.
    .replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/g, (match, offset: number, whole: string) => (whole[offset - 1] === "/" ? match : "<token>"))
    .replace(/\b[0-9a-f]{32,}\b/gi, (match, offset: number, whole: string) => (whole[offset - 1] === "/" ? match : "<token>"))
    .replace(/\d{9,}/g, "<number>")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Top stack frames, in Chrome ("at fn (url:1:2)") or Safari/Firefox ("fn@url:1:2") form, sanitized. */
export function sanitizeStack(stack: unknown): string[] {
  if (typeof stack !== "string") return [];
  return stack
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^at\s/.test(line) || line.includes("@"))
    .slice(0, MAX_FRAMES)
    .map((line) => sanitizeText(line, MAX_FRAME))
    .filter(Boolean);
}

const IN_APP: Array<[RegExp, string]> = [
  [/Instagram/i, "Instagram in-app browser"],
  [/\b(FBAN|FBAV|FB_IAB)\b/, "Facebook in-app browser"],
  [/LinkedInApp/i, "LinkedIn in-app browser"],
  [/Snapchat/i, "Snapchat in-app browser"],
  [/MicroMessenger/i, "WeChat in-app browser"],
  [/\bLine\//, "LINE in-app browser"],
  [/\bGSA\//, "Google app in-app browser"],
  [/Twitter/i, "Twitter in-app browser"],
];

function osOf(ua: string): string {
  const ios = /\b(?:iPhone|iPad|iPod)\b/.test(ua);
  if (ios) {
    const match = /\bOS (\d+)[_.](\d+)/.exec(ua) ?? /\biOS (\d+)[_.](\d+)/.exec(ua);
    return match ? `iOS ${match[1]}.${match[2]}` : "iOS";
  }
  const android = /Android (\d+(?:\.\d+)?)/.exec(ua);
  if (android) return `Android ${android[1]}`;
  if (/Windows/.test(ua)) return "Windows";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/Mac OS X|Macintosh/.test(ua)) return "macOS"; // the version in a Mac user agent is frozen and unhelpful
  if (/Linux|X11/.test(ua)) return "Linux";
  return "unknown";
}

/** Browser family, version, OS and engine. The full user-agent string is never returned. */
export function parseBrowser(userAgent: string | undefined): BrowserInfo {
  const ua = typeof userAgent === "string" ? userAgent.slice(0, 600) : "";
  const os = osOf(ua);
  const ios = os.startsWith("iOS");
  const major = (re: RegExp) => re.exec(ua)?.[1] ?? null;
  if (!ua) return { family: "unknown", version: null, os, engine: "unknown" };
  for (const [pattern, label] of IN_APP) if (pattern.test(ua)) return { family: label, version: null, os, engine: ios ? "WebKit" : "unknown" };
  if (ios) {
    // Every iOS browser renders with WebKit; the engine is what matters for Safari-specific crashes.
    if (/CriOS\//.test(ua)) return { family: "Chrome on iOS", version: major(/CriOS\/(\d+)/), os, engine: "WebKit" };
    if (/FxiOS\//.test(ua)) return { family: "Firefox on iOS", version: major(/FxiOS\/(\d+)/), os, engine: "WebKit" };
    if (/EdgiOS\//.test(ua)) return { family: "Edge on iOS", version: major(/EdgiOS\/(\d+)/), os, engine: "WebKit" };
    if (/OPiOS\//.test(ua)) return { family: "Opera on iOS", version: major(/OPiOS\/(\d+)/), os, engine: "WebKit" };
    if (/\bSafari\//.test(ua)) return { family: "Safari", version: major(/Version\/(\d+(?:\.\d+)?)/), os, engine: "WebKit" };
    return { family: "iOS in-app WebView", version: null, os, engine: "WebKit" };
  }
  if (/\bEdg\//.test(ua)) return { family: "Edge", version: major(/Edg\/(\d+)/), os, engine: "Blink" };
  if (/\bOPR\//.test(ua)) return { family: "Opera", version: major(/OPR\/(\d+)/), os, engine: "Blink" };
  if (/SamsungBrowser\//.test(ua)) return { family: "Samsung Internet", version: major(/SamsungBrowser\/(\d+)/), os, engine: "Blink" };
  if (/\bFirefox\//.test(ua)) return { family: "Firefox", version: major(/Firefox\/(\d+)/), os, engine: "Gecko" };
  if (/\bChrome\//.test(ua)) return { family: "Chrome", version: major(/Chrome\/(\d+)/), os, engine: "Blink" };
  if (/\bSafari\//.test(ua) && /Version\//.test(ua)) return { family: "Safari", version: major(/Version\/(\d+(?:\.\d+)?)/), os, engine: "WebKit" };
  return { family: "unknown", version: null, os, engine: "unknown" };
}

/** A short build identifier from the platform's commit SHA, or "unknown". */
export function sanitizeBuildId(value: string | undefined): string {
  return value && /^[0-9a-f]{7,40}$/i.test(value) ? value.slice(0, 7).toLowerCase() : "unknown";
}

export function classifyError(name: string, message: string): ErrorKind {
  if (name === "ChunkLoadError" || /Loading (?:CSS )?chunk [^ ]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message)) return "chunk-load";
  if (/hydrat|Minified React error #(?:418|422|423|425)\b/i.test(message)) return "hydration";
  return "other";
}

function readError(error: unknown): { name: string; message: unknown; stack: unknown; digest: unknown } {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return { name: typeof record.name === "string" ? record.name : "Error", message: record.message, stack: record.stack, digest: record.digest };
  }
  return { name: "Error", message: error, stack: undefined, digest: undefined };
}

const LOAD_TYPES = ["navigate", "reload", "back_forward", "prerender"];

export function buildClientDiagnostics(input: DiagnosticsInput): ClientDiagnostics {
  const { name, message, stack, digest } = readError(input.error);
  const safeName = /^[A-Za-z][A-Za-z0-9_.]{0,60}$/.test(name) ? name : "Error";
  const safeMessage = sanitizeText(message);
  let entryReferrerRoute: string | null = null;
  if (input.referrer && input.origin) {
    try { if (new URL(input.referrer).origin === input.origin) entryReferrerRoute = sanitizeRoute(input.referrer); } catch { /* not a URL */ }
  }
  return {
    occurredAt: (input.now ?? new Date()).toISOString(),
    route: sanitizeRoute(input.pathname),
    build: sanitizeBuildId(input.buildId),
    browser: parseBrowser(input.userAgent),
    displayMode: input.standalone === undefined ? null : input.standalone ? "standalone" : "browser",
    online: typeof input.online === "boolean" ? input.online : null,
    kind: classifyError(safeName, typeof message === "string" ? message : ""),
    errorName: safeName,
    message: safeMessage,
    digest: typeof digest === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(digest) ? digest : null,
    documentLoadType: input.documentLoadType && LOAD_TYPES.includes(input.documentLoadType) ? input.documentLoadType : null,
    entryReferrerRoute,
    stack: sanitizeStack(stack),
  };
}

/** The plain-text block shown on screen and copied by the athlete. */
export function formatDiagnostics(d: ClientDiagnostics): string {
  const { browser } = d;
  const lines = [
    "JMM client error report (sanitized; review before sharing)",
    `Time: ${d.occurredAt}`,
    `Route: ${d.route}`,
    `Build: ${d.build}`,
    `Browser: ${browser.family}${browser.version ? ` ${browser.version}` : ""} on ${browser.os} (${browser.engine})${d.displayMode ? `, ${d.displayMode}` : ""}`,
    `Online: ${d.online === null ? "unknown" : d.online ? "yes" : "no"}`,
    `Kind: ${d.kind}`,
    `Error: ${d.errorName}${d.message ? `: ${d.message}` : ""}`,
  ];
  if (d.digest) lines.push(`Digest: ${d.digest}`);
  lines.push(`Page load: ${d.documentLoadType ?? "unknown"}${d.entryReferrerRoute ? `; entered from ${d.entryReferrerRoute}` : ""} (describes how the page was first loaded, not the last tap)`);
  lines.push("Preceding action: not captured. Ask what was tapped just before the error.");
  if (d.stack.length) { lines.push("Stack (top frames):"); for (const frame of d.stack) lines.push(`  ${frame}`); }
  return lines.join("\n");
}

/** Wording for the crash screen. The text promises no outcome and makes no claim about saved data. */
export function crashScreenCopy(es: boolean, kind: ErrorKind) {
  return es
    ? {
        heading: "Esta pantalla no pudo cargarse",
        body: kind === "chunk-load"
          ? "No se pudo descargar una parte de la aplicación. Puede ocurrir si hay una versión nueva o si la conexión se interrumpió. Vuelve a cargar la página."
          : "Ocurrió un error al mostrar esta pantalla. Puedes intentarlo de nuevo o volver a Hoy.",
        retry: "Intentar de nuevo",
        reload: "Recargar la página",
        home: "Ir a Hoy",
        details: "Detalles técnicos",
        detailsHint: "Texto técnico sin identificadores ni claves. Revísalo antes de compartirlo con soporte.",
        copy: "Copiar detalles",
        copied: "Copiado",
        copyFailed: "No se pudo copiar. Selecciona el texto y cópialo manualmente.",
      }
    : {
        heading: "This screen couldn't load",
        body: kind === "chunk-load"
          ? "Part of the app couldn't be downloaded. This can happen after an update or if the connection dropped. Reload the page."
          : "Something went wrong while showing this screen. You can try again or go back to Today.",
        retry: "Try again",
        reload: "Reload the page",
        home: "Go to Today",
        details: "Technical details",
        detailsHint: "Technical text with identifiers and keys removed. Review it before sharing it with support.",
        copy: "Copy details",
        copied: "Copied",
        copyFailed: "Couldn't copy. Select the text and copy it manually.",
      };
}
