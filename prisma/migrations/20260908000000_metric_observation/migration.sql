-- Raw observation model: preserves device-specific identity.
-- WHOOP RMSSD, Garmin HRV, Oura HRV and manual HRV remain identifiable
-- as separate observations. DailyMetrics remains the V1 daily record.
-- Shadow-only: V2 may derive a canonical AthleteState from these.

CREATE TABLE IF NOT EXISTS "MetricObservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "metricType" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "source" TEXT NOT NULL,
    "measurementMethod" TEXT,
    "device" TEXT,
    "qualityFlag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricObservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MetricObservation_userId_observedAt_idx" ON "MetricObservation"("userId", "observedAt");
CREATE INDEX "MetricObservation_userId_metricType_idx" ON "MetricObservation"("userId", "metricType");

ALTER TABLE "MetricObservation" ADD CONSTRAINT "MetricObservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MetricObservation" ENABLE ROW LEVEL SECURITY;
