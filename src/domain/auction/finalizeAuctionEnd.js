import prisma from "../../db.js";
import { createRedisClient } from "../../lib/redis.js";

const getPublisher = () => createRedisClient();

/**
 * ACTIVE 경매를 마감합니다. (워커 endAuction job 과 동일한 DB 부작용)
 * @returns {'EXPIRED'|'PENDING_TRADE'|null} null = 이미 종료됨 또는 없음
 */
export const finalizeActiveAuctionEnd = async (auctionId, { publisher = getPublisher() } = {}) => {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      bids: { orderBy: { bidAmount: "desc" }, take: 1, include: { bidder: { select: { ingameName: true } } } },
      item: true,
    },
  });

  if (!auction || auction.status !== "ACTIVE") return null;

  const lastBid = auction.bids[0];

  if (!lastBid) {
    await prisma.auction.update({
      where: { id: auctionId },
      data: { status: "EXPIRED" },
    });
    return "EXPIRED";
  }

  await prisma.$transaction([
    prisma.auction.update({
      where: { id: auctionId },
      data: { status: "PENDING_TRADE" },
    }),
    prisma.chatRoom.create({
      data: {
        auctionId: auction.id,
        sellerId: auction.sellerId,
        buyerId: lastBid.bidderId,
        isAdminChat: false,
      },
    }),
    prisma.notification.create({
      data: {
        userId: lastBid.bidderId,
        type: "TRADE",
        message: `축하합니다! [${auction.item.name}] 경매에 낙찰되셨습니다. 채팅에서 거래를 확정해주세요!`,
        link: `/auction/${auctionId}`,
      },
    }),
  ]);

  const eventPayload = {
    auctionId,
    winner: lastBid.bidder.ingameName,
    price: lastBid.bidAmount.toString(),
    reason: "BID_WIN",
  };
  await publisher.publish("auction-events", JSON.stringify(eventPayload));

  return "PENDING_TRADE";
};
