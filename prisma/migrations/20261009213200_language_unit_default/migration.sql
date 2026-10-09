-- New profiles follow language; do not rewrite any existing athlete preference.
ALTER TABLE "AthleteProfile" ALTER COLUMN "units" SET DEFAULT 'auto';
