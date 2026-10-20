/**
 * The athlete setup screen as data: two independent sections, each row carrying FOUR separate statuses.
 *
 *   Section "import"  — Import my training (history and recovery coming IN to JMM)
 *   Section "receive" — Receive my plan    (the approved workout going OUT of JMM)
 *
 * The four statuses are deliberately independent. A provider can be authorized with nothing imported, have
 * imported history while authorization has lapsed, accept a publication without the watch ever receiving it.
 *   authorization   — may JMM talk to this account/recipient? (the athlete authorizes their OWN accounts)
 *   import          — are records from this source actually stored? (count/latest date, or "unknown")
 *   publication     — is JMM able/allowed to hand an approved workout to this channel? (setup-level readiness;
 *                     per-workout publication receipts live in Today and are revision-bound)
 *   deviceDelivery  — did a device confirm it received the workout? JMM never receives such a confirmation
 *                     from Garmin/COROS/Intervals, so this is never "delivered" here.
 *
 * Nothing is mandatory: every row is optional and the athlete can finish setup with no connection at all.
 * Missing information is `unknown`/null, never zero and never "ok".
 */
import { STRAVA_AI_NOTICE } from "./strava-provenance";

export type Lang = "en" | "es";
export type SectionId = "import" | "receive";
export type AuthorizationStatus = "not_required" | "unavailable" | "not_authorized" | "authorized" | "needs_attention" | "unknown";
export type ImportStatus = "not_applicable" | "no_records" | "records_stored" | "stale" | "failed" | "unknown";
export type PublicationStatus = "not_applicable" | "unavailable" | "off" | "ready" | "unknown";
export type DeviceDeliveryStatus = "not_applicable" | "unverified" | "manual_file";

export interface ProviderInput {
  id: string; status?: string | null; configured?: boolean | null; method?: string | null;
  lastSyncAt?: string | null; lastError?: string | null; connectUrl?: string | null;
}
export interface SourceCount { source: string | null; count: number; latestAt: string | null }
export interface SetupInputs {
  now: number;
  /** null = the connections request failed: every provider-backed status becomes `unknown`. */
  providers: ProviderInput[] | null;
  capabilities?: { intervalsConnector?: boolean } | null;
  /** Stored completed-activity counts by Workout.source. null = not loaded (≠ zero). */
  stored?: SourceCount[] | null;
  intervalsPublish?: { enabled: boolean; available: boolean } | null;
  email?: { configured: boolean; verified: boolean; enabled: boolean } | null;
  telegram?: { configured: boolean; paired: boolean; optedIn: boolean } | null;
}

export type RowAction =
  | { kind: "connect"; href: string; reconnect: boolean }
  | { kind: "file"; provider: string; accepts: string[] }
  | { kind: "link"; href: string }
  | { kind: "none" };

export interface SetupRow {
  id: string;
  section: SectionId;
  name: string;
  authorization: AuthorizationStatus;
  import: ImportStatus;
  publication: PublicationStatus;
  deviceDelivery: DeviceDeliveryStatus;
  /** null = no record (rendered "—"), never 0. */
  storedCount: number | null;
  latestRecordAt: string | null;
  lastSuccessfulSyncAt: string | null;
  lastError: string | null;
  /** Strava-origin data can reach this row's records: AI features must not receive them. */
  stravaRestricted: boolean;
  /** Row exists but depends on an owner-enabled capability (Intervals.icu). */
  conditional: boolean;
  action: RowAction;
  /** Stable keys for the explanatory copy; resolved by `rowCopy`. */
  copyKey: string;
}

const STALE_MS = 26 * 3600000;
const RECONNECT = /reconnect|expired|authorization/i;
/** File formats the importer actually accepts today. Single source of truth for the UI and its tests. */
export const IMPORT_FILE_FORMATS = { garmin: [".tcx", ".xml", ".csv", ".fit"], apple: [".xml"], whoop: [".csv", ".txt"] } as const;

const provider = (inputs: SetupInputs, id: string) => inputs.providers?.find(p => p.id === id) ?? null;
const sourceCount = (inputs: SetupInputs, sources: string[]): { count: number | null; latestAt: string | null } => {
  if (!inputs.stored) return { count: null, latestAt: null };
  const rows = inputs.stored.filter(r => r.source && sources.includes(r.source.toLowerCase()));
  const latest = rows.map(r => r.latestAt).filter((v): v is string => !!v).sort().pop() ?? null;
  return { count: rows.reduce((sum, r) => sum + (Number.isFinite(r.count) ? r.count : 0), 0), latestAt: latest };
};

