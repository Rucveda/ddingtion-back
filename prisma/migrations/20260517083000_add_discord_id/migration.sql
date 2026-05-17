-- Add Discord account link used for verified trading.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "discordId" TEXT;

-- PostgreSQL permits multiple NULLs in a unique index, so unlinked users are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS "User_discordId_key" ON "User"("discordId");
