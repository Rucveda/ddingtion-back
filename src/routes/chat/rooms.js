import express from "express";
import * as rooms from "../../services/chat/chatRoomService.js";
import { handleChatRoute } from "./chatRouteHelpers.js";

const router = express.Router();

router.get(
  "/rooms",
  handleChatRoute(async (req, res) => {
    const list = await rooms.listActiveRooms(req.user.id);
    res.json(list);
  }, "채팅방 목록 로드 실패"),
);

router.post(
  "/rooms/admin",
  handleChatRoute(async (req, res) => {
    const room = await rooms.getOrCreateAdminSupportRoom(req.user.id);
    res.json(room);
  }, "관리자 채팅방 연결 실패"),
);

export default router;
