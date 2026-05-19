import prisma from "../db.js";
import { getAuctionQueue, rescheduleAuctionEndJob } from "./auctionQueueJobs.js";
import { AuctionServiceError } from "../services/auctionTradeService.js";

export const CANCEL_DELAY_MS = 5 * 60 * 1000;

export const removeAuctionQueueJobs = async (auctionId) => {
  const auctionQueue = getAuctionQueue();
  for (const jobId of [`auction_${auctionId}`, `cancel_${auctionId}`]) {
    const job = await auctionQueue.getJob(jobId);
    if (job) await job.remove();
  }
};

export const requestSellerCancel = async ({ auctionId, sellerId }) => {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: { item: { select: { name: true } }, bids: { select: { bidderId: true } } },
  });

  if (!auction) {
    throw new AuctionServiceError("경매를 찾을 수 없습니다.", 404);
  }
  if (auction.sellerId !== sellerId) {
    throw new AuctionServiceError("본인이 등록한 경매만 취소할 수 있습니다.", 403);
  }
  if (auction.status !== "ACTIVE") {
    throw new AuctionServiceError("진행 중인 경매만 취소 요청할 수 있습니다.", 400);
  }

  const cancelRequestedAt = new Date();
  const updated = await prisma.auction.update({
    where: { id: auctionId },
    data: {
      status: "CANCEL_PENDING",
      cancelRequestedAt,
    },
  });

  await removeAuctionQueueJobs(auctionId);

  const auctionQueue = getAuctionQueue();
  await auctionQueue.add(
    "finalizeCancel",
    { auctionId },
    { delay: CANCEL_DELAY_MS, jobId: `cancel_${auctionId}` },
  );

  const bidderIds = [...new Set(auction.bids.map((b) => b.bidderId))];
  if (bidderIds.length > 0) {
    await prisma.notification.createMany({
      data: bidderIds.map((userId) => ({
        userId,
        type: "AUCTION",
        message: `[${auction.item.name}] 경매가 판매자 요청으로 취소 보류 중입니다. 5분 후 유찰 처리됩니다.`,
        link: `/auction/${auctionId}`,
      })),
    });
  }

  return { auction: updated, cancelRequestedAt, finalizeAt: new Date(cancelRequestedAt.getTime() + CANCEL_DELAY_MS) };
};

export const finalizeSellerCancel = async (auctionId) => {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction || auction.status !== "CANCEL_PENDING") return null;

  return prisma.auction.update({
    where: { id: auctionId },
    data: { status: "EXPIRED", cancelRequestedAt: null },
  });
};

/** 판매자가 취소 보류를 철회하고 경매를 ACTIVE로 재개 */
export const revokeSellerCancel = async ({ auctionId, sellerId }) => {
  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    include: {
      item: { select: { name: true } },
      bids: { select: { bidderId: true } },
    },
  });

  if (!auction) {
    throw new AuctionServiceError("경매를 찾을 수 없습니다.", 404);
  }
  if (auction.sellerId !== sellerId) {
    throw new AuctionServiceError("본인이 등록한 경매만 취소를 철회할 수 있습니다.", 403);
  }
  if (auction.status !== "CANCEL_PENDING") {
    throw new AuctionServiceError("취소 보류 중인 경매만 재개할 수 있습니다.", 400);
  }

  const now = new Date();
  if (new Date(auction.endTime).getTime() <= now.getTime()) {
    throw new AuctionServiceError(
      "마감 시각이 지나 취소를 철회할 수 없습니다. 곧 유찰 처리됩니다.",
      400,
    );
  }

  const auctionQueue = getAuctionQueue();
  const cancelJob = await auctionQueue.getJob(`cancel_${auctionId}`);
  if (cancelJob) await cancelJob.remove();

  const updated = await prisma.auction.update({
    where: { id: auctionId },
    data: {
      status: "ACTIVE",
      cancelRequestedAt: null,
    },
  });

  await rescheduleAuctionEndJob(auctionId, auction.endTime);

  const bidderIds = [...new Set(auction.bids.map((b) => b.bidderId))];
  if (bidderIds.length > 0) {
    await prisma.notification.createMany({
      data: bidderIds.map((userId) => ({
        userId,
        type: "AUCTION",
        message: `[${auction.item.name}] 판매자가 취소를 철회했습니다. 경매가 다시 진행 중입니다.`,
        link: `/auction/${auctionId}`,
      })),
    });
  }

  return { auction: updated };
};