function oauthAuthorization(p: ProviderInput | null, providersLoaded: boolean): AuthorizationStatus {
  if (!providersLoaded) return "unknown";
  if (!p || p.configured === false || !(p.connectUrl || p.method === "oauth")) return "unavailable";
  if (p.status === "connected") return "authorized";
  if (p.status === "error") return RECONNECT.test(p.lastError || "") ? "needs_attention" : "authorized";
  if (p.status === "disconnected" || !p.status) return "not_authorized";
  return "needs_attention";
}

function importStatus(auth: AuthorizationStatus, p: ProviderInput | null, stored: { count: number | null }, now: number, storedLoaded: boolean): ImportStatus {
  if (p?.status === "error") return "failed";
  if (stored.count !== null && stored.count > 0) {
    const last = p?.lastSyncAt ? Date.parse(p.lastSyncAt) : NaN;
    return auth === "authorized" && Number.isFinite(last) && now - last > STALE_MS ? "stale" : "records_stored";
  }
  if (!storedLoaded) return p?.lastSyncAt ? "records_stored" : "unknown";
  return "no_records";
}

function oauthImportRow(inputs: SetupInputs, id: string, name: string, sources: string[], opts: { stravaRestricted?: boolean; conditional?: boolean } = {}): SetupRow {
  const p = provider(inputs, id);
  const loaded = inputs.providers !== null;
  const auth = oauthAuthorization(p, loaded);
  const stored = sourceCount(inputs, sources);
  return {
    id, section: "import", name, authorization: auth,
    import: auth === "unknown" ? "unknown" : importStatus(auth, p, stored, inputs.now, inputs.stored != null),
    publication: "not_applicable", deviceDelivery: "not_applicable",
    storedCount: stored.count, latestRecordAt: stored.latestAt, lastSuccessfulSyncAt: p?.lastSyncAt ?? null, lastError: p?.lastError ?? null,
    stravaRestricted: !!opts.stravaRestricted, conditional: !!opts.conditional,
    action: auth === "unavailable" || auth === "unknown" ? { kind: "none" }
      : { kind: "connect", href: p?.connectUrl || `/api/connectors/${id}/authorize`, reconnect: auth === "authorized" || auth === "needs_attention" },
    copyKey: id,
  };
}

function fileImportRow(inputs: SetupInputs, id: string, name: string, sources: string[], accepts: readonly string[], copyKey = id): SetupRow {
  const stored = sourceCount(inputs, sources);
  return {
    id, section: "import", name, authorization: "not_required",
    import: inputs.stored == null ? "unknown" : (stored.count ?? 0) > 0 ? "records_stored" : "no_records",
    publication: "not_applicable", deviceDelivery: "not_applicable",
    storedCount: stored.count, latestRecordAt: stored.latestAt, lastSuccessfulSyncAt: null, lastError: null,
    stravaRestricted: false, conditional: false, action: { kind: "file", provider: id, accepts: [...accepts] }, copyKey,
  };
}

