import prisma from "../../db.js";
import {
  computeExtendedEndTime,
  getMinimumBid,
  shouldExtendAuctionOnBid,
} from "./bidIncrement.js";
import { rescheduleAuctionEndJob } from "../../lib/auctionQueueJobs.js";
import { enforceBidRateLimit } from "../../lib/rateLimit.js";
import { assertIpNotStrictBanned } from "../../lib/strictIpBan.js";
import { isDiscordVerificationEnforced } from "../../config/env.js";

export class PlaceBidError extends Error {
  constructor(message) {
    super(message);
    this.name = "PlaceBidError";
  }
}

/** 소켓·HTTP 공통 입찰 처리 (DB 일관성) */
export const placeBidOnAuction = async ({
  auctionId,
  bidderId,
  bidAmount,
  clientIp = "127.0.0.1",
  redisConnection,
  skipDiscordCheck = false,
}) => {
  const parsedAuctionId = parseInt(auctionId, 10);
  const parsedUserId = parseInt(bidderId, 10);
  const parsedBidAmount = BigInt(bidAmount);

  if (Number.isNaN(parsedAuctionId) || Number.isNaN(parsedUserId)) {
    throw new PlaceBidError("유효하지 않은 경매 또는 사용자입니다.");
  }

  await assertIpNotStrictBanned(clientIp);
  await enforceBidRateLimit(parsedUserId);

  if (!skipDiscordCheck && isDiscordVerificationEnforced()) {
    const bidder = await prisma.user.findUnique({
      where: { id: parsedUserId },
      select: { discordId: true },
    });
    if (!bidder?.discordId) {
      throw new PlaceBidError("디스코드 인증이 필요합니다.");
    }
  }

  if (redisConnection) {
    await redisConnection.set(`user_ip:${parsedUserId}`, clientIp, "EX", 86400);
  }

  const result = await prisma.$transaction(async (tx) => {
    const auctions = await tx.$queryRaw`SELECT * FROM "Auction" WHERE id = ${parsedAuctionId} FOR UPDATE`;
    const auction = auctions[0];

    if (!auction || auction.status !== "ACTIVE") {
      if (auction?.status === "CANCEL_PENDING") {
        throw new PlaceBidError("판매자 취소 보류 중인 경매에는 입찰할 수 없습니다.");
      }
      throw new PlaceBidError("이미 종료되었거나 무효한 경매입니다.");
    }

    const bidNow = new Date();
    const auctionEndTime = new Date(auction.endTime);
    if (auctionEndTime.getTime() <= bidNow.getTime()) {
      throw new PlaceBidError("이미 마감된 경매입니다.");
    }

    const minimumBid = getMinimumBid(auction.currentPrice, auctionEndTime, bidNow);
    if (parsedBidAmount < minimumBid) {
      throw new PlaceBidError(`최소 입찰가는 ${minimumBid.toString()}G 입니다.`);
    }
    if (auction.buyNowPrice && parsedBidAmount >= BigInt(auction.buyNowPrice)) {
      throw new PlaceBidError("즉시 구매가 이상의 금액은 입찰할 수 없습니다.");
    }
    if (auction.sellerId === parsedUserId) {
      throw new PlaceBidError("본인이 등록한 경매에는 입찰할 수 없습니다.");
    }

    const willExtend = shouldExtendAuctionOnBid(auctionEndTime, bidNow);
    const nextEndTime = willExtend ? computeExtendedEndTime(auctionEndTime, bidNow) : auctionEndTime;

    const newBid = await tx.bid.create({
      data: {
        auctionId: parsedAuctionId,
        bidderId: parsedUserId,
        bidAmount: parsedBidAmount,
      },
      include: { bidder: { select: { ingameName: true } } },
    });

    const auctionUpdate = await tx.auction.update({
      where: { id: parsedAuctionId },
      data: {
        currentPrice: parsedBidAmount,
        ...(willExtend ? { endTime: nextEndTime } : {}),
      },
      include: { item: true },
    });

    return { newBid, auctionUpdate, extended: willExtend, endTime: auctionUpdate.endTime };
  });

  if (result.extended) {
    await rescheduleAuctionEndJob(parsedAuctionId, result.endTime);
  }

  return result;
};
