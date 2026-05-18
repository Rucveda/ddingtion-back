CREATE TABLE "AuctionComment" (
    "id" SERIAL NOT NULL,
    "auctionId" INTEGER NOT NULL,
    "authorId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuctionComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuctionComment_auctionId_createdAt_idx" ON "AuctionComment"("auctionId", "createdAt");
CREATE INDEX "AuctionComment_authorId_idx" ON "AuctionComment"("authorId");

ALTER TABLE "AuctionComment" ADD CONSTRAINT "AuctionComment_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "Auction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuctionComment" ADD CONSTRAINT "AuctionComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
