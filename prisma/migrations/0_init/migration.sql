-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'athlete',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "language" TEXT NOT NULL DEFAULT 'es',
    "avatar" TEXT NOT NULL DEFAULT '🧑',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AthleteProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "birthYear" INTEGER,
    "sex" TEXT,
    "heightCm" DOUBLE PRECISION,
    "weightKg" DOUBLE PRECISION,
    "experience" TEXT NOT NULL DEFAULT 'beginner',
    "goal" TEXT,
    "raceDate" TIMESTAMP(3),
    "weeklyHours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "trainingWindow" TEXT NOT NULL DEFAULT 'any',
    "vo2max" DOUBLE PRECISION,
    "lthr" INTEGER,
    "restingHr" INTEGER,
    "maxHr" INTEGER,
    "ftp" DOUBLE PRECISION,
    "cp" DOUBLE PRECISION,
    "wPrime" DOUBLE PRECISION,
    "swimPaceBase" DOUBLE PRECISION,
    "runPaceBase" DOUBLE PRECISION,
    "bikeType" TEXT,
    "hasBikePowerMeter" BOOLEAN NOT NULL DEFAULT false,
    "hasRunPowerMeter" BOOLEAN NOT NULL DEFAULT false,
    "hasBikeComputer" BOOLEAN NOT NULL DEFAULT false,
    "hasAeroBars" BOOLEAN NOT NULL DEFAULT false,
    "hasHrm" BOOLEAN NOT NULL DEFAULT false,
    "hasGpsWatch" BOOLEAN NOT NULL DEFAULT false,
    "hasSwimPaceTool" BOOLEAN NOT NULL DEFAULT false,
    "hasSmartTrainer" BOOLEAN NOT NULL DEFAULT false,
    "hasCadenceSensor" BOOLEAN NOT NULL DEFAULT false,
    "hrvBaseline" DOUBLE PRECISION,
    "injured" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "AthleteProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "distance" TEXT NOT NULL,
    "weeks" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "raceDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "tssTarget" DOUBLE PRECISION,
    "easyPct" INTEGER NOT NULL DEFAULT 70,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanDay" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "week" INTEGER NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "focus" TEXT,
    "notes" TEXT,
    "dayOff" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlanDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planDayId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "sport" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "distanceKm" DOUBLE PRECISION,
    "intensity" TEXT,
    "rpe" INTEGER,
    "tss" DOUBLE PRECISION,
    "planned" BOOLEAN NOT NULL DEFAULT true,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "avgHr" INTEGER,
    "maxHr" INTEGER,
    "avgPower" DOUBLE PRECISION,
    "np" DOUBLE PRECISION,
    "calories" INTEGER,
    "source" TEXT,
    "externalId" TEXT,
    "indoor" BOOLEAN NOT NULL DEFAULT false,
    "preWeightKg" DOUBLE PRECISION,
    "postWeightKg" DOUBLE PRECISION,
    "recovery" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMetrics" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "hrv" DOUBLE PRECISION,
    "restingHr" INTEGER,
    "sleepScore" INTEGER,
    "recoveryScore" INTEGER,
    "stressScore" INTEGER,
    "energy" INTEGER,
    "rhr" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "bodyFat" DOUBLE PRECISION,
    "sleepHours" DOUBLE PRECISION,
    "source" TEXT,

    CONSTRAINT "DailyMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SleepRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "bedTime" TIMESTAMP(3),
    "wakeTime" TIMESTAMP(3),
    "hours" DOUBLE PRECISION NOT NULL,
    "deepHours" DOUBLE PRECISION,
    "remHours" DOUBLE PRECISION,
    "lightHours" DOUBLE PRECISION,
    "awakenings" INTEGER,
    "efficiency" DOUBLE PRECISION,
    "quality" INTEGER,
    "source" TEXT,

    CONSTRAINT "SleepRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloodPanel" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "lab" TEXT,
    "note" TEXT,

    CONSTRAINT "BloodPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BloodResult" (
    "id" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "marker" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "refLow" DOUBLE PRECISION,
    "refHigh" DOUBLE PRECISION,
    "notes" TEXT,

    CONSTRAINT "BloodResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneticResult" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "fileName" TEXT,
    "summary" TEXT,

    CONSTRAINT "GeneticResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneticVariant" (
    "id" TEXT NOT NULL,
    "dnaResultId" TEXT NOT NULL,
    "rsid" TEXT NOT NULL,
    "gene" TEXT,
    "genotype" TEXT NOT NULL,
    "trait" TEXT,
    "impact" TEXT,
    "note" TEXT,

    CONSTRAINT "GeneticVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NutritionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "meal" TEXT,
    "food" TEXT NOT NULL,
    "calories" INTEGER,
    "proteinG" DOUBLE PRECISION,
    "carbsG" DOUBLE PRECISION,
    "fatG" DOUBLE PRECISION,
    "waterMl" INTEGER,

    CONSTRAINT "NutritionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HydrationLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "ml" INTEGER NOT NULL,
    "source" TEXT,

    CONSTRAINT "HydrationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connector" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'disconnected',
    "tokenEnc" TEXT,
    "refreshEnc" TEXT,
    "expiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncCount" INTEGER,

    CONSTRAINT "Connector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "type" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MotivationPref" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dailyQuote" BOOLEAN NOT NULL DEFAULT true,
    "emailDigest" BOOLEAN NOT NULL DEFAULT true,
    "digestHour" INTEGER NOT NULL DEFAULT 6,
    "style" TEXT NOT NULL DEFAULT 'coach',

    CONSTRAINT "MotivationPref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SentEmail" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SentEmail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Race" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "distance" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT,
    "location" TEXT,
    "targetTempC" DOUBLE PRECISION,
    "humidity" DOUBLE PRECISION,
    "baseElevM" DOUBLE PRECISION,
    "goalTimeMin" DOUBLE PRECISION,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "bikeElevM" DOUBLE PRECISION,
    "bikeTerrain" TEXT,
    "runElevM" DOUBLE PRECISION,
    "runTerrain" TEXT,
    "swimVenue" TEXT,
    "waterTempC" DOUBLE PRECISION,
    "swimCurrent" TEXT,
    "notes" TEXT,

    CONSTRAINT "Race_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenchmarkTest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "result" DOUBLE PRECISION,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BenchmarkTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyCheckin" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "answers" TEXT,
    "adaptation" TEXT,
    "fuel" TEXT,
    "ergos" TEXT,

    CONSTRAINT "DailyCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplementProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "likes" TEXT,
    "dislikes" TEXT,
    "optsOut" TEXT,

    CONSTRAINT "SupplementProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderPref" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "telegramChatId" TEXT,
    "reminderHour" INTEGER NOT NULL DEFAULT 17,
    "remindBeforeMin" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReminderPref_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CognitiveTest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "test" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "CognitiveTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "AthleteProfile_userId_key" ON "AthleteProfile"("userId");

-- CreateIndex
CREATE INDEX "Workout_userId_date_idx" ON "Workout"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMetrics_userId_date_key" ON "DailyMetrics"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SleepRecord_userId_date_key" ON "SleepRecord"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Connector_userId_provider_key" ON "Connector"("userId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "MotivationPref_userId_key" ON "MotivationPref"("userId");

-- CreateIndex
CREATE INDEX "Race_userId_date_idx" ON "Race"("userId", "date");

-- CreateIndex
CREATE INDEX "BenchmarkTest_userId_date_idx" ON "BenchmarkTest"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCheckin_userId_date_key" ON "DailyCheckin"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SupplementProfile_userId_key" ON "SupplementProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderPref_userId_key" ON "ReminderPref"("userId");

-- CreateIndex
CREATE INDEX "CognitiveTest_userId_date_idx" ON "CognitiveTest"("userId", "date");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AthleteProfile" ADD CONSTRAINT "AthleteProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingPlan" ADD CONSTRAINT "TrainingPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanDay" ADD CONSTRAINT "PlanDay_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TrainingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workout" ADD CONSTRAINT "Workout_planDayId_fkey" FOREIGN KEY ("planDayId") REFERENCES "PlanDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMetrics" ADD CONSTRAINT "DailyMetrics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SleepRecord" ADD CONSTRAINT "SleepRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloodPanel" ADD CONSTRAINT "BloodPanel_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BloodResult" ADD CONSTRAINT "BloodResult_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "BloodPanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneticResult" ADD CONSTRAINT "GeneticResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneticVariant" ADD CONSTRAINT "GeneticVariant_dnaResultId_fkey" FOREIGN KEY ("dnaResultId") REFERENCES "GeneticResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NutritionLog" ADD CONSTRAINT "NutritionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HydrationLog" ADD CONSTRAINT "HydrationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connector" ADD CONSTRAINT "Connector_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MotivationPref" ADD CONSTRAINT "MotivationPref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SentEmail" ADD CONSTRAINT "SentEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Race" ADD CONSTRAINT "Race_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BenchmarkTest" ADD CONSTRAINT "BenchmarkTest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCheckin" ADD CONSTRAINT "DailyCheckin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplementProfile" ADD CONSTRAINT "SupplementProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderPref" ADD CONSTRAINT "ReminderPref_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CognitiveTest" ADD CONSTRAINT "CognitiveTest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