export function buildSetupPaths(inputs: SetupInputs): { import: SetupRow[]; receive: SetupRow[]; canFinishWithoutAnyConnection: true } {
  const intervalsOn = inputs.capabilities?.intervalsConnector === true;
  const importRows: SetupRow[] = [
    oauthImportRow(inputs, "strava", "Strava", ["strava"], { stravaRestricted: true }),
    ...(intervalsOn ? [oauthImportRow(inputs, "intervals", "Intervals.icu", ["intervals"], { conditional: true })] : []),
    fileImportRow(inputs, "garmin", "Garmin Connect (file)", ["garmin", "tcx"], IMPORT_FILE_FORMATS.garmin),
    // COROS has no authorized direct integration here (see docs/strava-and-provider-limits.md). Its TCX export
    // goes through the same file importer; nothing else is claimed.
    fileImportRow(inputs, "coros", "COROS (file)", ["coros"], IMPORT_FILE_FORMATS.garmin),
    fileImportRow(inputs, "apple", "Apple Health (file)", ["apple", "apple_health"], IMPORT_FILE_FORMATS.apple),
    provider(inputs, "whoop")?.method === "upload"
      ? { ...fileImportRow(inputs, "whoop", "WHOOP (file)", [], IMPORT_FILE_FORMATS.whoop), copyKey: "whoop" }
      : oauthImportRow(inputs, "whoop", "WHOOP", ["whoop"]),
    oauthImportRow(inputs, "oura", "Oura", ["oura"]),
    oauthImportRow(inputs, "google_cal", "Google Calendar", []),
  ];
  // Calendar and recovery providers import busy time / recovery metrics, not completed activities: a count of
  // stored activities would be a different thing, so it is never shown for them.
  for (const row of importRows) if (["whoop", "oura", "google_cal"].includes(row.id)) { row.storedCount = null; row.latestRecordAt = null; row.import = row.authorization === "unknown" ? "unknown" : row.import === "failed" ? "failed" : row.lastSuccessfulSyncAt ? "records_stored" : "unknown"; }

  const gcal = provider(inputs, "google_cal");
  const gcalAuth = oauthAuthorization(gcal, inputs.providers !== null);
  const interOn = intervalsOn;
  const interProvider = provider(inputs, "intervals");
  const interAuth = interOn ? oauthAuthorization(interProvider, inputs.providers !== null) : "unavailable";
  const interPublish: PublicationStatus = !interOn ? "unavailable" : interAuth === "unknown" ? "unknown"
    : interAuth !== "authorized" ? "unavailable"
      : inputs.intervalsPublish == null ? "unknown" : !inputs.intervalsPublish.available ? "unavailable" : "ready";
  const base = { stravaRestricted: false, storedCount: null, latestRecordAt: null, lastSuccessfulSyncAt: null, lastError: null, import: "not_applicable" as ImportStatus };
  const email = inputs.email, tg = inputs.telegram;
  const receiveRows: SetupRow[] = [
    { ...base, id: "today", section: "receive", name: "JMM Today", authorization: "not_required", publication: "ready", deviceDelivery: "not_applicable", conditional: false, action: { kind: "link", href: "/today" }, copyKey: "today" },
    { ...base, id: "fit", section: "receive", name: "FIT file download", authorization: "not_required", publication: "not_applicable", deviceDelivery: "manual_file", conditional: false, action: { kind: "link", href: "/today" }, copyKey: "fit" },
    { ...base, id: "email", section: "receive", name: "Email", conditional: false, action: { kind: "link", href: "/workout-email/settings" }, copyKey: "email", deviceDelivery: "not_applicable",
      authorization: email == null ? "unknown" : !email.configured ? "unavailable" : email.verified ? "authorized" : "not_authorized",
      publication: email == null ? "unknown" : !email.configured ? "unavailable" : email.verified && email.enabled ? "ready" : "off" },
    { ...base, id: "telegram", section: "receive", name: "Telegram", conditional: false, action: { kind: "link", href: "/reminders" }, copyKey: "telegram", deviceDelivery: "not_applicable",
      authorization: tg == null ? "unknown" : !tg.configured ? "unavailable" : tg.paired ? "authorized" : "not_authorized",
      publication: tg == null ? "unknown" : !tg.configured ? "unavailable" : tg.paired && tg.optedIn ? "ready" : "off" },
    { ...base, id: "google_cal_events", section: "receive", name: "Google Calendar events", conditional: false, copyKey: "google_cal_events", deviceDelivery: "not_applicable",
      authorization: gcalAuth, publication: gcalAuth === "authorized" ? "ready" : gcalAuth === "unknown" ? "unknown" : "unavailable",
      action: gcalAuth === "authorized" || gcalAuth === "unavailable" || gcalAuth === "unknown" ? { kind: "none" } : { kind: "connect", href: gcal?.connectUrl || "/api/connectors/google-cal/authorize", reconnect: false } },
    ...(intervalsOn ? [{ ...base, id: "intervals_garmin", section: "receive" as const, name: "Garmin via Intervals.icu", conditional: true, copyKey: "intervals_garmin",
      authorization: interAuth, publication: interPublish, deviceDelivery: "unverified" as const,
      action: interAuth === "authorized" ? { kind: "none" as const } : interAuth === "unknown" || interAuth === "unavailable" ? { kind: "none" as const } : { kind: "connect" as const, href: interProvider?.connectUrl || "/api/connectors/intervals/authorize", reconnect: false } }] : []),
    // Direct watch publishing is not available. These rows exist so the athlete is not left guessing.
    { ...base, id: "garmin_direct", section: "receive", name: "Garmin direct", authorization: "unavailable", publication: "unavailable", deviceDelivery: "not_applicable", conditional: false, action: { kind: "none" }, copyKey: "garmin_direct" },
    { ...base, id: "coros_direct", section: "receive", name: "COROS direct", authorization: "unavailable", publication: "unavailable", deviceDelivery: "not_applicable", conditional: false, action: { kind: "none" }, copyKey: "coros_direct" },
  ];
  return { import: importRows, receive: receiveRows, canFinishWithoutAnyConnection: true };
}

