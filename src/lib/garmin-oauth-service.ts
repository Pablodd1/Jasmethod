import { randomBytes } from "node:crypto";
import { GarminError, garminConfig, garminCredentials, garminConfigured, type GarminEnvironment } from "./garmin-config";
import { garminAuthorizationUrl, garminDigest, garminEqual, type GarminPermission, type GarminProtocol, type GarminToken } from "./garmin-protocol";

export type GarminConnection = { id: string; userId: string; status: string; tokenEnc: string | null; refreshEnc: string | null; expiresAt: Date | null; externalRef: string | null; scope: string | null; lastError: string | null; syncStartedAt?: Date | null };
export type GarminPatch = Partial<Omit<GarminConnection, "id" | "userId">>;
export type GarminTransaction = { state: string; userId: string; returnUrl: string | null; expiresAt: Date; usedAt: Date | null };
export interface GarminStore {
  get(userId: string): Promise<GarminConnection | null>;
  begin(userId: string, marker: string, txn: GarminTransaction): Promise<void>;
  transaction(state: string): Promise<GarminTransaction | null>;
  consume(state: string, userId: string, now: Date): Promise<boolean>;
  replace(expected: GarminConnection, patch: GarminPatch, uniqueIdentity?: boolean, invalidateAt?: Date): Promise<boolean>;
}
type Grant = { version: 1; kind: "grant"; clientId: string; accessToken: string; subject: string | null };
type Pending = { version: 1; kind: "pending"; state: string; verifier: string; browserHash: string; clientId: string; redirectUri: string; marker: string };
type Refresh = { version: 1; refreshToken: string; expiresAt: number };
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const validRandom = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
const changed = () => { throw new GarminError("connection_changed", "The Garmin connection changed. Refresh before trying again.", 409); };
const invalid = () => { throw new GarminError("invalid_state", "This Garmin authorization expired or belongs to a different session. Start again."); };
const busyStatuses = new Set(["exchanging", "refreshing", "disconnecting"]);

