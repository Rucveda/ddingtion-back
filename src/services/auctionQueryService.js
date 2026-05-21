import prisma from "../db.js";
import { attachMarketReflected } from "../lib/marketHistoryRef.js";
import { isSystemCheckDescription } from "../services/systemCheck/constants.js";

export const getAuctionItems = async () => {
  return prisma.item.findMany({ orderBy: { name: "asc" } });
};

export const getActiveAuctions = async () => {
  const now = new Date();
  const auctions = await prisma.auction.findMany({
    where: {
      status: { in: ["ACTIVE", "CANCEL_PENDING"] },
      endTime: { gt: now },
    },
    include: {
      item: true,
      seller: { select: { id: true, ingameName: true, reputationScore: true } },
    },
    orderBy: { endTime: "asc" },
    take: 200,
  });

  // NOT + startsWith 는 description=null 행을 SQL에서 제외함 → 설명 없는 일반 경매가 목록에서 빠지는 버그 방지
  return auctions.filter((a) => !isSystemCheckDescription(a.description)).map((a) => ({
    ...a,
    startPrice: a.startPrice.toString(),
    currentPrice: a.currentPrice.toString(),
    buyNowPrice: a.buyNowPrice?.toString() || null,
  }));
};

export const getUserAuctions = async (userId) => {
  const auctions = await prisma.auction.findMany({
    where: { sellerId: userId, status: { not: "CANCELED" } },
    include: {
      item: true,
      chatRoom: {
        select: {
          id: true,
          status: true,
          buyerId: true,
          sellerId: true,
          sellerConfirmed: true,
          buyerConfirmed: true,
        },
      },
      bids: {
        orderBy: { bidAmount: "desc" },
        take: 1,
        include: { bidder: { select: { id: true, ingameName: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const mapped = auctions.map((auction) => {
    const topBid = auction.bids[0];
    return {
      ...auction,
      startPrice: auction.startPrice.toString(),
      currentPrice: auction.currentPrice.toString(),
      buyNowPrice: auction.buyNowPrice?.toString() || null,
      lastBidder: topBid?.bidder?.ingameName || "없음",
      lastBidderId: topBid?.bidderId || null,
    };
  });

  return attachMarketReflected(mapped);
};

export const getUserBidAuctions = async (userId) => {
  const bids = await prisma.bid.findMany({
    where: { bidderId: userId },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      auction: {
        include: {
          item: true,
          seller: { select: { id: true, ingameName: true, reputationScore: true } },
          chatRoom: {
            select: {
              id: true,
              status: true,
              buyerId: true,
              sellerId: true,
              sellerConfirmed: true,
              buyerConfirmed: true,
            },
          },
          bids: {
            orderBy: { bidAmount: "desc" },
            take: 1,
            include: { bidder: { select: { id: true, ingameName: true } } },
          },
        },
      },
    },
  });

  const uniqueAuctions = new Map();

  for (const bid of bids) {
    const auction = bid.auction;
    if (!auction || auction.status === "CANCELED" || uniqueAuctions.has(auction.id)) continue;

    const topBid = auction.bids[0];
    uniqueAuctions.set(auction.id, {
      ...auction,
      startPrice: auction.startPrice.toString(),
      currentPrice: auction.currentPrice.toString(),
      buyNowPrice: auction.buyNowPrice?.toString() || null,
      myBidAmount: bid.bidAmount.toString(),
      isHighestBidder: topBid?.bidderId === userId,
      lastBidder: topBid?.bidder?.ingameName || "없음",
    });
  }

  return attachMarketReflected(Array.from(uniqueAuctions.values()));
};

export const getAuctionDetail = async (auctionId) => {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      item: true,
      seller: { select: { id: true, ingameName: true, reputationScore: true, reviewCount: true, successfulTrades: true } },
      bids: {
        orderBy: { bidAmount: "desc" },
        take: 1,
        include: { bidder: { select: { id: true, ingameName: true } } },
      },
      _count: { select: { bids: true } },
    },
  });

  if (!auction) return null;

  const recentHistory = await prisma.marketHistory.findMany({
    where: {
      itemId: auction.itemId,
      isValid: true,
      enhancementLevel: auction.enhancementLevel,
      enhancementRank: auction.enhancementRank,
    },
    orderBy: { tradeDate: "desc" },
    take: 20,
  });

  const historyPrices = recentHistory.map((history) => history.price);
  const marketSummary = historyPrices.length > 0
    ? {
        count: historyPrices.length,
        averagePrice: (historyPrices.reduce((sum, price) => sum + price, 0n) / BigInt(historyPrices.length)).toString(),
        minPrice: historyPrices.reduce((min, price) => price < min ? price : min, historyPrices[0]).toString(),
        maxPrice: historyPrices.reduce((max, price) => price > max ? price : max, historyPrices[0]).toString(),
        latestPrice: historyPrices[0].toString(),
      }
    : null;

  return {
    ...auction,
    startPrice: auction.startPrice.toString(),
    currentPrice: auction.currentPrice.toString(),
    buyNowPrice: auction.buyNowPrice?.toString() || null,
    lastBidder: auction.bids[0]?.bidder.ingameName || "없음",
    lastBidderId: auction.bids[0]?.bidder.id || null,
    bidCount: auction._count.bids,
    marketSummary,
  };
};
