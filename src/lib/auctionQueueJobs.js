import { Queue } from "bullmq";
import { createRedisClient } from "./redis.js";

let auctionQueueInstance;

export const getAuctionQueue = () => {
  if (!auctionQueueInstance) {
    auctionQueueInstance = new Queue("auctionQueue", { connection: createRedisClient() });
  }
  return auctionQueueInstance;
};

/** 경매 마감 BullMQ 작업을 새 종료 시각 기준으로 다시 예약 */
export const rescheduleAuctionEndJob = async (auctionId, endTime) => {
  const auctionQueue = getAuctionQueue();
  const jobId = `auction_${auctionId}`;
  const job = await auctionQueue.getJob(jobId);
  if (job) {
    await job.remove();
  }

  const delay = Math.max(0, new Date(endTime).getTime() - Date.now());
  await auctionQueue.add(
    "endAuction",
    { auctionId },
    { delay, jobId },
  );
};
