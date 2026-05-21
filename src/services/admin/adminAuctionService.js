import prisma from "../../db.js";
import { getAuctionQueue } from "../../lib/auctionQueueJobs.js";

export const cancelAuctionByAdmin = async (auctionId) => {
  await prisma.auction.update({
    where: { id: auctionId },
    data: { status: "CANCELED" },
  });

  try {
    const job = await getAuctionQueue().getJob(`auction_${auctionId}`);
    if (job) {
      await job.remove();
      console.log(`[관리자] 경매 ${auctionId} 강제 취소로 인한 큐 정리 완료`);
    }
  } catch (jobErr) {
    console.error("관리자 BullMQ 큐 제거 중 예외 (무시됨):", jobErr);
  }
};
