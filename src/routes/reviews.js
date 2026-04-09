const express = require('express');
const router = express.Router();
const prisma = require('../db');
const authenticateToken = require('../middlewares/authMiddleware');

router.post('/', authenticateToken, async (req, res) => {
  const { auctionId, revieweeId, rating, comment } = req.body;
  const reviewerId = req.user.id;

  try {
    // 1. 리뷰 저장
    const review = await prisma.$transaction(async (tx) => {
      const newReview = await tx.review.create({
        data: {
          auctionId,
          reviewerId,
          revieweeId,
          rating: parseInt(rating),
          comment
        }
      });

      // 2. 리뷰 대상자의 평균 점수 재계산
      const aggregate = await tx.review.aggregate({
        where: { revieweeId },
        _avg: { rating: true },
        _count: { rating: true }
      });

      // 3. 유저 정보 업데이트 (평점 및 거래 횟수)
      await tx.user.update({
        where: { id: revieweeId },
        data: {
          reputationScore: aggregate._avg.rating || 0,
          reviewCount: aggregate._count.rating,
          successfulTrades: { increment: 1 } // 성공적인 거래 횟수 증가
        }
      });

      return newReview;
    });

    res.json(review);
  } catch (error) {
    res.status(500).json({ error: "리뷰 등록 실패" });
  }
});

module.exports = router;