-- Race-intel fields: measured fueling inputs + wetsuit jurisdiction
ALTER TABLE "AthleteProfile" ADD COLUMN IF NOT EXISTS "sweatRateMlH" DOUBLE PRECISION;
ALTER TABLE "AthleteProfile" ADD COLUMN IF NOT EXISTS "sodiumMgPerL" DOUBLE PRECISION;
ALTER TABLE "AthleteProfile" ADD COLUMN IF NOT EXISTS "gutTrained" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "AthleteProfile" ADD COLUMN IF NOT EXISTS "draftSkill" TEXT;
ALTER TABLE "AthleteProfile" ADD COLUMN IF NOT EXISTS "federation" TEXT;
ALTER TABLE "AthleteProfile" ADD COLUMN IF NOT EXISTS "category" TEXT;
ALTER TABLE "Race" ADD COLUMN IF NOT EXISTS "federation" TEXT;
ALTER TABLE "Race" ADD COLUMN IF NOT EXISTS "category" TEXT;
