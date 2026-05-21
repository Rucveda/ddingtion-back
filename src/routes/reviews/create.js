import express from "express";
import authenticate from "../../middlewares/authenticate.js";
import * as reviews from "../../services/reviews/reviewService.js";
import { handleReviewRoute } from "./reviewRouteHelpers.js";

const router = express.Router();

router.post(
  "/",
  authenticate,
  handleReviewRoute(async (req, res) => {
    const review = await reviews.createReview({
      reviewerId: req.user.id,
      auctionId: req.body?.auctionId,
      revieweeId: req.body?.revieweeId,
      targetId: req.body?.targetId,
      rating: req.body?.rating,
      comment: req.body?.comment,
    });
    res.status(201).json(review);
  }, "리뷰 등록 실패"),
);

export default router;
