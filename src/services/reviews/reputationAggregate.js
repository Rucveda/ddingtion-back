import prisma from "../../db.js";

/** Review 집계 후 reviewee 평판 필드 갱신 */
export const syncRevieweeReputation = async (tx, revieweeId) => {
  const aggregate = await tx.review.aggregate({
    where: { revieweeId },
    _avg: { rating: true },
    _count: { rating: true },
  });

  await tx.user.update({
    where: { id: revieweeId },
    data: {
      reputationScore: aggregate._avg.rating || 0,
      reviewCount: aggregate._count.rating,
    },
  });
};
