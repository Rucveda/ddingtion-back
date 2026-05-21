import express from "express";
import * as auctions from "../../services/admin/adminAuctionService.js";
import { handleAdminRoute } from "./adminRouteHelpers.js";

const router = express.Router();

router.delete(
  "/:id",
  handleAdminRoute(async (req, res) => {
    await auctions.cancelAuctionByAdmin(parseInt(req.params.id, 10));
    res.json({ message: "경매 취소 성공" });
  }, "경매 취소 실패")
);

export default router;
