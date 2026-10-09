# COROS application authorization pilot

This change implements a gated application OAuth lifecycle. It does not enable
activity ingestion, health-data ingestion, workout publication or watch delivery.
A validated account has Connector status `authorized`, deliberately separate from
the existing importer status `connected`. No sync job is queued by the callback.
Provider write operations remain hard-disabled in the existing COROS adapter.

## Configuration and approval boundary

The application owner must separately arrange an approved, pre-registered public
OAuth client for the selected COROS region. Creating/registering the client,
configuring its credentials or ongoing access, changing deployment settings and
granting a real athlete's consent require their own authorization. None were done
as part of this implementation. There is no automatic dynamic-registration code,
client-secret fallback, login helper execution or reuse of another application's
token cache.

The deployment reads these values only when configured by its owner:

- `ENABLE_COROS_CONNECTOR=true` enables new authorization and refresh. Default off.
- `COROS_CLIENT_ID` is the already registered public-client identifier.
- `COROS_ISSUER` is exactly one of `https://mcpus.coros.com`,
  `https://mcpeu.coros.com` or `https://mcpcn.coros.com`. The account's region must
  match; the gateway is not accepted and credentialed redirects are forbidden.
- `APP_URL` is the canonical app origin, such as `https://app.example`. No path,
  query, fragment, username or password is accepted. HTTPS is required except
  explicit loopback HTTP outside production. Forwarded host headers do not pick
  the callback destination.
- The existing `TOKEN_ENCRYPTION_KEY` must be configured and at least 32 characters.
  COROS refuses the shared encryption helper's development plaintext fallback.

Register the exact callback URL computed from the validated app origin:
`APP_URL/api/connectors/coros/callback`. The code does not accept a browser-selected
callback, return URL, issuer, client ID or redirect-URI override. Registration must
support authorization-code flow, refresh tokens, public-client token authentication
`none`, PKCE S256 and the exact callback. Actual registration and web-app acceptance
still need an approved live test.

The consent request is `openid offline_access mcp.tools`. This is a broad account,
offline-access and MCP grant; `mcp.tools` can cover read and write tools. It must not
be described as a provider-enforced read-only grant. JMM's separate implementation
gates keep imports and provider writes off. The UI requires explicit consent and
the authorize endpoint requires JSON `consent: true`.

## Official protocol evidence

Read-only discovery was checked on 2026-10-09 for all three regional issuers:

