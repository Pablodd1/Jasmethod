CREATE TABLE "CoachingMessage" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CoachingMessage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CoachingMessage_body_length" CHECK (length("body") BETWEEN 1 AND 4000),
  CONSTRAINT "CoachingMessage_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CoachingMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CoachingMessage_authorId_clientId_key" ON "CoachingMessage"("authorId", "clientId");
CREATE INDEX "CoachingMessage_athleteId_createdAt_id_idx" ON "CoachingMessage"("athleteId", "createdAt", "id");

ALTER TABLE "ReminderDelivery" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
