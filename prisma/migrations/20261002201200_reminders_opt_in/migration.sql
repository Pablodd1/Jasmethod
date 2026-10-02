-- Only the default for NEW preferences changes. Existing athlete choices remain.
ALTER TABLE "ReminderPref" ALTER COLUMN "emailEnabled" SET DEFAULT false;
