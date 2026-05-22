import express from "express";
import * as trade from "../../services/chat/chatTradeService.js";
import * as reports from "../../services/trade/reportService.js";
import { emitTradeRoomUpdate } from "../../services/chat/chatShared.js";
import { handleChatRoute } from "./chatRouteHelpers.js";

const router = express.Router();

router.patch(
  "/rooms/:id/close",
  handleChatRoute(async (req, res) => {
    const result = await trade.confirmTradeClose(req.params.id, req.user.id);
    emitTradeRoomUpdate(req, result.room);
    res.json({
      completed: result.completed,
      message: result.message,
      room: result.room,
    });
  }, "거래 확정 처리 실패"),
);

router.post(
  "/rooms/:id/report",
  handleChatRoute(async (req, res) => {
    const reporterId = parseInt(req.user.id, 10);
    const { report, sellerId, buyerId } = await reports.submitTradeReport({
      roomId: req.params.id,
      reporterId,
      reason: req.body?.reason,
    });
    const io = req.app.get("io");
    if (io) {
      io.to(`user_${sellerId}`).to(`user_${buyerId}`).emit("refresh_chat_rooms");
    }
    res.status(201).json({
      message: "신고가 접수되었습니다. 해당 거래는 종료 처리됩니다.",
      report,
    });
  }, "신고 접수 실패"),
);

export default router;
