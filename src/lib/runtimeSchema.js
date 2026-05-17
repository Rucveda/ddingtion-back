/**
 * Minimal runtime schema guard for small additive changes that must exist
 * before Prisma model queries run in production.
 */
export const ensureRuntimeSchema = async (prisma) => {
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "discordId" TEXT;
  `);

  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "User_discordId_key" ON "User"("discordId");
  `);

  console.log("✅ 런타임 DB 스키마 확인 완료: User.discordId");
};
