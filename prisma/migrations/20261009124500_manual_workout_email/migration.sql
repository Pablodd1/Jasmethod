-- CreateTable
CREATE TABLE "ManualWorkoutEmailPreference" (
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "daily" BOOLEAN NOT NULL DEFAULT false,
    "revisions" BOOLEAN NOT NULL DEFAULT false,
    "calendarGuidance" BOOLEAN NOT NULL DEFAULT false,
    "consentVersion" TEXT,
    "consentAt" TIMESTAMP(3),
    "recipient" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "challengeHash" TEXT,
    "challengeExpiresAt" TIMESTAMP(3),
    "challengeSentAt" TIMESTAMP(3),
    "challengeAttempts" INTEGER NOT NULL DEFAULT 0,
    "timezone" TEXT NOT NULL,
    "minuteOfDay" INTEGER NOT NULL DEFAULT 360,
    "leadMinutes" INTEGER NOT NULL DEFAULT 60,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualWorkoutEmailPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ManualWorkoutEmailOutbox" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "acceptedAt" TIMESTAMP(3),
    "attemptedAt" TIMESTAMP(3),
    "receiptId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualWorkoutEmailOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualWorkoutEmailDispatch" (
    "key" TEXT NOT NULL,
    "outboxId" TEXT,
    "leasedUntil" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManualWorkoutEmailDispatch_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManualWorkoutEmailOutbox_dedupeKey_key" ON "ManualWorkoutEmailOutbox"("dedupeKey");

-- CreateIndex
CREATE INDEX "ManualWorkoutEmailOutbox_userId_sessionId_createdAt_idx" ON "ManualWorkoutEmailOutbox"("userId", "sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ManualWorkoutEmailOutbox_status_createdAt_idx" ON "ManualWorkoutEmailOutbox"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "ManualWorkoutEmailPreference" ADD CONSTRAINT "ManualWorkoutEmailPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualWorkoutEmailOutbox" ADD CONSTRAINT "ManualWorkoutEmailOutbox_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
