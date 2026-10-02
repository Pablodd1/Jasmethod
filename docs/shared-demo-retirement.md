# Shared demo access retirement

The shared one-tap authentication route is permanently retired. `GET /api/auth/demo` returns `enabled: false`; `POST` returns 410. Neither request reads a user, writes a session, nor issues a cookie. No environment setting can restore the route. The public authentication component no longer includes the named demo identities.

Ordinary password login and signup hash the submitted password with SHA-256 and reject the known revoked fingerprint. Only that digest is retained, never the plaintext candidate or an encoding of it. Authentication still uses the existing salted bcrypt or legacy SHA-256 password verification for permitted passwords. Malformed credential hashes fail closed.

## All users must sign in again after an authorized deployment

Session token hashes now use an explicit `v2` namespace with a versioned hash domain. There is deliberately no legacy fallback. Every cookie issued before this change fails session lookup, including cookies from ordinary and Google sign-in. This applies to all users, not only potential demo accounts. New legitimate password login, signup, and verified Google sign-in create sessions in the new namespace.

This invalidation performs no database update or deletion. Old session records may remain stored until expiry or separately authorized cleanup, but their cookies cannot authenticate. Password changes cannot restore those legacy cookies. Existing account, password, profile, and training data remain unchanged. Never roll session hashing back to the legacy namespace, because that could reactivate still-unexpired legacy cookies.

## Operator remediation requires separate authorization

This code does not establish whether any former demo identity belonged to a real person or whether unauthorized access occurred. No real-account sign-in or live credential test was performed. The patch does not deploy itself or change production environment settings. No database migration, account/password reset, data deletion, or live access change was performed during implementation.

Before restoring password access to any potentially affected account, an authorized operator must verify ownership, review access history through approved private tools, and arrange a unique credential using an approved recovery flow. Do not test the revoked password against live accounts or place account data in public reports. Review linked provider access separately where warranted; do not delete accounts or training data automatically.

Keep the demo endpoint permanently closed rather than reintroducing shared login for testing. Use isolated synthetic accounts with unique credentials. Regression tests use the stored denylist digest and a harmless synthetic input with narrowly mocked hashing; they never reconstruct or embed the revoked credential.