// ---------------------------------------------------------------------------------------------------
// Copy. Statuses are describable; claims about devices are not. Tests scan every string for banned claims.
// ---------------------------------------------------------------------------------------------------
type Dict = Record<Lang, string>;
const D = (en: string, es: string): Dict => ({ en, es });

export const SECTION_COPY: Record<SectionId, { title: Dict; intro: Dict }> = {
  import: { title: D("Import my training", "Importar mi entrenamiento"),
    intro: D("Bring your past and recent activities into JMM. Each source is optional and you authorize only your own accounts. Importing does not fill in zones, weight or anything the source did not send.",
      "Trae tus actividades pasadas y recientes a JMM. Cada fuente es opcional y solo autorizas tus propias cuentas. Importar no rellena zonas, peso ni nada que la fuente no haya enviado.") },
  receive: { title: D("Receive my plan", "Recibir mi plan"),
    intro: D("Choose where your approved workout goes. This is separate from importing. Publishing a workout somewhere is not the same as it reaching your watch.",
      "Elige dónde va tu entrenamiento aprobado. Es independiente de importar. Publicar un entrenamiento en algún sitio no es lo mismo que llegar a tu reloj.") },
};
export const DIMENSION_LABEL: Record<"authorization" | "import" | "publication" | "deviceDelivery", Dict> = {
  authorization: D("Authorization", "Autorización"), import: D("Import", "Importación"),
  publication: D("Publication", "Publicación"), deviceDelivery: D("Device delivery", "Entrega al dispositivo"),
};
export const STATUS_LABEL = {
  authorization: {
    not_required: D("Not required", "No necesaria"), unavailable: D("Not available here", "No disponible aquí"), not_authorized: D("Not authorized", "Sin autorizar"),
    authorized: D("Authorized", "Autorizada"), needs_attention: D("Reconnect needed", "Reconectar"), unknown: D("Unknown — could not load", "Desconocida — no se pudo cargar"),
  },
  import: {
    not_applicable: D("Not applicable", "No aplica"), no_records: D("No stored records yet", "Aún sin registros guardados"), records_stored: D("Records stored", "Registros guardados"),
    stale: D("Authorized, no recent sync", "Autorizada, sin sincronización reciente"), failed: D("Last import failed", "Falló la última importación"), unknown: D("Unknown", "Desconocida"),
  },
  publication: {
    not_applicable: D("Not applicable", "No aplica"), unavailable: D("Not available", "No disponible"), off: D("Off", "Desactivada"), ready: D("Ready", "Lista"), unknown: D("Unknown", "Desconocida"),
  },
  deviceDelivery: {
    not_applicable: D("Not applicable", "No aplica"), unverified: D("Not confirmed by the device", "Sin confirmar por el dispositivo"), manual_file: D("Manual: you load the file", "Manual: tú cargas el archivo"),
  },
} as const;

export function statusLabel(dimension: keyof typeof STATUS_LABEL, status: string, lang: Lang): string {
  const table = STATUS_LABEL[dimension] as Record<string, Dict>;
  return (table[status] ?? D("Unknown", "Desconocida"))[lang];
}

