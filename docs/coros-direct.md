# Direct COROS integration: verified boundary and remaining gates

Status: **not enabled for production delivery or automatic import**. The local
code includes a preparation layer, an injected-token read-only transport, and a gated per-athlete OAuth lifecycle. It does
not claim a connected account, a saved workout, a synced watch, or imported
health data. No credentials or client registrations were created for this work.

## Sources checked on 2026-10-09

- [Build on COROS MCP](https://support.coros.com/hc/en-us/articles/53181619102996-Build-on-COROS-MCP)
  explicitly permits applications using OAuth 2.0 without partner approval.
  Access is per authorizing user, and reads are polled; there are no MCP webhooks.
- [Official COROS MCP repository](https://github.com/coroslab/COROS-MCP)
  documents tool names and supported training operations.
- [Official training and transport instructions](https://github.com/coroslab/COROS-MCP/blob/main/skill/coros_mcp_login_gateway/SKILL.md)
  require live schema discovery, distinguish library templates from scheduled
  copies, and describe current stateless transport.
- [Official login helper source](https://github.com/coroslab/COROS-MCP/blob/main/skill/coros_mcp_login_gateway/scripts/coros_mcp_login.py)
  documents dynamic client registration, PKCE, regional issuer pinning, and
  JSON-RPC initialize/tools/list/tools/call requests.
- Read-only live discovery at
  `https://mcp.coros.com/.well-known/openid-configuration` returned issuer
  `https://mcpus.coros.com`, authorization-code support, PKCE S256, and a
  `registration_endpoint` of `https://mcpus.coros.com/connect/register`.
  An unauthenticated read-only `tools/list` request at the regional `/mcp`
  returned HTTP 401. No authorization bypass was attempted.

## What is implemented

`coros-direct.ts` prepares an explicitly internal `jmm-coros-draft-v1` object
from a ready run/bike canonical session. This object is **not COROS course JSON**
and must never be passed directly to a provider tool. It keeps exact seconds,
meters, manual-lap endpoints, pace seconds/km, speed m/s, power watts,
heart-rate bpm, open effort, phases, notes and groups. Canonical repeats are
already expanded; all repetitions remain in their original order. No step is
truncated or replaced by a duration estimate. Training-course sport codes 1
(run) and 2 (bike) follow the official instructions, not activity sport codes.
Unsupported sports, repetition endpoints, held sessions and malformed targets
are rejected. Provider-specific limits still need the authenticated schema.

Operation planning has separate routes for reusable creation, direct scheduled
creation, scheduling an existing library workout, library replacement and
standalone scheduled replacement. Every result stays blocked. Updates require
reading corresponding details first; identifiers stay full decimal strings.
The returned scheduled-copy identifier may change after an update. Moving or
removing a standalone workout is unsupported and requires the COROS App; the
adapter never creates a second workout to simulate a move or edit. Library
edits cannot be presented as updates to already-scheduled copies. Plan edits
require a separate execution-plan workflow.

`coros-mcp.ts` implements stateless JSON-RPC using only a caller-injected,
already-authorized access token and its known regional endpoint. It has no
global token, storage, login, registration, refresh, or credential configuration
path. URLs are fixed to official US/EU/CN MCP endpoints; credentialed redirects
are forbidden. It supports bounded JSON/SSE responses, response-ID validation,
catalog pagination, sanitized failures and no automatic retries. Only an
explicit read-tool allowlist can be called. It never sends session headers or
an initialized notification, in accordance with current COROS instructions.
Tool argument names must come from the actual returned live schema; local test
catalogs are synthetic fixtures, not claimed provider schema captures.
The protocol version is negotiated in initialize. Subsequent requests follow
the published COROS helper's headers, which omit `MCP-Protocol-Version`; this is
a COROS-specific compatibility choice, not a claim of generic MCP compliance.
Tokens are bounded to 16 KiB, responses to 2 MiB, and a tool catalog to 20 pages,
500 tools and 4 MiB. These are local safety limits, not documented COROS limits.

`coros-polling.ts` returns separate activity or health raw-read envelopes. These
are explicitly unnormalized and unimported. It creates no scheduled jobs, uses
no webhook fiction, guesses no units or HRV type, and provides no watch-delivery
evidence. Actual normalization, deduplication and database ingestion remain
gated on authenticated response fixtures and account ownership checks.

## OAuth authorization versus workout delivery

COROS supports ordinary application OAuth and publishes a dynamic registration
endpoint. Partner approval is **not** the blocker for this MCP route. This
implementation did not register an application, create credentials, grant
access, or obtain an authorized token. The secure per-user authorize/callback/refresh/disconnect flow is implemented, but remains unconfigured. See `coros-oauth.md` for setup, threat boundaries, and the manual provider-revocation requirement. The owner must separately approve client registration/configuration and each athlete must authorize their account. Do not reuse an AI client's private token cache.

The public documentation intentionally directs clients to the connected
server's `tools/list` definitions for nested course and result schemas. Those
schemas were unavailable without authorization. Inventing `course`, stage,
target, repeat, date or receipt fields would risk silently changing training or
reporting false delivery. Consequently `publishCanonicalCorosWorkout` always
fails before HTTP and `corosDirectAvailability().available` remains false;
an environment flag cannot bypass these gates.

## Acceptance work needed before enabling

1. Review and run the implemented gated OAuth lifecycle against an approved registered public client and consenting test account. Verify regional issuer, state/PKCE, encrypted per-user storage, refresh, account binding, and provider-side manual revocation. No real authorization has been tested; do not log tokens.
2. Capture live `tools/list` and read-result fixtures for that region. Implement
   and test exact wire encoding and saved-result parsing, preserving targets,
   repeated steps and free/unset intensity fields. A lossless internal draft is
   not evidence that the provider supports every target or endpoint.
3. Validate COROS-account timezone and date windows (new scheduled workouts are
   documented as today through today + 90 days), course sizes and editability.
   The current official skill distinguishes that single-workout horizon from
   the 14-day start-date window for new multi-week plans. Earlier or regional
   descriptions may differ: the authenticated live tool schema wins, and an
   unresolved conflict must block publication rather than choose a larger window.
   Distinguish standalone scheduled copies from plan execution workouts.
4. Add tenant-isolated receipts keyed by session, canonical revision, account,
   region and provider copy identity, plus concurrency/uncertain-write handling.
   Direct scheduled creation has no documented duplicate protection. A timeout
   must lead to read-back reconciliation, never blind retry.
5. Read back and verify actual saved results. A successful MCP HTTP response or
   a library save is not watch delivery. Keep device receipt/execution claims
   false until supported by separate evidence.
6. Verify activity/health response contracts and units, then add separate,
   bounded polling import paths with provenance, deduplication and connection
   change checks. Do not infer all-day health or two-way sync from workout writes.
7. Run authenticated acceptance probes with a consenting test athlete, then
   device transfer/execution tests. None were performed in this implementation.

Unit tests use injected synthetic responses only. They verify preparation,
operation isolation, hard write gating, regional pinning, pagination, JSON/SSE
parsing, errors, and the separation of inbound raw reads from outbound delivery.
