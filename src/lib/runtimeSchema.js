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

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AuctionComment" (
      "id" SERIAL NOT NULL,
      "auctionId" INTEGER NOT NULL,
      "authorId" INTEGER NOT NULL,
      "content" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AuctionComment_pkey" PRIMARY KEY ("id")
    );
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AuctionComment_auctionId_createdAt_idx"
    ON "AuctionComment"("auctionId", "createdAt");
  `);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AuctionComment_authorId_idx"
    ON "AuctionComment"("authorId");
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "AuctionComment"
        ADD CONSTRAINT "AuctionComment_auctionId_fkey"
        FOREIGN KEY ("auctionId") REFERENCES "Auction"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await prisma.$executeRawUnsafe(`
    DO $$ BEGIN
      ALTER TABLE "AuctionComment"
        ADD CONSTRAINT "AuctionComment_authorId_fkey"
        FOREIGN KEY ("authorId") REFERENCES "User"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  console.log("✅ 런타임 DB 스키마 확인 완료: User.discordId, ChatRoom confirmations, Post.category, AuctionComment");
};
