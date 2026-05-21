import express from "express";
import * as moderation from "../../services/admin/adminModerationService.js";
import { handleAdminRoute } from "./adminRouteHelpers.js";

const router = express.Router();

router.get(
  "/reports",
  handleAdminRoute(async (req, res) => {
    const result = await moderation.listReports(req.query);
    res.json(result);
  }, "신고 내역 로드 실패")
);

router.patch(
  "/reports/:id/resolve",
  handleAdminRoute(async (req, res) => {
    const updatedReport = await moderation.resolveReport(req.params.id, req.body.isResolved);
    res.json({ message: "신고 처리 완료", updatedReport });
  }, "상태 변경 실패")
);

router.delete(
  "/reports/:id",
  handleAdminRoute(async (req, res) => {
    await moderation.deleteReport(req.params.id);
    res.json({ message: "신고 로그 영구 삭제 완료" });
  }, "로그 삭제 실패")
);

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
