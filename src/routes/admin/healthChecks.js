import express from "express";
import {
  getAuctionFlowRun,
  getLatestAuctionFlowRun,
  startAuctionFlowCheck,
} from "../../services/systemCheck/auctionFlowCheck.js";

const router = express.Router();

router.post("/auction-flow/run", (req, res) => {
  try {
    const run = startAuctionFlowCheck();
    res.status(202).json(run);
  } catch (error) {
    const status = error.status || 500;
    res.status(status).json({ error: error.message || "헬스체크를 시작할 수 없습니다." });
  }
});

router.get("/auction-flow/runs/:runId", (req, res) => {
  const run = getAuctionFlowRun(req.params.runId);
  if (!run) {
    return res.status(404).json({ error: "실행 기록을 찾을 수 없습니다." });
  }
  res.json(run);
});

router.get("/auction-flow/latest", (_req, res) => {
  const run = getLatestAuctionFlowRun();
  if (!run) {
    return res.status(404).json({ error: "실행 기록이 없습니다." });
  }
  res.json(run);
});

export default router;
