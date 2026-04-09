/*
  Warnings:

  - Added the required column `updatedAt` to the `ChatRoom` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('NOTICE', 'GENERAL', 'GUIDE');

-- AlterEnum
ALTER TYPE "AuctionStatus" ADD VALUE 'EXPIRED';

-- DropForeignKey
ALTER TABLE "ChatRoom" DROP CONSTRAINT "ChatRoom_auctionId_fkey";

-- AlterTable
ALTER TABLE "Auction" ADD COLUMN     "enchantments" JSONB,
ADD COLUMN     "enhancementLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "enhancementRank" TEXT,
ADD COLUMN     "imprint" JSONB,
ADD COLUMN     "runes" JSONB,
ADD COLUMN     "skills" JSONB,
ALTER COLUMN "startPrice" SET DATA TYPE BIGINT,
ALTER COLUMN "currentPrice" SET DATA TYPE BIGINT,
ALTER COLUMN "buyNowPrice" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "Bid" ALTER COLUMN "bidAmount" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "ChatRoom" ADD COLUMN     "isAdminChat" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "auctionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isBanned" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "reputationScore" SET DEFAULT 5.0;

-- CreateTable
CREATE TABLE "Post" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "PostType" NOT NULL DEFAULT 'GENERAL',
    "authorId" INTEGER NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketVariable" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketVariable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketHistory" (
    "id" SERIAL NOT NULL,
    "itemId" INTEGER NOT NULL,
    "enhancementLevel" INTEGER NOT NULL DEFAULT 0,
    "enhancementRank" TEXT,
    "enchantments" JSONB,
    "imprint" JSONB,
    "skills" JSONB,
    "runes" JSONB,
    "price" BIGINT NOT NULL,
    "tradeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isLegacy" BOOLEAN NOT NULL DEFAULT false,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "excludeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Post_type_idx" ON "Post"("type");

-- CreateIndex
CREATE UNIQUE INDEX "MarketVariable_key_key" ON "MarketVariable"("key");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketHistory" ADD CONSTRAINT "MarketHistory_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatRoom" ADD CONSTRAINT "ChatRoom_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
