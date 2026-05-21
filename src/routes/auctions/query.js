import express from "express";
import authenticate from "../../middlewares/authenticate.js";
import {
  getActiveAuctions,
  getAuctionDetail,
  getAuctionItems,
  getUserAuctions,
  getUserBidAuctions,
} from "../../services/auctionQueryService.js";
import { handleAuctionRoute } from "./auctionRouteHelpers.js";

const router = express.Router();

router.get("/items", authenticate, async (_req, res) => {
  try {
    const items = await getAuctionItems();
    res.json(items);
  } catch {
    res.status(500).json([]);
  }
});

router.get("/", async (_req, res) => {
  try {
    const safeData = await getActiveAuctions();
    res.status(200).json(Array.isArray(safeData) ? safeData : []);
  } catch (error) {
    console.error("[GET /api/auctions] 목록 조회 실패:", error);
    res.status(500).json({ error: "경매 목록을 불러오지 못했습니다." });
  }
});

router.get("/my-bids", authenticate, async (req, res) => {
  try {
    const safeData = await getUserBidAuctions(req.user.id);
    res.status(200).json(Array.isArray(safeData) ? safeData : []);
  } catch (error) {
    console.error(error);
    res.status(200).json([]);
  }
});

router.get("/my-auctions", authenticate, async (req, res) => {
  try {
    const safeData = await getUserAuctions(req.user.id);
    res.status(200).json(Array.isArray(safeData) ? safeData : []);
  } catch (error) {
    console.error(error);
    res.status(200).json([]);
  }
});

router.get(
  "/:id",
  handleAuctionRoute(async (req, res) => {
    const auctionId = parseInt(req.params.id, 10);
    if (Number.isNaN(auctionId)) {
      return res.status(400).json({ error: "유효하지 않은 경매 ID" });
    }
    const auction = await getAuctionDetail(auctionId);
    if (!auction) {
      return res.status(404).json({ error: "경매 없음" });
    }
    res.json(auction);
  }, "조회 실패"),
);

export default router;
