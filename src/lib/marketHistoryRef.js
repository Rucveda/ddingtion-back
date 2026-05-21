import prisma from "../db.js";

/**
 * 거래 완료 건이 시세(MarketHistory)에 유효 반영되어 있는지 확인합니다.
 */
export const isMarketReflected = async (auction) => {
  if (!auction || auction.status !== "COMPLETED") return false;

  const linked = await prisma.marketHistory.findFirst({
    where: { auctionId: auction.id },
    select: { isValid: true },
  });
  return Boolean(linked?.isValid);
};

/** 목록 API용 — auctionId 기준 일괄 조회 (N+1 방지) */
export const attachMarketReflected = async (auctions) => {
  const list = Array.isArray(auctions) ? auctions : [];
  const completedIds = list
    .filter((a) => a.status === "COMPLETED")
    .map((a) => a.id);

  if (completedIds.length === 0) {
    return list.map((auction) => ({ ...auction, marketReflected: false }));
  }

  const histories = await prisma.marketHistory.findMany({
    where: { auctionId: { in: completedIds } },
    select: { auctionId: true, isValid: true },
  });
  const validByAuctionId = new Map(
    histories.map((h) => [h.auctionId, h.isValid]),
  );

  return list.map((auction) => ({
    ...auction,
    marketReflected:
      auction.status === "COMPLETED"
        ? (validByAuctionId.get(auction.id) ?? false)
        : false,
  }));
};
