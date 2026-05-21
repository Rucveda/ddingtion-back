import express from "express";
import { checkDiscordLinked } from "../../middlewares/discordCheck.js";
import { rejectBannedAccount } from "../../middlewares/accessGuards.js";
import * as trade from "../../services/chat/chatTradeService.js";
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
  rejectBannedAccount,
  checkDiscordLinked,
  handleChatRoute(async (req, res) => {
    const roomId = parseInt(req.params.id, 10);
    const report = await trade.submitRoomReport({
      roomId,
      reporterId: req.user.id,
      targetId: req.body?.targetId,
      reason: req.body?.reason,
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("refresh_chat_rooms");
      io.to(`user_${req.user.id}`).emit("trade_report_submitted", {
        roomId,
        reportId: report.id,
      });
    }

    res.status(201).json({
      message: "신고가 접수되었습니다. 해당 거래는 유찰 처리되었으며, 운영팀이 내용을 확인합니다.",
      reportId: report.id,
    });
  }, "신고 접수 실패"),
);

export default router;