export function createGarminOAuthService(deps: { store: GarminStore; protocol: GarminProtocol; encrypt: (text: string) => string; decrypt: (text: string) => string; env?: GarminEnvironment; now?: () => Date }) {
  const { store, protocol } = deps, env = deps.env ?? process.env, now = deps.now ?? (() => new Date());
  const seal = (value: unknown) => {
    const result = deps.encrypt(JSON.stringify(value));
    if (!result.startsWith("enc:v1:")) throw new GarminError("encryption_required", "Encrypted Garmin credential storage is required.", 503);
    return result;
  };
  const open = (value: string | null): unknown => {
    if (!value?.startsWith("enc:v1:")) throw new GarminError("reconnect_required", "Reconnect Garmin to verify authorization.", 409);
    try { return JSON.parse(deps.decrypt(value)); } catch { throw new GarminError("reconnect_required", "Reconnect Garmin to verify authorization.", 409); }
  };
  async function replace(row: GarminConnection, patch: GarminPatch, unique = false, invalidateAt?: Date): Promise<GarminConnection> {
    if (patch.status) patch = { ...patch, syncStartedAt: busyStatuses.has(patch.status) ? now() : null };
    if (!await store.replace(row, patch, unique, invalidateAt)) changed();
    return { ...row, ...patch };
  }
  function grant(row: GarminConnection, clientId: string): Grant {
    const value = open(row.tokenEnc);
    if (!record(value) || value.version !== 1 || value.kind !== "grant" || value.clientId !== clientId || typeof value.accessToken !== "string")
      throw new GarminError("reconnect_required", "Reconnect the Garmin account; its credential configuration changed.", 409);
    return value as Grant;
  }
  function tokenPatch(token: GarminToken, clientId: string, subject: string | null): GarminPatch {
    return { tokenEnc: seal({ version: 1, kind: "grant", clientId, accessToken: token.accessToken, subject }),
      refreshEnc: seal({ version: 1, refreshToken: token.refreshToken, expiresAt: now().getTime() + (token.refreshExpiresIn - 600) * 1000 }),
      expiresAt: new Date(now().getTime() + (token.expiresIn - 600) * 1000) };
  }
  async function begin(userId: string) {
    const cfg = garminConfig(env), random = () => randomBytes(32).toString("base64url");
    const state = random(), verifier = random(), binding = random();
    const marker = seal({ version: 1, kind: "pending", state });
    const pending: Pending = { version: 1, kind: "pending", state, verifier, browserHash: garminDigest(binding), clientId: cfg.clientId, redirectUri: cfg.redirectUri, marker };
    const expiresAt = new Date(now().getTime() + 600_000);
    await store.begin(userId, marker, { state, userId, returnUrl: seal(pending), expiresAt, usedAt: null });
    return { authorizationUrl: garminAuthorizationUrl(cfg, state, verifier), browserBinding: binding };
  }
  async function complete(userId: string, params: URLSearchParams, binding: string | undefined) {
    const cfg = garminConfig(env), state = params.get("state");
    if (!validRandom(state) || !validRandom(binding) || ["state", "code", "error"].some(key => params.getAll(key).length > 1)) invalid();
    const txn = await store.transaction(state!);
    if (!txn || txn.userId !== userId || txn.usedAt || txn.expiresAt <= now()) invalid();
    const value = open(txn!.returnUrl);
    if (!record(value) || value.version !== 1 || value.kind !== "pending" || value.state !== state
        || value.clientId !== cfg.clientId || value.redirectUri !== cfg.redirectUri || !validRandom(value.verifier)
        || typeof value.browserHash !== "string" || !garminEqual(value.browserHash, garminDigest(binding!)) || typeof value.marker !== "string") invalid();
    const pending = value as Pending;
    if (!await store.consume(state!, userId, now())) invalid();
    let row = await store.get(userId);
    if (!row || row.status !== "authorizing" || row.tokenEnc !== pending.marker) changed();
    if (params.has("error") || !params.get("code")) {
      await replace(row!, { status: "disconnected", tokenEnc: null });
      throw new GarminError("authorization_declined", "Garmin authorization was not completed.");
    }
    const code = params.get("code")!;
    if (code.length > 4096 || /[\u0000-\u0020\u007f]/.test(code)) invalid();
    row = await replace(row!, { status: "exchanging" });
    try {
      const token = await protocol.token(cfg, { grant_type: "authorization_code", code, code_verifier: pending.verifier, redirect_uri: cfg.redirectUri });
      // Preserve issued credentials for revocation even if subsequent identity checks fail.
      row = await replace(row, tokenPatch(token, cfg.clientId, null));
      const [subject, permissions] = await Promise.all([protocol.identity(token.accessToken), protocol.permissions(token.accessToken)]);
      if (!permissions.length) throw new GarminError("permission_required", "No supported Garmin data or workout permission was granted.", 403);
      row = await replace(row, { status: "connected", externalRef: subject, scope: permissions.join(" "),
        tokenEnc: seal({ version: 1, kind: "grant", clientId: cfg.clientId, accessToken: token.accessToken, subject }), lastError: null }, true);
      return { connected: true, permissions };
    } catch (error) {
      if (error instanceof GarminError && error.code === "local_garmin_budget" && row.tokenEnc === pending.marker) {
        await replace(row, { status: "disconnected", tokenEnc: null, refreshEnc: null, expiresAt: null });
        throw error;
      }
      if (error instanceof GarminError && error.code === "provider_account_already_linked") {
        // Garmin deregistration is app/user-wide, not token-specific. Revoking
        // this duplicate grant would disconnect the existing athlete's account.
        // Discard this new local grant without touching the established owner.
        await replace(row, { status: "disconnected", tokenEnc: null, refreshEnc: null, expiresAt: null,
          externalRef: null, scope: null, lastError: "This Garmin account belongs to another JMM athlete. Connect your own account." });
        throw error;
      }
      await replace(row, { status: "reconnect_required", lastError: "Garmin authorization was not verified. Disconnect before reconnecting." });
      throw error;
    }
  }
  async function authorization(userId: string, required: GarminPermission[] = []) {
    const cfg = garminConfig(env);
    let row = await store.get(userId);
    if (!row || row.status !== "connected" || !row.externalRef || !row.expiresAt)
      throw new GarminError("reconnect_required", "Connect your own Garmin account first.", 409);
    let auth = grant(row, cfg.clientId);
    if (auth.subject !== row.externalRef) changed();
    let permissionsChecked = false;
    if (row.expiresAt <= now()) {
      const refresh = open(row.refreshEnc);
      if (!record(refresh) || refresh.version !== 1 || typeof refresh.refreshToken !== "string" || typeof refresh.expiresAt !== "number" || refresh.expiresAt <= now().getTime())
        throw new GarminError("reconnect_required", "Garmin refresh authorization expired. Reconnect your account.", 409);
      const beforeRefresh = row;
      row = await replace(row, { status: "refreshing" });
      try {
        const token = await protocol.token(cfg, { grant_type: "refresh_token", refresh_token: (refresh as Refresh).refreshToken });
        row = await replace(row, tokenPatch(token, cfg.clientId, auth.subject));
        const [subject, permissions] = await Promise.all([protocol.identity(token.accessToken), protocol.permissions(token.accessToken)]);
        if (subject !== row.externalRef) throw new GarminError("identity_unverified", "Garmin account ownership changed.", 409);
        row = await replace(row, { status: "connected", scope: permissions.join(" "), lastError: null });
        auth = grant(row, cfg.clientId);
        permissionsChecked = true;
      } catch (error) {
        if (error instanceof GarminError && error.code === "local_garmin_budget" && row.tokenEnc === beforeRefresh.tokenEnc) {
          await replace(row, { status: "connected", lastError: "Garmin request budget reached. Retry later." });
          throw error;
        }
        await replace(row, { status: "reconnect_required", lastError: "Garmin refresh was not confirmed. Disconnect before reconnecting; automatic retries are disabled." });
        throw error;
      }
    }
    // Garmin tokens can remain valid after the athlete disables a data-sharing
    // permission. Never treat token validity or a cached scope as fresh consent.
    if (!permissionsChecked) {
      const permissions = await protocol.permissions(auth.accessToken);
      row = await replace(row, { scope: permissions.join(" ") });
    }
    if (required.some(p => !row!.scope?.split(" ").includes(p))) throw new GarminError("permission_required", "Grant the required permission in Garmin before using this feature.", 403);
    const current = await store.get(userId);
    if (!current || current.status !== "connected" || current.tokenEnc !== row.tokenEnc || current.externalRef !== row.externalRef) changed();
    return { accessToken: auth.accessToken, userId: row.externalRef!, connectorId: row.id };
  }
  async function disconnect(userId: string, manualRevocationReported = false) {
    let row = await store.get(userId);
    if (!row || (row.status === "disconnected" && !row.tokenEnc && !row.refreshEnc)) return { disconnected: true, providerRevoked: false };
    if (manualRevocationReported) {
      if (row.status !== "revocation_required") throw new GarminError("manual_recovery_unavailable", "Try normal Garmin disconnection first.", 409);
      await replace(row, { status: "disconnected", tokenEnc: null, refreshEnc: null, expiresAt: null, externalRef: null, scope: null, lastError: null }, false, now());
      return { disconnected: true, providerRevoked: false, manualRevocationReported: true };
    }
    const interrupted = busyStatuses.has(row.status);
    if (interrupted && row.syncStartedAt && now().getTime() - row.syncStartedAt.getTime() < 90_000)
      throw new GarminError("connection_busy", "Garmin authorization is in progress. Wait before disconnecting.", 409);
    const cfg = garminCredentials(env); // Revocation remains available while the release flag is off.
    let auth: Grant | null = null;
    if (row.status !== "authorizing" && row.tokenEnc) {
      try { auth = grant(row, cfg.clientId); }
      catch {
        await replace(row, { status: "revocation_required", lastError: "An interrupted Garmin exchange has an unknown outcome. Remove JMM in Garmin Connect, then report manual removal to clear this local connection." });
        throw new GarminError("revocation_unconfirmed", "Remove JMM in Garmin Connect account settings, then confirm manual removal here.", 503);
      }
    }
    row = await replace(row, { status: "disconnecting" }, false, now());
    if (auth) {
      try { await protocol.revoke(auth.accessToken); }
      catch (error) { await replace(row, { status: "revocation_required", lastError: "Provider revocation unconfirmed. Remove JMM in Garmin Connect account settings." }); throw error; }
    }
    await replace(row, { status: "disconnected", tokenEnc: null, refreshEnc: null, expiresAt: null, externalRef: null, scope: null, lastError: null }, false, now());
    return { disconnected: true, providerRevoked: !!auth };
  }
  async function status(userId: string) {
    const row = await store.get(userId);
    return { configured: garminConfigured(env), status: row?.status ?? "disconnected", permissions: row?.scope?.split(" ").filter(Boolean) ?? [],
      lastError: row?.lastError ?? null, imports: "push_only", historicalBackfill: false, deviceReceipt: "unverified" };
  }
  return { begin, complete, authorization, disconnect, status };
}
