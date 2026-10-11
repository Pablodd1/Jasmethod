CREATE TABLE "AccountSmokeReceipt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "consentVersion" TEXT NOT NULL,
  "destinationRevision" TEXT NOT NULL,
  "verificationHash" TEXT,
  "verificationExpiresAt" TIMESTAMP(3),
  "verificationAttempts" INTEGER NOT NULL DEFAULT 0,
  "verifiedEmailHash" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'processing',
  "receiptId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountSmokeReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AccountSmokeReceipt_userId_channel_consentVersion_key" ON "AccountSmokeReceipt"("userId", "channel", "consentVersion");
ALTER TABLE "AccountSmokeReceipt" ENABLE ROW LEVEL SECURITY;

CREATE TABLE "AccountSmokeTelegram" (
  "userId" TEXT NOT NULL PRIMARY KEY,
  "challengeHash" TEXT,
  "challengeExpiresAt" TIMESTAMP(3),
  "verifiedChatId" TEXT,
  "verifiedActorId" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccountSmokeTelegram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AccountSmokeTelegram_challengeHash_key" ON "AccountSmokeTelegram"("challengeHash");
CREATE UNIQUE INDEX "AccountSmokeTelegram_verifiedChatId_key" ON "AccountSmokeTelegram"("verifiedChatId");
ALTER TABLE "AccountSmokeTelegram" ENABLE ROW LEVEL SECURITY;
