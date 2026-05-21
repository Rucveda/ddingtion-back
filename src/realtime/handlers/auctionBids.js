import prisma from "../../db.js";
import jwt from "jsonwebtoken";
import { env, isDiscordVerificationEnforced } from "../../config/env.js";
import {
  computeExtendedEndTime,
  getMinimumBid,
  shouldExtendAuctionOnBid,
} from "../../domain/auction/bidIncrement.js";
import { rescheduleAuctionEndJob } from "../../lib/auctionQueueJobs.js";
import { enforceBidRateLimit } from "../../lib/rateLimit.js";
import { assertIpNotStrictBanned } from "../../lib/strictIpBan.js";

export const attachAuctionBidHandlers = (io, socket, { redisConnection, clientIp }) => {
  socket.on("join_auction", (auctionId) => {
    if (auctionId) socket.join(`auction_${auctionId}`);
  });

  socket.on("place_bid", async (data) => {
    try {
      const { auctionId, bidAmount, token } = data;

      if (!token) throw new Error("인증 토큰이 누락되었습니다.");
      let decodedUser;
      try {
        decodedUser = jwt.verify(token, env.JWT_SECRET);
      } catch {
        throw new Error("유효하지 않은 인증입니다.");
      }

      const parsedUserId = parseInt(decodedUser.id, 10);

      await assertIpNotStrictBanned(clientIp);
      await enforceBidRateLimit(parsedUserId);

      if (isDiscordVerificationEnforced()) {
        const bidder = await prisma.user.findUnique({
          where: { id: parsedUserId },
          select: { discordId: true },
        });
        if (!bidder?.discordId) {
          throw new Error(
            "디스코드 인증이 필요합니다. 마이페이지에서 계정을 연동한 뒤 입찰할 수 있습니다.",
          );
        }
      }

      await redisConnection.set(`user_ip:${parsedUserId}`, clientIp, "EX", 86400);
      const parsedAuctionId = parseInt(auctionId, 10);
      const parsedBidAmount = BigInt(bidAmount);

      if (Number.isNaN(parsedAuctionId) || Number.isNaN(parsedUserId)) return;

      const prevHighestBid = await prisma.bid.findFirst({
        where: { auctionId: parsedAuctionId },
        orderBy: { bidAmount: "desc" },
        include: { auction: { include: { item: true } } },
      });

      const result = await prisma.$transaction(async (tx) => {
        const auctions = await tx.$queryRaw`SELECT * FROM "Auction" WHERE id = ${parsedAuctionId} FOR UPDATE`;
        const auction = auctions[0];

        if (!auction || auction.status !== "ACTIVE") {
          if (auction?.status === "CANCEL_PENDING") {
            throw new Error("판매자 취소 보류 중인 경매에는 입찰할 수 없습니다.");
          }
          throw new Error("이미 종료되었거나 무효한 경매입니다.");
        }

        const bidNow = new Date();
        const auctionEndTime = new Date(auction.endTime);
        if (auctionEndTime.getTime() <= bidNow.getTime()) {
          throw new Error("이미 마감된 경매입니다.");
        }

        const minimumBid = getMinimumBid(auction.currentPrice, auctionEndTime, bidNow);
        if (parsedBidAmount < minimumBid) {
          throw new Error(
            `최소 입찰가는 ${minimumBid.toString()}G 입니다. (마감 임박 시 최소 인상이 커질 수 있습니다)`,
          );
        }
        if (auction.buyNowPrice && parsedBidAmount >= BigInt(auction.buyNowPrice)) {
          throw new Error("즉시 구매가 이상의 금액은 입찰할 수 없습니다. 즉시 구매 기능을 이용해주세요.");
        }
        if (auction.sellerId === parsedUserId) {
          throw new Error("본인이 등록한 경매에는 입찰할 수 없습니다.");
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

      io.to(`auction_${parsedAuctionId}`).emit("bid_updated", {
        newPrice: result.newBid.bidAmount.toString(),
        bidderName: result.newBid.bidder.ingameName,
        endTime: result.endTime.toISOString(),
        extended: result.extended,
      });

      if (prevHighestBid && prevHighestBid.bidderId !== parsedUserId) {
        const itemName = result.auctionUpdate.item.name;
        const msg = `PROTOCOL WARNING: [${itemName}]의 입찰 주도권을 상실했습니다!`;

        await prisma.notification.create({
          data: {
            userId: prevHighestBid.bidderId,
            type: "OUTBID",
            message: msg,
            link: `/auction/${parsedAuctionId}`,
          },
        });

        io.to(`user_${prevHighestBid.bidderId}`).emit("outbid_notification", {
          auctionId: parsedAuctionId,
          itemName,
          newPrice: result.newBid.bidAmount.toString(),
          message: msg,
        });
      }
    } catch (error) {
      console.error("입찰 처리 오류:", error.message);
      socket.emit("chat_error", { message: error.message });
    }
  });
};
