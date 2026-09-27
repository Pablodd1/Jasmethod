CREATE TABLE "SyncJob" (
 "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL,
 "dedupeKey" TEXT NOT NULL, "payload" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending',
 "attempts" INTEGER NOT NULL DEFAULT 0, "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "leasedUntil" TIMESTAMP(3), "leaseToken" TEXT, "lastError" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "SyncJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SyncJob_dedupeKey_key" ON "SyncJob"("dedupeKey");
CREATE INDEX "SyncJob_status_availableAt_idx" ON "SyncJob"("status", "availableAt");
CREATE INDEX "SyncJob_userId_createdAt_idx" ON "SyncJob"("userId", "createdAt");
