import express from "express";
import * as support from "../../services/admin/adminSupportService.js";
import { handleAdminRoute } from "./adminRouteHelpers.js";

const router = express.Router();

router.get(
  "/rooms",
  handleAdminRoute(async (_req, res) => {
    const rooms = await support.listSupportRooms();
    res.json(rooms);
  }, "상담 내역 로드 실패")
);

router.delete(
  "/rooms/:id",
  handleAdminRoute(async (req, res) => {
    await support.deleteSupportRoom(parseInt(req.params.id, 10));
    res.json({ message: "상담 내역이 삭제되었습니다." });
  }, "상담 삭제 실패")
);

export default router;
