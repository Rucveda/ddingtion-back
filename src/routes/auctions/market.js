import express from "express";
import { getCachedMarketAnalysis } from "../../services/auction/marketAnalysisCache.js";

const router = express.Router();

router.get("/market-analysis/:itemId", async (req, res) => {
  try {
    const itemId = parseInt(req.params.itemId, 10);
    if (Number.isNaN(itemId)) {
      return res.status(400).json({ error: "유효하지 않은 아이템 ID" });
    }

    const { analysis, cacheControl } = await getCachedMarketAnalysis(itemId, req.query);
    res.set("Cache-Control", cacheControl);
    res.json(analysis);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "분석 생성 실패" });
  }
});

export default router;
