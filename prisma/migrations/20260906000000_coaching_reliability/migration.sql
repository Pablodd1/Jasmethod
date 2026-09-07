-- AlterTable
ALTER TABLE "Workout" ADD COLUMN     "actualDurationMin" INTEGER,
ADD COLUMN     "feedbackAt" TIMESTAMP(3),
ADD COLUMN     "feedbackNote" TEXT,
ADD COLUMN     "feedbackStatus" TEXT,
ADD COLUMN     "matchedPlanId" TEXT,
ADD COLUMN     "originalPlan" TEXT,
ADD COLUMN     "prescription" TEXT;

-- AlterTable
ALTER TABLE "DailyMetrics" ADD COLUMN     "hrvType" TEXT;

-- AlterTable
ALTER TABLE "Connector" ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "syncStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "workoutId" TEXT;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT,
    "before" TEXT,
    "after" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_subjectId_createdAt_idx" ON "AuditLog"("subjectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderDelivery_userId_day_channel_key" ON "ReminderDelivery"("userId", "day", "channel");

-- CreateIndex
CREATE INDEX "TrainingPlan_userId_status_startDate_idx" ON "TrainingPlan"("userId", "status", "startDate");

-- CreateIndex
CREATE INDEX "PlanDay_planId_date_idx" ON "PlanDay"("planId", "date");

-- CreateIndex
CREATE INDEX "Workout_userId_source_externalId_idx" ON "Workout"("userId", "source", "externalId");

-- CreateIndex
CREATE INDEX "CalendarEvent_userId_date_idx" ON "CalendarEvent"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_userId_externalId_key" ON "CalendarEvent"("userId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_userId_workoutId_key" ON "CalendarEvent"("userId", "workoutId");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY; ALTER TABLE "ReminderDelivery" ENABLE ROW LEVEL SECURITY;
