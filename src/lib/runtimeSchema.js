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

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ChatRoom" ADD COLUMN IF NOT EXISTS "sellerConfirmed" BOOLEAN NOT NULL DEFAULT false;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ChatRoom" ADD COLUMN IF NOT EXISTS "buyerConfirmed" BOOLEAN NOT NULL DEFAULT false;
  `);

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'GENERAL';
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Post_category_idx" ON "Post"("category");
  `);

  console.log("✅ 런타임 DB 스키마 확인 완료: User.discordId, ChatRoom confirmations, Post.category");
};
