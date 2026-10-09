import { randomBytes } from "crypto";
import { COROS_OAUTH_ISSUERS, CorosOAuthError, corosOAuthConfig, corosOAuthConfigured, type CorosIssuer } from "./coros-oauth-config";
import { corosAuthorizationUrl, corosDigest, corosScopesAllow, corosTokenValid, safeEqual, type CorosGrant, type CorosOAuthProtocol } from "./coros-oauth-protocol";

export type CorosConnection = {
  id: string; userId: string; status: string; tokenEnc: string | null; refreshEnc: string | null;
  expiresAt: Date | null; scope: string | null; externalRef: string | null; lastError: string | null;
};
export type CorosConnectionPatch = Partial<Omit<CorosConnection, "id" | "userId">>;
export type CorosTransaction = { state: string; userId: string; returnUrl: string | null; expiresAt: Date; usedAt: Date | null };
export interface CorosOAuthStore {
  get(userId: string): Promise<CorosConnection | null>;
  begin(userId: string, pendingEnc: string, transaction: CorosTransaction): Promise<void>;
  transaction(state: string): Promise<CorosTransaction | null>;
  consume(state: string, userId: string, now: Date): Promise<boolean>;
  /** Atomically compare user, id, status, encrypted access+refresh snapshots; false loses ownership. */
  replace(expected: CorosConnection, patch: CorosConnectionPatch, uniqueIdentity?: boolean, invalidateTransactionsAt?: Date): Promise<boolean>;
}
type Pending = { version: 1; kind: "pending"; state: string; verifier: string; nonce: string; browserHash: string; issuer: CorosIssuer; clientId: string; redirectUri: string; pendingEnc: string };
type Credential = { version: 1; kind: "grant"; issuer: CorosIssuer; clientId: string; accessToken: string; subject: string | null };
const busyStatuses = new Set(["exchanging", "refreshing", "disconnecting"]);
export const COROS_MANUAL_REVOCATION_MESSAGE = "An earlier COROS authorization has not been confirmed revoked. Remove this application's authorization in COROS to revoke provider access.";
const MANUAL_REVOCATION = COROS_MANUAL_REVOCATION_MESSAGE;
const RECONNECT = "COROS authorization could not be verified. Disconnect, then connect again.";
const REVOKE_RETRY = "JMM access is stopped. Provider revocation was not confirmed. Retry disconnecting or remove authorization in COROS.";
const BUSY = "A COROS authorization change is in progress. Wait briefly or disconnect to cancel local access.";
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const random = () => randomBytes(32).toString("base64url");
function failState(): never { throw new CorosOAuthError("invalid_state", "This COROS authorization expired or does not belong to this signed-in browser. Disconnect and try again."); }
function changed(): never { throw new CorosOAuthError("connection_changed", "The COROS connection changed. Refresh the page and try again.", 409); }

