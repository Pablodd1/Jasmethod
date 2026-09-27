# Durable synchronization operations

## Implemented path

OAuth exchanges tokens and stores connector plus initial SyncJob atomically. It redirects with sync=queued; it no longer races a five-second untracked import. WHOOP verified signatures and Strava's existing configured webhook checks run before queue insertion. Receivers return success only after durable enqueue; persistence failures return 503. Jobs belong to the matched JMM user. Duplicate payloads share a key; distinct update contents are retained.

The worker leases jobs for 15 minutes using compare-and-set ownership, retries failures with backoff, and stops after five attempts. Expired leases are recoverable; completion cannot overwrite a newer lease. Processing is at-least-once: activity imports are transactionally reconciled and deduplicated, not claimed to be exactly-once external delivery. Jobs have pending/running/done/failed statuses. Failed jobs require diagnosis before replay. Reauthorization creates a new initial job.

## Deploy and verify

1. Apply the included SyncJob and reminder attempt migrations in a reviewed staging deployment first. Generate Prisma from the same schema.
2. Set CRON_SECRET securely in the hosting environment. Never expose it in client variables or URLs.
3. vercel.json schedules /api/cron/worker every five minutes. Confirm the hosting plan supports this frequency and the endpoint's 300-second runtime. If not, use a scheduler/runtime that does; merely deploying the route does not run it.
4. Existing hourly /api/cron/sync and /api/cron/reminders schedules remain. The worker handles initial imports and webhook jobs, while hourly sync is the reconciliation fallback, including Oura polling.
5. Observe pending age, failed jobs, connector lastSyncAt/lastError and cron invocation logs. Test stopping a worker mid-job, recovery after lease expiration, provider outage/backoff and revoked consent. Monitor backlog before adding athletes; four concurrent jobs per invocation is an initial bound, not a scale guarantee.
6. Connect test accounts and verify a queued initial job reaches done with expected imported rows. Verify webhook retries, exact historical Strava activity changes, and activity deletion reopening only automatically completed prescriptions.

## Important boundaries

No live provider or physical-device acceptance is established by offline tests. Device approvals, Garmin delivery and historical backfill are separate requirements. Initial import still uses the existing 30-day window; this is not months of complete history. WHOOP recovery/sleep deletion explicitly fails for source-specific reconciliation rather than pretending a window import removed deleted values. WHOOP old-object updates still rely on a bounded window and need targeted-by-ID support. Strava retained webhook authentication is not a cryptographic request signature.

Do not claim the loop is real-time: accepted jobs wait for the scheduler. No standalone always-on local service is installed; local testing must invoke the authenticated worker endpoint or run the app with an explicitly configured scheduler. Unknown email/Telegram delivery outcomes are kept for provider receipt review and are not automatically resent. Retention and deletion policies for provider payloads still need operational enforcement.
