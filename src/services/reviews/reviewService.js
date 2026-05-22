import prisma from "../../db.js";
import { ReviewServiceError } from "./reviewErrors.js";
import { syncRevieweeReputation } from "./reputationAggregate.js";

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

      await syncRevieweeReputation(tx, parsedTargetId);

      return newReview;
    });
  } catch (error) {
    if (error instanceof ReviewServiceError) throw error;
    throw new ReviewServiceError(error.message || "리뷰 등록 실패");
  }
};

/** 운영자 경고: 거래 완료 여부와 무관하게 낮은 평점(1) 리뷰 반영 */
export const createAdminWarningReview = async ({ adminId, auctionId, revieweeId, reportId }) => {
  const parsedAuctionId = parseInt(auctionId, 10);
  const parsedRevieweeId = parseInt(revieweeId, 10);
  const parsedAdminId = parseInt(adminId, 10);

  if (Number.isNaN(parsedAuctionId) || Number.isNaN(parsedRevieweeId) || Number.isNaN(parsedAdminId)) {
    throw new ReviewServiceError("유효하지 않은 경고 대상입니다.", 400);
  }
  if (parsedAdminId === parsedRevieweeId) {
    throw new ReviewServiceError("대상 사용자에게 경고를 부여할 수 없습니다.", 400);
  }

  const comment = reportId ? `운영자 제재(신고 #${reportId})` : "운영자 제재";

  return prisma.$transaction(async (tx) => {
    const existing = await tx.review.findFirst({
      where: {
        auctionId: parsedAuctionId,
        reviewerId: parsedAdminId,
        revieweeId: parsedRevieweeId,
      },
    });

    if (existing) {
      await tx.review.update({
        where: { id: existing.id },
        data: { rating: 1, comment },
      });
    } else {
      await tx.review.create({
        data: {
          auctionId: parsedAuctionId,
          reviewerId: parsedAdminId,
          revieweeId: parsedRevieweeId,
          rating: 1,
          comment,
        },
      });
    }

    await syncRevieweeReputation(tx, parsedRevieweeId);

    return tx.review.findFirst({
      where: {
        auctionId: parsedAuctionId,
        reviewerId: parsedAdminId,
        revieweeId: parsedRevieweeId,
      },
    });
  });
};