/** All provider/database boundaries are injected for offline race and tenant tests. */
export function createCorosOAuthService(deps: {
  store: CorosOAuthStore; protocol: CorosOAuthProtocol;
  encrypt: (value: string) => string; decrypt: (value: string | null) => string;
  env?: Record<string, string | undefined>; now?: () => Date;
}) {
  const now = deps.now || (() => new Date());
  const env = deps.env || process.env;
  const { store, protocol } = deps;
  function seal(value: unknown): string {
    const encrypted = deps.encrypt(typeof value === "string" ? value : JSON.stringify(value));
    if (!encrypted.startsWith("enc:v1:")) throw new CorosOAuthError("encryption_unavailable", "Encrypted COROS storage is unavailable.", 503);
    return encrypted;
  }
  function open(value: string | null): unknown {
    if (!value?.startsWith("enc:v1:")) throw new CorosOAuthError("reconnect_required", RECONNECT, 409);
    try { return JSON.parse(deps.decrypt(value)); }
    catch { throw new CorosOAuthError("reconnect_required", RECONNECT, 409); }
  }
  function credential(row: CorosConnection): Credential {
    const parsed = open(row.tokenEnc);
    if (!object(parsed) || parsed.version !== 1 || parsed.kind !== "grant" || !COROS_OAUTH_ISSUERS.includes(parsed.issuer as CorosIssuer) ||
        typeof parsed.clientId !== "string" || !/^[A-Za-z0-9._~-]{1,256}$/.test(parsed.clientId) || !corosTokenValid(parsed.accessToken) ||
        !(parsed.subject === null || (typeof parsed.subject === "string" && parsed.subject.length > 0 && parsed.subject.length <= 255))) throw new CorosOAuthError("reconnect_required", RECONNECT, 409);
    return parsed as Credential;
  }
  function grant(row: CorosConnection, auth: Credential): CorosGrant {
    const refreshToken = row.refreshEnc?.startsWith("enc:v1:") ? deps.decrypt(row.refreshEnc) : "";
    if (!corosTokenValid(refreshToken) || !row.expiresAt || !row.scope || !corosScopesAllow(row.scope)) throw new CorosOAuthError("reconnect_required", RECONNECT, 409);
    return { accessToken: auth.accessToken, refreshToken, scope: row.scope, expiresAt: row.expiresAt };
  }
  async function replace(row: CorosConnection, patch: CorosConnectionPatch, uniqueIdentity = false, invalidateTransactionsAt?: Date): Promise<CorosConnection> {
    if (row.lastError?.includes(MANUAL_REVOCATION) && "lastError" in patch && !patch.lastError?.includes(MANUAL_REVOCATION)) {
      patch = { ...patch, lastError: patch.lastError ? `${patch.lastError} ${MANUAL_REVOCATION}` : MANUAL_REVOCATION };
    }
    if (!await store.replace(row, patch, uniqueIdentity, invalidateTransactionsAt)) changed();
    return { ...row, ...patch };
  }
  async function begin(userId: string) {
    const cfg = corosOAuthConfig(env);
    const metadata = await protocol.discover(cfg.issuer);
    const state = random(), browserBinding = random(), verifier = random(), nonce = random();
    const pendingEnc = seal({ version: 1, kind: "pending", state });
    const pending: Pending = { version: 1, kind: "pending", state, verifier, nonce, browserHash: corosDigest(browserBinding), issuer: cfg.issuer, clientId: cfg.clientId, redirectUri: cfg.redirectUri, pendingEnc };
    const expiresAt = new Date(now().getTime() + 10 * 60_000);
    await store.begin(userId, pendingEnc, { state, userId, returnUrl: seal(pending), expiresAt, usedAt: null });
    return { authorizationUrl: corosAuthorizationUrl(cfg, metadata, pending), browserBinding, expiresAt };
  }
  async function complete(userId: string, params: URLSearchParams, browserBinding: string | undefined) {
    const cfg = corosOAuthConfig(env);
    const state = params.get("state");
    if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || !browserBinding || !/^[A-Za-z0-9_-]{43}$/.test(browserBinding) ||
        ["state", "code", "error", "iss"].some(name => params.getAll(name).length > 1)) failState();
    const txn = await store.transaction(state);
    if (!txn || txn.userId !== userId || txn.usedAt || txn.expiresAt <= now()) failState();
    let parsed: unknown;
    try { parsed = open(txn.returnUrl); } catch { failState(); }
    if (!object(parsed) || parsed.version !== 1 || parsed.kind !== "pending" || parsed.state !== state || parsed.issuer !== cfg.issuer ||
        parsed.clientId !== cfg.clientId || parsed.redirectUri !== cfg.redirectUri || typeof parsed.browserHash !== "string" ||
        !safeEqual(parsed.browserHash, corosDigest(browserBinding)) || typeof parsed.verifier !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(parsed.verifier) ||
        typeof parsed.nonce !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(parsed.nonce) || typeof parsed.pendingEnc !== "string") failState();
    const pending = parsed as Pending;
    if (params.has("iss") && params.get("iss") !== cfg.issuer) failState();
    if (!await store.consume(state, userId, now())) failState();
    let row = await store.get(userId);
    if (!row || row.status !== "authorizing" || row.tokenEnc !== pending.pendingEnc) changed();
    if (params.has("error") || !params.get("code")) {
      await replace(row, { status: "disconnected", tokenEnc: null, lastError: null });
      throw new CorosOAuthError("authorization_declined", "COROS authorization was not completed.");
    }
    const code = params.get("code")!;
    if (code.length > 4096 || /[\u0000-\u0020\u007f]/.test(code)) failState();
    row = await replace(row, { status: "exchanging" });
    try {
      const metadata = await protocol.discover(cfg.issuer);
      const token = await protocol.tokens(metadata, { grant_type: "authorization_code", client_id: cfg.clientId, code, redirect_uri: cfg.redirectUri, code_verifier: pending.verifier });
      const auth: Credential = { version: 1, kind: "grant", issuer: cfg.issuer, clientId: cfg.clientId, accessToken: token.accessToken, subject: null };
      // Save newly issued credentials before identity validation so a failed check
      // can still be disconnected. They cannot be used while status is exchanging.
      row = await replace(row, { tokenEnc: seal(auth), refreshEnc: seal(token.refreshToken), expiresAt: token.expiresAt, scope: token.scope });
      const subject = await protocol.identity(metadata, cfg, token, { nonce: pending.nonce });
      row = await replace(row, { tokenEnc: seal({ ...auth, subject }), externalRef: `coros:v1:${corosDigest(`${cfg.issuer}\n${subject}`)}`, status: "authorized", lastError: null }, true);
      return { ok: true as const, connectionStatus: row.status };
    } catch (error) {
      await store.replace(row, { status: "reconnect_required", lastError: row.lastError?.includes(MANUAL_REVOCATION) ? `${RECONNECT} ${MANUAL_REVOCATION}` : RECONNECT });
      if (error instanceof CorosOAuthError) throw error;
      throw new CorosOAuthError("connection_failed", RECONNECT, 502);
    }
  }
  async function refresh(userId: string) {
    const cfg = corosOAuthConfig(env);
    let row = await store.get(userId);
    if (!row || row.status !== "authorized") throw new CorosOAuthError("reconnect_required", row && busyStatuses.has(row.status) ? BUSY : RECONNECT, 409);
    const auth = credential(row), previous = grant(row, auth);
    if (!auth.subject || auth.issuer !== cfg.issuer || auth.clientId !== cfg.clientId) throw new CorosOAuthError("reconnect_required", RECONNECT, 409);
    row = await replace(row, { status: "refreshing", lastError: null });
    try {
      const metadata = await protocol.discover(auth.issuer);
      const token = await protocol.tokens(metadata, { grant_type: "refresh_token", client_id: auth.clientId, refresh_token: previous.refreshToken }, previous);
      row = await replace(row, { tokenEnc: seal({ ...auth, accessToken: token.accessToken }), refreshEnc: seal(token.refreshToken), expiresAt: token.expiresAt, scope: token.scope });
      await protocol.identity(metadata, cfg, token, { subject: auth.subject });
      row = await replace(row, { status: "authorized", lastError: null });
      return { ok: true as const, connectionStatus: row.status };
    } catch (error) {
      // Never blindly retry a refresh POST: refresh tokens can rotate even when
      // a response is lost. Preserve a stopped connection for explicit recovery.
      await store.replace(row, { status: "reconnect_required", lastError: row.lastError?.includes(MANUAL_REVOCATION) ? `${RECONNECT} ${MANUAL_REVOCATION}` : RECONNECT });
      if (error instanceof CorosOAuthError) throw error;
      throw new CorosOAuthError("refresh_failed", RECONNECT, 502);
    }
  }
  async function disconnect(userId: string) {
    let row = await store.get(userId);
    if (!row) return { ok: true as const, remoteRevoked: false, localAccessStopped: true, requiresProviderRevocation: false };
    if (busyStatuses.has(row.status)) {
      // Explicit local disconnect may cancel an interrupted or in-flight exchange.
      // Its result is uncertain at COROS. Erasing the exact snapshot prevents a
      // late worker from resurrecting it; retain the manual-revocation marker.
      await replace(row, { status: "revocation_required", tokenEnc: null, refreshEnc: null, expiresAt: null, scope: null, externalRef: null, lastError: MANUAL_REVOCATION }, false, now());
      return { ok: true as const, remoteRevoked: false, localAccessStopped: true, requiresProviderRevocation: true };
    }
    if (!row.tokenEnc) return { ok: true as const, remoteRevoked: false, localAccessStopped: true, requiresProviderRevocation: row.status === "revocation_required" || !!row.lastError?.includes(MANUAL_REVOCATION) };
    const onlyPendingAuthorization = row.status === "authorizing";
    row = await replace(row, { status: "disconnecting", lastError: null }, false, now());
    let auth: Credential | null = null;
    try { auth = credential(row); } catch { /* Pending or unreadable credentials cannot be sent to COROS. */ }
    let remoteRevoked = false;
    const pendingOnly = (() => { try { const value = open(row.tokenEnc); return onlyPendingAuthorization && object(value) && value.kind === "pending"; } catch { return false; } })();
    try {
      if (auth) {
        const token = grant(row, auth);
        const metadata = await protocol.discover(auth.issuer);
        remoteRevoked = await protocol.revoke(metadata, auth.clientId, token);
      }
    } catch {
      await store.replace(row, { status: "revocation_pending", lastError: row.lastError?.includes(MANUAL_REVOCATION) ? `${REVOKE_RETRY} ${MANUAL_REVOCATION}` : REVOKE_RETRY });
      throw new CorosOAuthError("revocation_failed", REVOKE_RETRY, 502);
    }
    const requiresProviderRevocation = (!remoteRevoked && !pendingOnly) || !!row.lastError?.includes(MANUAL_REVOCATION);
    await replace(row, { status: requiresProviderRevocation ? "revocation_required" : "disconnected", tokenEnc: null, refreshEnc: null,
      expiresAt: null, scope: null, externalRef: null, lastError: requiresProviderRevocation ? MANUAL_REVOCATION : null });
    return { ok: true as const, remoteRevoked, localAccessStopped: true, requiresProviderRevocation };
  }
  async function status(userId: string) {
    const row = await store.get(userId);
    const known = new Set(["disconnected", "authorizing", "exchanging", "authorized", "refreshing", "reconnect_required", "disconnecting", "revocation_pending", "revocation_required"]);
    const connectionStatus = row && known.has(row.status) ? row.status : "disconnected";
    const requiresProviderRevocation = ["revocation_required", "revocation_pending"].includes(connectionStatus) || !!row?.lastError?.includes(MANUAL_REVOCATION);
    let reconnectRequired = connectionStatus === "reconnect_required";
    let localAccessStopped = true;
    if (row && connectionStatus === "authorized" && corosOAuthConfigured(env)) {
      try {
        const cfg = corosOAuthConfig(env), auth = credential(row); grant(row, auth);
        const bound = !!auth.subject && auth.issuer === cfg.issuer && auth.clientId === cfg.clientId;
        reconnectRequired = !bound;
        localAccessStopped = !bound || !row.expiresAt || row.expiresAt.getTime() <= now().getTime() + 60_000;
      } catch { reconnectRequired = true; }
    }
    return { connectionStatus, reconnectRequired, localAccessStopped,
      requiresProviderRevocation, lastError: connectionStatus === "revocation_pending" ? REVOKE_RETRY : reconnectRequired ? `${RECONNECT}${requiresProviderRevocation ? ` ${MANUAL_REVOCATION}` : ""}` : requiresProviderRevocation ? MANUAL_REVOCATION : null };
  }
  /** Internal only: caller must authenticate and establish userId before calling. */
  async function authorization(userId: string) {
    const cfg = corosOAuthConfig(env);
    let row = await store.get(userId);
    if (!row || row.status !== "authorized") throw new CorosOAuthError("reconnect_required", RECONNECT, 409);
    if (!row.expiresAt || row.expiresAt.getTime() <= now().getTime() + 60_000) { await refresh(userId); row = await store.get(userId); }
    if (!row || row.status !== "authorized") changed();
    const auth = credential(row); grant(row, auth);
    if (!auth.subject || auth.issuer !== cfg.issuer || auth.clientId !== cfg.clientId) throw new CorosOAuthError("reconnect_required", RECONNECT, 409);
    return { authorization: `Bearer ${auth.accessToken}`, accessToken: auth.accessToken, issuer: auth.issuer, region: auth.issuer === "https://mcpus.coros.com" ? "us" as const : auth.issuer === "https://mcpeu.coros.com" ? "eu" as const : "cn" as const };
  }
  return { begin, complete, refresh, disconnect, status, authorization };
}
