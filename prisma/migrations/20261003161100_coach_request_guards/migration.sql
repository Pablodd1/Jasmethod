-- CreateTable
CREATE TABLE "CoachConversationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "activeKey" TEXT,
    "metered" BOOLEAN NOT NULL DEFAULT false,
    "conversationId" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "CoachConversationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachConversationRequest_activeKey_key" ON "CoachConversationRequest"("activeKey");

-- CreateIndex
CREATE INDEX "CoachConversationRequest_userId_metered_createdAt_idx" ON "CoachConversationRequest"("userId", "metered", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoachConversationRequest_userId_clientRequestId_key" ON "CoachConversationRequest"("userId", "clientRequestId");

-- AddForeignKey
ALTER TABLE "CoachConversationRequest" ADD CONSTRAINT "CoachConversationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
