-- Coach assignments: the coach→athlete permission boundary.
-- A coach may only access athletes with status="active"; admins bypass.
CREATE TABLE "CoachAssignment" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "consent" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CoachAssignment_coachId_athleteId_key" ON "CoachAssignment"("coachId","athleteId");
CREATE INDEX "CoachAssignment_athleteId_idx" ON "CoachAssignment"("athleteId");
ALTER TABLE "CoachAssignment" ADD CONSTRAINT "CoachAssignment_coachId_fkey"
  FOREIGN KEY ("coachId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachAssignment" ADD CONSTRAINT "CoachAssignment_athleteId_fkey"
  FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- RLS parity with every other table (ENABLE only — never FORCE; owner/Prisma).
ALTER TABLE public."CoachAssignment" ENABLE ROW LEVEL SECURITY;
