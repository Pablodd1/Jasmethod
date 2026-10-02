CREATE TABLE "CommunicationPreference" (
 "userId" TEXT NOT NULL PRIMARY KEY, "primaryChannel" TEXT NOT NULL DEFAULT 'app',
 "paused" BOOLEAN NOT NULL DEFAULT true, "dailyPlan" BOOLEAN NOT NULL DEFAULT false,
 "sessionFeedback" BOOLEAN NOT NULL DEFAULT false, "missingData" BOOLEAN NOT NULL DEFAULT false,
 "timezone" TEXT NOT NULL, "minuteOfDay" INTEGER NOT NULL DEFAULT 1020,
 "quietStart" INTEGER NOT NULL DEFAULT 1260, "quietEnd" INTEGER NOT NULL DEFAULT 420,
 "declinedOptional" TEXT NOT NULL DEFAULT '[]', "verifiedChatId" TEXT, "verifiedActorId" TEXT,
 "verifiedEmail" TEXT, "verifiedAt" TIMESTAMP(3), "verificationTransport" TEXT,
 "challengeHash" TEXT, "challengeExpiresAt" TIMESTAMP(3), "consentVersion" TEXT, "consentAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CommunicationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CommunicationPreference_verifiedChatId_key" ON "CommunicationPreference"("verifiedChatId");
CREATE TABLE "CoachingPrompt" (
 "id" TEXT NOT NULL PRIMARY KEY, "userId" TEXT NOT NULL, "sessionId" TEXT NOT NULL,
 "purpose" TEXT NOT NULL, "channel" TEXT NOT NULL, "transport" TEXT NOT NULL DEFAULT 'mock',
 "observationDate" TEXT NOT NULL, "timezone" TEXT NOT NULL, "sourceRevision" TEXT NOT NULL,
 "sourceWorkoutRevision" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL,
 "questions" TEXT NOT NULL, "message" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'queued',
 "attempts" INTEGER NOT NULL DEFAULT 0, "lastAttemptAt" TIMESTAMP(3), "nextAttemptAt" TIMESTAMP(3),
 "receiptId" TEXT, "error" TEXT, "tokenHash" TEXT, "tokenExpiresAt" TIMESTAMP(3), "tokenUsedAt" TIMESTAMP(3),
 "replyStatus" TEXT NOT NULL DEFAULT 'none', "candidate" TEXT, "repliedAt" TIMESTAMP(3), "confirmedAt" TIMESTAMP(3),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "CoachingPrompt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CoachingPrompt_idempotencyKey_key" ON "CoachingPrompt"("idempotencyKey");
CREATE INDEX "CoachingPrompt_userId_createdAt_idx" ON "CoachingPrompt"("userId", "createdAt");
CREATE INDEX "CoachingPrompt_status_nextAttemptAt_idx" ON "CoachingPrompt"("status", "nextAttemptAt");

CREATE TABLE "TelegramCoachingUpdate" (
 "id" TEXT NOT NULL PRIMARY KEY, "status" TEXT NOT NULL DEFAULT 'processing',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TelegramCoachingUpdate_createdAt_idx" ON "TelegramCoachingUpdate"("createdAt");
