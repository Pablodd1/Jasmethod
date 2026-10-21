-- NOT APPLIED. Written for owner review (see docs/smart-coach-pilot.md). Additive only: one new table, no change to
-- any existing table or row. Rolling back = DROP TABLE "ActivityStream" (data in it is a derived copy of files the
-- athlete uploaded; nothing else reads it unless ENABLE_ACTIVITY_STREAMS=1).
BEGIN;

-- CreateTable
CREATE TABLE "ActivityStream" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "data" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityStream_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActivityStream_workoutId_key" ON "ActivityStream"("workoutId");

-- CreateIndex
CREATE INDEX "ActivityStream_userId_expiresAt_idx" ON "ActivityStream"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "ActivityStream_expiresAt_idx" ON "ActivityStream"("expiresAt");

-- AddForeignKey
ALTER TABLE "ActivityStream" ADD CONSTRAINT "ActivityStream_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityStream" ADD CONSTRAINT "ActivityStream_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "Workout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Used only by the authenticated server-side Prisma paths; no anon/authenticated policies are granted (same
-- convention as ManualWorkoutEmail*). Verify the deployed Prisma role can access the table before applying.
ALTER TABLE "ActivityStream" ENABLE ROW LEVEL SECURITY;

COMMIT;
