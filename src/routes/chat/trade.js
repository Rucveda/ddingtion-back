import express from "express";
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

export default router;