- [US OIDC discovery](https://mcpus.coros.com/.well-known/openid-configuration)
- [EU OIDC discovery](https://mcpeu.coros.com/.well-known/openid-configuration)
- [CN OIDC discovery](https://mcpcn.coros.com/.well-known/openid-configuration)
- [Official COROS helper source](https://github.com/coroslab/COROS-MCP/blob/main/skill/coros_mcp_login_gateway/scripts/coros_mcp_login.py)
- [Official COROS MCP documentation](https://github.com/coroslab/COROS-MCP)

Each document advertises its own exact regional origin with `/oauth2/authorize`,
`/oauth2/token`, `/oauth2/jwks`, `/userinfo` and `/oauth2/revoke`. Discovery also
advertises S256, RS256 ID tokens, authorization-code and refresh grants, the three
requested scopes and token endpoint authentication method `none`. The official
helper supplies the regional MCP resource URL in the authorization request.
The implementation validates these metadata values before using them; unexpected
changes fail closed instead of guessing a new endpoint.

Important: the currently advertised **revocation** authentication methods omit
`none`, even though the **token** endpoint advertises it. JMM does not invent a
client secret or try an undocumented unauthenticated revocation request.

## Routes and stored state

- `POST /api/connectors/coros/authorize`: authenticated same-origin JSON request,
  exact explicit consent, own athlete only. Returns the pinned authorization URL.
  An HttpOnly, SameSite=Lax browser-binding cookie accompanies the transaction.
- `GET /api/connectors/coros/callback`: requires the current signed-in athlete,
  matching browser binding, unexpired unused state, expected deployment binding
  and any returned issuer parameter. Redirects only to the canonical connectors
  page. Cookies are cleared, responses are not cached and referrers are suppressed.
- `POST /api/connectors/coros/refresh`: authenticated same-origin action; returns
  status only, never credentials. Refresh POSTs are never automatically retried.
- `POST /api/connectors/coros/disconnect`: available with the feature flag off.
  Uses the saved issuer/client binding rather than changed deployment credentials.

Mutation bodies are limited to 1 KiB. Cross-site origins and alternate athletes
are rejected. No route accepts health data, workout instructions or provider tool
arguments. No endpoint returns access tokens, refresh tokens, subject identifiers,
registration metadata or raw provider errors.

The existing OAuthTransaction model holds a random 256-bit state and an encrypted,
versioned, provider-specific metadata envelope in `returnUrl`. For COROS that field
is **not a navigation target**. It contains PKCE verifier, nonce, hashed browser
binding, selected issuer/client/callback and the pending-connection snapshot.
Transactions expire after ten minutes and are atomically single-use. Account and
browser binding are both required; callbacks do not silently switch athletes if
an in-app browser loses the session.

Connector `tokenEnc` holds an encrypted versioned credential envelope with saved
issuer/client and the verified subject; `refreshEnc` holds the separately encrypted
refresh token. `externalRef` holds a hash of issuer and subject for same-account
link conflict checks, not the raw provider subject. A serializable transaction
prevents the same identity being activated for another athlete. No schema migration
or package change is required.

Initial connection requires a signature-verified RS256 ID token with expected
issuer, client audience, nonce, valid subject, timestamps and authorized party when
applicable. An included access-token hash is checked. Refresh validates the same
identity; when the provider omits an ID token on refresh, the discovered userinfo
endpoint must return the existing subject. No unverified JWT claim establishes an
account. These identity contracts are fail-closed and have not yet been exercised
with a real COROS grant.

## Concurrency, interruption and disconnect semantics

Statuses are `disconnected`, `authorizing`, `exchanging`, `authorized`,
`refreshing`, `reconnect_required`, `disconnecting`, `revocation_pending` and
`revocation_required`. Local credential use is permitted only for a validated,
currently configured `authorized` connection. The status read performs no provider
requests and reports stopped access for expired credentials, missing encryption or
mismatched saved configuration. Expiry alone allows an explicit refresh attempt.

Every mutation compares athlete, row ID, status and encrypted token snapshots.
Rotating refresh tokens have one owner. A second refresh fails without sending a
provider request. Unknown token-exchange or refresh outcomes stop access and require
explicit recovery, rather than retrying a potentially consumed code/token.

An explicit disconnect can cancel even `exchanging`, `refreshing` or
`disconnecting` work. It atomically clears the exact local credential snapshot and
invalidates existing OAuth transactions, then records that provider removal is
needed. A late worker cannot restore credentials or invalidate a newer connection.
This is also the recovery path after a server process is interrupted; there is no
unbounded lease that permanently prevents the athlete from disconnecting.

For a normal disconnect:

1. Local credential use is stopped before provider work.
2. If discovery explicitly advertises public-client revocation, revoke the refresh
   and access token without redirects or retries. Only HTTP 200 acknowledgements
   produce `remoteRevoked: true`; this is provider acknowledgement, not an independent
   account-wide introspection proof.
3. If public-client revocation is not advertised, make **no revocation credential
   request**, remove local credentials and persist `revocation_required` with
   `remoteRevoked: false` and `requiresProviderRevocation: true`.
4. If an attempted revocation fails, retain encrypted credentials in stopped
   `revocation_pending` state for retry, and clearly report that remote revocation
   was not confirmed. A concurrent explicit local cancellation can still clear them.

The athlete must remove the application's authorization in COROS when provider
revocation cannot be confirmed. A prior unconfirmed-grant warning survives a new
local authorization, a declined reconnect, refresh and local disconnect. A newer
grant is not evidence that an older unknown grant was revoked. There is currently
no automatic evidence source for clearing this historical warning.

## Verification and remaining acceptance

`node --import tsx --test src/lib/coros-oauth.test.ts` uses injected in-memory stores,
synthetic provider responses and locally generated ephemeral JWT test keys. It
covers configuration/origin/consent gates, endpoint pinning, encrypted binding,
expiry/replay, tenant isolation, duplicate identity, real JWT validation, refresh
rotation, cancellation races, persistent warnings and sanitized failures.
No database connection or authenticated COROS traffic is used by these tests.

Before enabling a real pilot, obtain the necessary registration/configuration and
athlete approvals, then verify registered callback acceptance, provider consent,
nonce/ID-token claims, refresh and userinfo behavior, the current revocation contract
and interruption recovery with an isolated test athlete. Browser-session and actual
provider acceptance have not been tested. Activity ingestion, publication schemas,
saved-workout read-back and watch execution remain separately gated as described in
[the direct COROS integration notes](coros-direct.md).
