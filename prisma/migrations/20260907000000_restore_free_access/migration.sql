-- Preserve every account and its related athlete data. Only restore Jasmel's
-- platform role for deployments where the account already exists.
UPDATE "User"
SET "role" = 'admin'
WHERE lower("email") IN ('jasmel@jasmiamimethod.com', 'jasmelacosta@gmail.com')
  AND "role" <> 'admin';