export const ROW_COPY: Record<string, { what: Dict; limit: Dict }> = {
  strava: { what: D("Imports completed activities from your own Strava account.", "Importa actividades completadas de tu propia cuenta de Strava."),
    limit: D(`${STRAVA_AI_NOTICE.en} Strava does not deliver planned workouts to a watch through JMM.`, `${STRAVA_AI_NOTICE.es} Strava no entrega entrenamientos planificados al reloj a través de JMM.`) },
  intervals: { what: D("Optional. Imports permitted activities and wellness from your own Intervals.icu account.", "Opcional. Importa actividades y bienestar permitidos de tu propia cuenta de Intervals.icu."),
    limit: D("Only available when enabled for this release. Activities that came from Strava, or whose origin is unknown, are not imported.", "Solo disponible si está habilitada en esta versión. No se importan actividades de origen Strava ni de origen desconocido.") },
  garmin: { what: D("Manual import of a Garmin Connect export: .tcx or .fit for one activity, Activities.csv (English column names) for several.", "Importación manual de una exportación de Garmin Connect: .tcx o .fit para una actividad, Activities.csv (columnas en inglés) para varias."),
    limit: D("Manual only: JMM is not connected to Garmin Connect. ZIP archives are not accepted. A file contains only the activities in that export; activity types JMM cannot use (for example strength or walking) are listed, not imported.", "Solo manual: JMM no está conectado a Garmin Connect. No se aceptan archivos ZIP. Un archivo contiene solo las actividades de esa exportación; los tipos de actividad que JMM no puede usar (por ejemplo fuerza o caminata) se indican, no se importan.") },
  coros: { what: D("Manual import of a COROS activity exported as TCX or FIT.", "Importación manual de una actividad de COROS exportada como TCX o FIT."),
    limit: D("Manual only. There is no authorized direct COROS connection in JMM yet.", "Solo manual. Todavía no hay una conexión directa autorizada con COROS en JMM.") },
  apple: { what: D("Manual import of the export.xml from an Apple Health export.", "Importación manual del export.xml de una exportación de Apple Salud."),
    limit: D("File values are not independently verified measurements.", "Los valores de un archivo no son mediciones verificadas de forma independiente.") },
  whoop: { what: D("Recovery, HRV and sleep from your own WHOOP account, or from a CSV you upload.", "Recuperación, VFC y sueño de tu propia cuenta WHOOP, o de un CSV que subas."),
    limit: D("Recovery data only; it does not include planned workouts.", "Solo datos de recuperación; no incluye entrenamientos planificados.") },
  oura: { what: D("Sleep, readiness and HRV from your own Oura account.", "Sueño, preparación y VFC de tu propia cuenta Oura."),
    limit: D("Only when the connection is available here; otherwise log sleep manually.", "Solo si la conexión está disponible aquí; si no, registra el sueño manualmente.") },
  google_cal: { what: D("Busy time from your own Google Calendar so plans fit around it.", "Horas ocupadas de tu propio Google Calendar para adaptar los planes."),
    limit: D("Calendar entries are not training records.", "Los eventos del calendario no son registros de entrenamiento.") },
  today: { what: D("Your approved workout, always available inside JMM.", "Tu entrenamiento aprobado, siempre disponible dentro de JMM."),
    limit: D("Review and approve the current version before using it elsewhere.", "Revisa y aprueba la versión actual antes de usarla en otro sitio.") },
  fit: { what: D("Download the approved workout as a FIT file and load it onto your device yourself.", "Descarga el entrenamiento aprobado como archivo FIT y cárgalo tú en tu dispositivo."),
    limit: D("A download is not delivery: JMM cannot see whether the file reached your watch.", "Una descarga no es una entrega: JMM no puede ver si el archivo llegó a tu reloj.") },
  email: { what: D("Your approved workout by email to your verified address, only if you opt in.", "Tu entrenamiento aprobado por correo a tu dirección verificada, solo si lo activas."),
    limit: D("Mail accepted by the mail server is not proof that you read it.", "Que el servidor acepte el correo no prueba que lo hayas leído.") },
  telegram: { what: D("Your approved workout in a private Telegram chat you pair yourself, only if you opt in.", "Tu entrenamiento aprobado en un chat privado de Telegram que emparejas tú, solo si lo activas."),
    limit: D("A bot receipt is not proof that you read the message.", "Que el bot reciba el mensaje no prueba que lo hayas leído.") },
  google_cal_events: { what: D("Planned workouts as events on your own Google Calendar.", "Entrenamientos planificados como eventos en tu propio Google Calendar."),
    limit: D("Calendar events are reminders, not structured watch workouts.", "Los eventos de calendario son recordatorios, no entrenamientos estructurados para el reloj.") },
  intervals_garmin: { what: D("Optional. Publishes approved run and bike workouts to your own Intervals.icu account, which can forward them to Garmin Connect if you set that up there.", "Opcional. Publica entrenamientos aprobados de carrera y bicicleta en tu propia cuenta de Intervals.icu, que puede reenviarlos a Garmin Connect si lo configuras allí."),
    limit: D("Intervals.icu accepting a workout does not confirm Garmin Connect or your watch received it. Check your watch before starting.", "Que Intervals.icu acepte un entrenamiento no confirma que Garmin Connect ni tu reloj lo hayan recibido. Comprueba tu reloj antes de empezar.") },
  garmin_direct: { what: D("Direct publishing from JMM to Garmin Connect.", "Publicación directa de JMM en Garmin Connect."),
    limit: D("Not available: JMM has no Garmin publishing approval. Use the FIT download, or Intervals.icu when it is enabled.", "No disponible: JMM no tiene aprobación de Garmin para publicar. Usa la descarga FIT, o Intervals.icu cuando esté habilitada.") },
  coros_direct: { what: D("Direct publishing from JMM to COROS.", "Publicación directa de JMM en COROS."),
    limit: D("Not available: it needs COROS partner approval that JMM does not have. Use the FIT download.", "No disponible: requiere una aprobación de socio de COROS que JMM no tiene. Usa la descarga FIT.") },
};

