-- Dynamic physiology: track weight provenance so device sync updates
-- device-sourced weights and fills blanks, but never overwrites manual entry.
ALTER TABLE "AthleteProfile" ADD COLUMN "weightSource" TEXT;
