import express from 'express';
const router = express.Router();
import prisma from '../db.js';
import authenticateToken from '../middlewares/authMiddleware.js';

router.post('/', authenticateToken, async (req, res) => {
  // 💡 패치: 프론트엔드(ReviewModal)에서 보내는 targetId 호환성 추가
  const { auctionId, revieweeId, targetId, rating, comment } = req.body;
  const reviewerId = req.user.id;

  const parsedAuctionId = parseInt(auctionId);
  const parsedTargetId = parseInt(targetId || revieweeId);
  const parsedRating = parseInt(rating);

  if (isNaN(parsedAuctionId) || isNaN(parsedTargetId)) {
    return res.status(400).json({ error: "유효하지 않은 요청 데이터입니다." });
  }
  if (reviewerId === parsedTargetId) {
    return res.status(400).json({ error: "자기 자신에게 리뷰를 남길 수 없습니다." });
  }

  try {
    const review = await prisma.$transaction(async (tx) => {
      // 💡 패치: 하나의 경매당 1회만 평가할 수 있도록 중복 방지(어뷰징 차단)
      const existingReview = await tx.review.findFirst({
        where: { auctionId: parsedAuctionId, reviewerId }
      });
      if (existingReview) {
        throw new Error("이미 이 거래에 대한 평가를 작성하셨습니다.");
      }

      // 💡 보안 패치: 해당 거래의 실제 참여자(판매자 또는 구매자)인지 채팅방 내역으로 교차 검증
      const room = await tx.chatRoom.findFirst({
        where: {
          auctionId: parsedAuctionId,
          status: "ARCHIVED",
          sellerConfirmed: true,
          buyerConfirmed: true,
          OR: [{ sellerId: reviewerId }, { buyerId: reviewerId }]
        },
        include: { auction: { select: { status: true } } }
      });
      if (!room) {
        throw new Error("완료된 거래에 참여한 유저만 평가를 남길 수 있습니다.");
      }
      if (room.auction?.status !== "COMPLETED") {
        throw new Error("거래 완료 후 평가를 남길 수 있습니다.");
      }

      const newReview = await tx.review.create({
        data: {
          auctionId: parsedAuctionId,
          reviewerId,
          revieweeId: parsedTargetId,
          rating: parsedRating,
          comment
        }
      });

      // 2. 리뷰 대상자의 평균 점수 재계산
      const aggregate = await tx.review.aggregate({
        where: { revieweeId: parsedTargetId },
        _avg: { rating: true },
        _count: { rating: true }
      });

      // 3. 유저 정보 업데이트 (평점 및 거래 횟수)
      await tx.user.update({
        where: { id: parsedTargetId },
        data: {
          reputationScore: aggregate._avg.rating || 0,
          reviewCount: aggregate._count.rating,
        }
      });

      return newReview;
    });

    res.status(201).json(review);
  } catch (error) {
    console.error("Review Error:", error.message);
    res.status(400).json({ error: error.message || "리뷰 등록 실패" });
  }
});

export default router;