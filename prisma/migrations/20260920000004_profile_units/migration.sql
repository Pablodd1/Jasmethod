-- Athlete display-unit preference (metric | imperial). Storage stays metric
-- (kg/km/ml/°C) — this is a display-layer conversion only.
ALTER TABLE "AthleteProfile" ADD COLUMN "units" TEXT NOT NULL DEFAULT 'metric';
