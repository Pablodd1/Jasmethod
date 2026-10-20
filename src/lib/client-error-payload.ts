import { classifyError } from "./client-error-diagnostics";

// Automatic telemetry is a closed vocabulary, not regex-redacted arbitrary prose.
// Names, symptoms and measurements can appear anywhere in an exception or URL.
const routes = new Set(["today", "checkin", "training", "calendar", "onboard", "profile", "login", "register", "connectors", "coach", "chat", "races", "forecast", "help", "admin", "athletes", "settings", "api", "auth", "callback", "google", "google-cal", "workout", "reset-password"]);
export function telemetryRoute(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value.split(/[?#]/)[0].split("/").slice(0, 8).map(s => s === "" || routes.has(s) ? s : ":id").join("/");
}
export function clientErrorPayload(error: unknown, route: unknown) {
  let name = "Error", message = "";
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    name = typeof e.name === "string" ? e.name : name;
    message = typeof e.message === "string" ? e.message : "";
  } else if (typeof error === "string") message = error;
  return { kind: classifyError(name, message), route: telemetryRoute(route) };
}
/** Server boundary: ignore ALL extra client fields, including legacy message/stack. */
export function acceptedClientError(value: unknown) {
  const body = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const kind = body.kind === "hydration" || body.kind === "chunk-load" ? body.kind : "other";
  return { message: `Client error (${kind})`, route: telemetryRoute(body.route) };
}

/** Bound the actual bytes, including chunked requests without Content-Length. */
export async function readTelemetryBody(req: Request): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) throw new Error("Empty body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel(); throw new Error("Body too large"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}
