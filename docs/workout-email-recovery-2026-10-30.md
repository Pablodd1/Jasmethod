# Workout email recovery — 2026-10-30

## Live diagnosis
The existing administrator connection probe returned `Email: failed` and a sanitized SMTP authentication-rejection category. The probe did not send an email. Merely having environment-variable names configured is not working SMTP authorization.

The secure operator must repair the existing mail-provider authorization and production SMTP credentials. Do not paste credentials into chat, add a fallback provider, bypass TLS or enable a schedule to test. After deployment, repeat the connection check; only then request one verification code to the signed-in owner's inbox. The owner enters the code. SMTP acceptance is not inbox delivery. No credentials were retrieved, created or rotated by this change.

## Code changes
- Preserve the definite pre-DATA SMTP authentication failure as an allowlisted category; no raw provider response, credential, recipient or code is logged or exposed.
- Verification returns a bilingual service-repair explanation for authentication failure; uncertain delivery retains its uncertainty and can still accept an arriving code. No automatic resend.
- Require the correct backend acknowledgment before reporting request acceptance, verified inbox or saved preferences. A request acknowledgment never means the inbox is verified. Preserve a failed confirmation's draft.
- Prevent overlapping client actions and disable code requests when the installation is not configured. Verification and delivery consent remain separate.
- Expandable help explains that this settings page covers workout previews, instructions and update notices. It does not implement chat-transcript or motivation-digest delivery. Saved coach conversations remain available in Coach. No health history is automatically emailed and no provider/consent policy is expanded.

## Acceptance
Targeted route/transport tests cover authentication failure, sanitized output, unknown delivery, rate limiting, owner recipient binding and EN/ES messages. Mobile synthetic browser journeys cover service errors, ambiguous delivery, valid request acknowledgment, malformed verification acknowledgment, retained code, confirmed reload, and no automatic schedule enabling.

Actual inbox delivery remains BLOCKED by the live provider authorization failure until the secure operator repairs it and a real receipt/code test succeeds. Synthetic tests do not establish live SMTP or watch delivery. Full chat exports and motivational digests are not implemented by this recovery patch.
