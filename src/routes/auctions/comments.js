import express from "express";
import authenticate from "../../middlewares/authenticate.js";
import { checkDiscordLinked } from "../../middlewares/discordCheck.js";
import { rejectBannedAccount } from "../../middlewares/accessGuards.js";
import * as comments from "../../services/auction/auctionCommentService.js";
import { handleAuctionRoute } from "./auctionRouteHelpers.js";

const router = express.Router();

router.get(
  "/:id/comments",
  handleAuctionRoute(async (req, res) => {
    const list = await comments.listAuctionComments(parseInt(req.params.id, 10));
    res.json(list);
  }, "댓글 조회 실패"),
);

router.post(
  "/:id/comments",
  authenticate,
  rejectBannedAccount,
  checkDiscordLinked,
  handleAuctionRoute(async (req, res) => {
    const io = req.app.get("io");
    const comment = await comments.createAuctionComment({
      auctionId: parseInt(req.params.id, 10),
      authorId: req.user.id,
      content: req.body?.content,
      io,
    });
    res.status(201).json(comment);
  }, "댓글 등록 실패"),
);

export default router;
