import express from "express";
import * as market from "../../services/admin/adminMarketService.js";
import { handleAdminRoute } from "./adminRouteHelpers.js";

const router = express.Router();

router.get(
  "/variables",
  handleAdminRoute(async (_req, res) => {
    const variables = await market.listMarketVariables();
    res.json(variables);
  }, "변수 목록 로드 실패")
);

router.post(
  "/variables",
  handleAdminRoute(async (req, res) => {
    const variable = await market.upsertMarketVariable(req.body);
    res.json({ message: "변수가 저장되었습니다.", variable });
  }, "변수 저장 실패")
);

router.get(
  "/history",
  handleAdminRoute(async (req, res) => {
    const result = await market.listMarketHistory(req.query);
    res.json(result);
  }, "거래 이력 로드 실패")
);

router.patch(
  "/history/:id/status",
  handleAdminRoute(async (req, res) => {
    const updated = await market.updateMarketHistoryStatus(req.params.id, req.body);
    res.json({ message: "데이터 상태 업데이트 완료", updated });
  }, "상태 변경 실패")
);

router.post(
  "/history/inject",
  handleAdminRoute(async (req, res) => {
    const history = await market.injectMarketHistory(req.body);
    res.status(201).json({
      message: "거래 데이터가 성공적으로 주입되었습니다.",
      id: history.id.toString(),
    });
  }, "데이터 주입 실패")
);

router.delete(
  "/history/:id",
  handleAdminRoute(async (req, res) => {
    await market.deleteMarketHistory(req.params.id);
    res.json({ message: "거래 기록이 영구 삭제되었습니다." });
  }, "기록 삭제 실패")
);

export default router;
