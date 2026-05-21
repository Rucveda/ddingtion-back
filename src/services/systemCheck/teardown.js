import prisma from "../../db.js";
import { getAuctionQueue } from "../../lib/auctionQueueJobs.js";
import { isSystemCheckDescription } from "./constants.js";

export const teardownAuctionById = async (auctionId) => {
  if (!auctionId) return;

  try {
    const job = await getAuctionQueue().getJob(`auction_${auctionId}`);
    if (job) await job.remove();
  } catch {
    /* queue optional */
  }

  const room = await prisma.chatRoom.findUnique({ where: { auctionId } });

  if (room) {
    await prisma.report.deleteMany({ where: { roomId: room.id } });
    await prisma.message.deleteMany({ where: { roomId: room.id } });
    await prisma.chatRoom.delete({ where: { id: room.id } });
  }

  await prisma.marketHistory.deleteMany({ where: { auctionId } });
  await prisma.review.deleteMany({ where: { auctionId } });
  await prisma.auctionComment.deleteMany({ where: { auctionId } });
  await prisma.bid.deleteMany({ where: { auctionId } });
  await prisma.notification.deleteMany({
    where: { link: { contains: `/auction/${auctionId}` } },
  });
  await prisma.auction.deleteMany({ where: { id: auctionId } });
};

/** 남아 있는 시스템체크 경매 일괄 정리 (안전망) */
export const teardownStaleSystemCheckAuctions = async () => {
  const stale = await prisma.auction.findMany({
    where: { description: { startsWith: "__SYSTEM_CHECK__:" } },
    select: { id: true },
    take: 50,
  });
  for (const { id } of stale) {
    await teardownAuctionById(id);
  }
  return stale.length;
};
