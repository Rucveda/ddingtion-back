import express from "express";
import * as reports from "../../services/trade/reportService.js";
import { handleAdminRoute } from "./adminRouteHelpers.js";

const router = express.Router();

router.get(
  "/",
  handleAdminRoute(async (req, res) => {
    const result = await reports.listReports(req.query);
    res.json(result);
  }, "신고 목록 로드 실패"),
);

router.get(
  "/:id/messages",
  handleAdminRoute(async (req, res) => {
    const messages = await reports.getReportMessages(
      req.params.id,
      parseInt(req.user.id, 10),
      req.user.role,
    );
    res.json(messages);
  }, "신고 채팅 로그 로드 실패"),
);

router.get(
  "/:id",
  handleAdminRoute(async (req, res) => {
    const report = await reports.getReportById(req.params.id);
    res.json(report);
  }, "신고 상세 로드 실패"),
);

router.patch(
  "/:id/resolve",
  handleAdminRoute(async (req, res) => {
    const report = await reports.resolveReport({
      reportId: req.params.id,
      adminId: parseInt(req.user.id, 10),
      action: req.body?.action,
    });
    res.json({
      message: "신고가 처리되었습니다.",
      report,
    });
  }, "신고 처리 실패"),
);

export default router;
