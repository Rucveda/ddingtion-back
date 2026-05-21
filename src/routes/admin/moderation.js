import express from "express";
import * as moderation from "../../services/admin/adminModerationService.js";
import { handleAdminRoute } from "./adminRouteHelpers.js";

const router = express.Router();

router.patch(
  "/posts/category-guides/:category",
  handleAdminRoute(async (req, res) => {
    const row = await moderation.updatePostCategoryGuide(req.params.category, req.body?.guideText);
    res.json({
      message: "말머리 안내 문구가 저장되었습니다.",
      category: row.category,
      guideText: row.guideText,
    });
  }, "안내 문구 저장 실패")
);

export default router;
