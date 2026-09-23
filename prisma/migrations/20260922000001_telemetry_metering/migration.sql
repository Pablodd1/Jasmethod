-- Telemetry & usage metering (self-hosted observability).
-- AppEvent.userId / UsageCounter.userId are PLAIN columns (no FK) — telemetry
-- must never block user deletion or inherit cascade storms.
CREATE TABLE "AppEvent" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "route" TEXT,
    "userId" TEXT,
    "message" TEXT NOT NULL,
    "meta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AppEvent_kind_createdAt_idx" ON "AppEvent"("kind","createdAt");
CREATE INDEX "AppEvent_route_createdAt_idx" ON "AppEvent"("route","createdAt");

CREATE TABLE "UsageCounter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "UsageCounter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UsageCounter_userId_day_metric_key" ON "UsageCounter"("userId","day","metric");
CREATE INDEX "UsageCounter_day_metric_idx" ON "UsageCounter"("day","metric");

ALTER TABLE public."AppEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."UsageCounter" ENABLE ROW LEVEL SECURITY;
