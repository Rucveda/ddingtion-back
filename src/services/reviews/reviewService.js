import prisma from "../../db.js";
import { ReviewServiceError } from "./reviewErrors.js";

export const createReview = async ({
  reviewerId,
  auctionId,
  revieweeId,
  targetId,
  rating,
  comment,
}) => {
  const parsedAuctionId = parseInt(auctionId, 10);
  const parsedTargetId = parseInt(targetId || revieweeId, 10);
  const parsedRating = parseInt(rating, 10);

  if (Number.isNaN(parsedAuctionId) || Number.isNaN(parsedTargetId)) {
    throw new ReviewServiceError("유효하지 않은 요청 데이터입니다.");
  }
  if (reviewerId === parsedTargetId) {
    throw new ReviewServiceError("자기 자신에게 리뷰를 남길 수 없습니다.");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const existingReview = await tx.review.findFirst({
        where: { auctionId: parsedAuctionId, reviewerId },
      });
      if (existingReview) {
        throw new ReviewServiceError("이미 이 거래에 대한 평가를 작성하셨습니다.");
      }

      const room = await tx.chatRoom.findFirst({
        where: {
          auctionId: parsedAuctionId,
          status: "ARCHIVED",
          sellerConfirmed: true,
          buyerConfirmed: true,
          OR: [{ sellerId: reviewerId }, { buyerId: reviewerId }],
        },
        include: { auction: { select: { status: true } } },
      });
      if (!room) {
        throw new ReviewServiceError("완료된 거래에 참여한 유저만 평가를 남길 수 있습니다.");
      }
      if (room.auction?.status !== "COMPLETED") {
        throw new ReviewServiceError("거래 완료 후 평가를 남길 수 있습니다.");
      }

      const newReview = await tx.review.create({
        data: {
          auctionId: parsedAuctionId,
          reviewerId,
          revieweeId: parsedTargetId,
          rating: parsedRating,
          comment,
        },
      });

      const aggregate = await tx.review.aggregate({
        where: { revieweeId: parsedTargetId },
        _avg: { rating: true },
        _count: { rating: true },
      });

      await tx.user.update({
        where: { id: parsedTargetId },
        data: {
          reputationScore: aggregate._avg.rating || 0,
          reviewCount: aggregate._count.rating,
        },
      });

      return newReview;
    });
  } catch (error) {
    if (error instanceof ReviewServiceError) throw error;
    throw new ReviewServiceError(error.message || "리뷰 등록 실패");
  }
};