export function rowCopy(row: Pick<SetupRow, "copyKey">, lang: Lang): { what: string; limit: string } {
  const copy = ROW_COPY[row.copyKey];
  return copy ? { what: copy.what[lang], limit: copy.limit[lang] } : { what: "", limit: "" };
}

/** "—" for an unknown number; a real 0 stays "0". */
export function formatCount(value: number | null): string { return value === null ? "—" : String(value); }

// ---------------------------------------------------------------------------------------------------
// Adapters: raw endpoint payloads → model inputs. Anything malformed becomes null (unknown), never a default.
// ---------------------------------------------------------------------------------------------------
const rec = (value: unknown): Record<string, unknown> | null => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null);

/** GET /api/workout-email/preferences */
export function mapEmailPreferences(payload: unknown): SetupInputs["email"] {
  const body = rec(payload); if (!body || typeof body.configured !== "boolean") return null;
  if (!body.configured) return { configured: false, verified: false, enabled: false };
  const pref = rec(body.preference); if (!pref) return null;
  return { configured: true, verified: pref.verified === true, enabled: pref.enabled === true };
}
/** GET /api/coaching/preferences. "Opted in" means unpaused with the daily-plan purpose granted under a consent version. */
export function mapTelegramPreferences(payload: unknown): SetupInputs["telegram"] {
  const body = rec(payload); if (!body || typeof body.externalDeliveryEnabled !== "boolean") return null;
  if (!body.externalDeliveryEnabled) return { configured: false, paired: false, optedIn: false };
  const pref = rec(body.preferences); if (!pref) return null;
  const paired = typeof pref.verifiedChatId === "string" && pref.verifiedChatId.length > 0 && pref.verificationTransport === "telegram";
  return { configured: true, paired, optedIn: paired && pref.paused === false && pref.dailyPlan === true && typeof pref.consentVersion === "string" && pref.consentVersion.length > 0 };
}
/** GET /api/connectors/intervals/preferences */
export function mapIntervalsPreferences(payload: unknown): SetupInputs["intervalsPublish"] {
  const body = rec(payload); if (!body || typeof body.enabled !== "boolean" || typeof body.available !== "boolean") return null;
  return { enabled: body.enabled, available: body.available };
}
/** GET /api/onboard/import-review → history.bySource */
export function mapStoredCounts(payload: unknown): SourceCount[] | null {
  const history = rec(rec(payload)?.history); const list = history?.bySource;
  if (!Array.isArray(list)) return null;
  const out: SourceCount[] = [];
  for (const item of list) {
    const row = rec(item); if (!row || typeof row.count !== "number" || !Number.isFinite(row.count) || row.count < 0) return null;
    out.push({ source: typeof row.source === "string" ? row.source : null, count: row.count, latestAt: typeof row.latestAt === "string" ? row.latestAt : null });
  }
  return out;
}
