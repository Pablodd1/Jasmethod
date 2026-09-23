-- Sprint: forecast snapshots (honest calibration), GPX course fields, V2
-- shadow persistence.

ALTER TABLE "Race" ADD COLUMN "courseKm" DOUBLE PRECISION;
ALTER TABLE "Race" ADD COLUMN "courseElevM" DOUBLE PRECISION;
ALTER TABLE "DailyCheckin" ADD COLUMN "shadowV2" TEXT;

CREATE TABLE "RaceForecastSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "raceId" TEXT NOT NULL,
    "raceDate" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "predictedMin" DOUBLE PRECISION NOT NULL,
    "bestMin" DOUBLE PRECISION,
    "worstMin" DOUBLE PRECISION,
    "inputs" TEXT,
    "engineVersion" TEXT NOT NULL,
    CONSTRAINT "RaceForecastSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RaceForecastSnapshot_userId_raceId_capturedAt_idx"
  ON "RaceForecastSnapshot"("userId","raceId","capturedAt");
ALTER TABLE "RaceForecastSnapshot" ADD CONSTRAINT "RaceForecastSnapshot_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE public."RaceForecastSnapshot" ENABLE ROW LEVEL SECURITY;
