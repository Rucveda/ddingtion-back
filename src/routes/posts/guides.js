import express from "express";
import { getCategoryGuides } from "../../services/posts/postQueryService.js";
import { handlePostRoute } from "./postRouteHelpers.js";

const router = express.Router();

router.get(
  "/category-guides",
  handlePostRoute(async (_req, res) => {
    const guides = await getCategoryGuides();
    res.json({ guides });
  }, "말머리 안내 로드 실패"),
);

export default router;
