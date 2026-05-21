import express from "express";
import authenticate from "../../middlewares/authenticate.js";
import { checkDiscordLinked } from "../../middlewares/discordCheck.js";
import { rejectBannedAccount } from "../../middlewares/accessGuards.js";
import * as mutations from "../../services/posts/postMutationService.js";
import { handlePostRoute } from "./postRouteHelpers.js";

const router = express.Router();

router.post(
  "/",
  authenticate,
  rejectBannedAccount,
  checkDiscordLinked,
  handlePostRoute(async (req, res) => {
    const post = await mutations.createPost({
      authorId: req.user.id,
      title: req.body?.title,
      content: req.body?.content,
      type: req.body?.type,
      category: req.body?.category,
      userRole: req.user.role,
    });
    res.status(201).json(post);
  }, "게시글 작성 실패"),
);

router.delete(
  "/:id",
  authenticate,
  handlePostRoute(async (req, res) => {
    const result = await mutations.deletePost(
      parseInt(req.params.id, 10),
      req.user.id,
      req.user.role,
    );
    res.json(result);
  }, "삭제 실패"),
);

export default router;
