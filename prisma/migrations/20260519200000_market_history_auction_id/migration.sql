ALTER TABLE "MarketHistory" ADD COLUMN IF NOT EXISTS "auctionId" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "MarketHistory_auctionId_key" ON "MarketHistory"("auctionId");
