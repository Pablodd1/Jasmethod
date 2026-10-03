CREATE TABLE "SignInAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    CONSTRAINT "SignInAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SignInAccount_issuer_clientId_subject_key" ON "SignInAccount"("issuer", "clientId", "subject");
CREATE INDEX "SignInAccount_userId_idx" ON "SignInAccount"("userId");
ALTER TABLE "SignInAccount" ADD CONSTRAINT "SignInAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE TABLE "SignInTransaction" (
    "stateHash" TEXT NOT NULL,
    "browserHash" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "linkUserId" TEXT,
    "linkSessionHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SignInTransaction_pkey" PRIMARY KEY ("stateHash")
);
CREATE INDEX "SignInTransaction_expiresAt_idx" ON "SignInTransaction"("expiresAt");
-- Server-only identity and transient credentials. Match the existing auth-table
-- policy: Prisma's owner/service role can access; browser roles have no policy.
ALTER TABLE "SignInAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SignInTransaction" ENABLE ROW LEVEL SECURITY;
