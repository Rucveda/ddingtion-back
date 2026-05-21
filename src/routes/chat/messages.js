import express from "express";
import * as rooms from "../../services/chat/chatRoomService.js";
import { handleChatRoute } from "./chatRouteHelpers.js";

const router = express.Router();

router.get(
  "/rooms/:id/messages",
  handleChatRoute(async (req, res) => {
    const messages = await rooms.getRoomMessages(req.params.id, req.user.id, req.user.role);
    res.json(messages);
  }, "메시지 로드 실패"),
);

export default router;
