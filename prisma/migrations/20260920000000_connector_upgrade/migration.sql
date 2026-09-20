-- Connector upgrade: OAuth transactions (mobile-safe returns), webhook event
-- ledger (dedupe), and race-result provenance (Athlinks).

-- 1. Race provenance + dedupe identity
ALTER TABLE "Race" ADD COLUMN "source" TEXT;
ALTER TABLE "Race" ADD COLUMN "sourceRecordId" TEXT;
ALTER TABLE "Race" ADD COLUMN "sourceRetrievedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Race_userId_source_sourceRecordId_key"
  ON "Race"("userId", "source", "sourceRecordId");

-- 2. OAuth transaction table: state -> user, no cookie dependence
CREATE TABLE "OAuthTransaction" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "returnUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "OAuthTransaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OAuthTransaction_state_key" ON "OAuthTransaction"("state");
CREATE INDEX "OAuthTransaction_userId_provider_idx" ON "OAuthTransaction"("userId","provider");

-- 3. Webhook event ledger: persist-first, dedupe redeliveries
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payload" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key" ON "WebhookEvent"("provider","eventId");
