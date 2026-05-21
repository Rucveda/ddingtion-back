import express from "express";
import { listPosts } from "../../services/posts/postQueryService.js";
import { handlePostRoute } from "./postRouteHelpers.js";

const router = express.Router();

router.get(
  "/",
  handlePostRoute(async (req, res) => {
    const posts = await listPosts(req.query);
    res.json(posts);
  }, "게시글 로드 실패"),
);

export default router;
