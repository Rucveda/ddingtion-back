import express from "express";
import * as notifications from "../../services/notifications/notificationService.js";
import { handleNotificationRoute } from "./notificationRouteHelpers.js";

const router = express.Router();

router.delete(
  "/all/clear",
  handleNotificationRoute(async (req, res) => {
    await notifications.clearAllNotifications(req.user.id);
    res.json({ success: true });
  }, "알림 내역 파기 실패"),
);

router.patch(
  "/:id/read",
  handleNotificationRoute(async (req, res) => {
    await notifications.markNotificationRead(req.params.id, req.user.id);
    res.json({ success: true });
  }, "알림 업데이트 실패"),
);

router.delete(
  "/:id",
  handleNotificationRoute(async (req, res) => {
    await notifications.deleteNotification(req.params.id, req.user.id);
    res.json({ success: true });
  }, "알림 삭제 중 오류가 발생했습니다."),
);

export default router;
