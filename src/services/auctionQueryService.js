import prisma from "../db.js";

export const getAuctionItems = async () => {
  return prisma.item.findMany({ orderBy: { name: "asc" } });
};

export const getCompletedHistory = async ({ itemId, limit }) => {
  const completedAuctions = await prisma.marketHistory.findMany({
    where: { itemId, isValid: true },
    orderBy: { tradeDate: "desc" },
    take: limit,
  });

  return completedAuctions.map((a) => ({
    ...a,
    price: a.price.toString(),
  }));
};

export const getActiveAuctions = async () => {
  const now = new Date();
  const auctions = await prisma.auction.findMany({
    where: { status: "ACTIVE", endTime: { gt: now } },
    include: {
      item: true,
      seller: { select: { id: true, ingameName: true, reputationScore: true } },
    },
    orderBy: { endTime: "asc" },
    take: 200,
  });

  return auctions.map((a) => ({
    ...a,
    startPrice: a.startPrice.toString(),
    currentPrice: a.currentPrice.toString(),
    buyNowPrice: a.buyNowPrice?.toString() || null,
  }));
};

export const getAuctionDetail = async (auctionId) => {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      item: true,
      seller: { select: { id: true, ingameName: true, reputationScore: true, reviewCount: true } },
      bids: {
        orderBy: { bidAmount: "desc" },
        take: 1,
        include: { bidder: { select: { ingameName: true } } },
      },
    },
  });

  if (!auction) return null;

  return {
    ...auction,
    startPrice: auction.startPrice.toString(),
    currentPrice: auction.currentPrice.toString(),
    buyNowPrice: auction.buyNowPrice?.toString() || null,
    lastBidder: auction.bids[0]?.bidder.ingameName || "없음",
  };
};
