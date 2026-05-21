import prisma from "../../db.js";
import { enforceCommentRateLimit, RateLimitError } from "../../lib/rateLimit.js";
import { AuctionServiceError } from "../auctionTradeService.js";

export { RateLimitError };

export const listAuctionComments = (auctionId) => {
  if (Number.isNaN(auctionId)) {
    throw new AuctionServiceError("유효하지 않은 경매 ID", 400);
  }
  return prisma.auctionComment.findMany({
    where: { auctionId },
    orderBy: { createdAt: "asc" },
    take: 100,
    include: {
      author: { select: { id: true, ingameName: true, reputationScore: true } },
    },
  });
};

export const createAuctionComment = async ({ auctionId, authorId, content, io }) => {
  await enforceCommentRateLimit(authorId);

  if (Number.isNaN(auctionId)) {
    throw new AuctionServiceError("유효하지 않은 경매 ID", 400);
  }
  const trimmed = String(content || "").trim();
  if (!trimmed) {
    throw new AuctionServiceError("댓글 내용을 입력해주세요.", 400);
  }
  if (trimmed.length > 500) {
    throw new AuctionServiceError("댓글은 500자 이하로 입력해주세요.", 400);
  }

  const auction = await prisma.auction.findUnique({
    where: { id: auctionId },
    select: { id: true, sellerId: true, status: true, item: { select: { name: true } } },
  });
  if (!auction) {
    throw new AuctionServiceError("경매 없음", 404);
  }
  if (auction.status !== "ACTIVE") {
    throw new AuctionServiceError("진행 중인 경매에만 댓글을 작성할 수 있습니다.", 400);
  }

  const comment = await prisma.auctionComment.create({
    data: { auctionId, authorId, content: trimmed },
    include: {
      author: { select: { id: true, ingameName: true, reputationScore: true } },
    },
  });

  if (auction.sellerId !== authorId) {
    await prisma.notification.create({
      data: {
        userId: auction.sellerId,
        type: "COMMENT",
        message: `[${auction.item.name}] 경매에 새 댓글이 등록되었습니다.`,
        link: `/auction/${auctionId}`,
      },
    });

    if (io) {
      io.to(`user_${auction.sellerId}`).emit("notification_update", {
        type: "COMMENT",
        auctionId,
      });
    }
  }

  return comment;
};
