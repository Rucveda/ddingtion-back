import prisma from "../db.js";

/**
 * 거래 완료 건이 시세(MarketHistory)에 유효 반영되어 있는지 확인합니다.
 * 관리자가 거래 기록을 삭제하거나 무효 처리한 경우 false.
 */
export const isMarketReflected = async (auction) => {
  if (!auction || auction.status !== "COMPLETED") return false;

  const linked = await prisma.marketHistory.findFirst({
    where: { auctionId: auction.id },
    select: { isValid: true },
  });
  if (linked) return linked.isValid;

  const legacy = await prisma.marketHistory.findFirst({
    where: {
      itemId: auction.itemId,
      price: BigInt(auction.currentPrice),
      enhancementLevel: auction.enhancementLevel ?? 0,
      enhancementRank: auction.enhancementRank ?? null,
      isValid: true,
    },
    select: { id: true },
  });
  return Boolean(legacy);
};

export const attachMarketReflected = async (auctions) => {
  const list = Array.isArray(auctions) ? auctions : [];
  return Promise.all(
    list.map(async (auction) => ({
      ...auction,
      marketReflected: await isMarketReflected(auction),
    }))
  );
};
