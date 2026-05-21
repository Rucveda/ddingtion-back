import express from "express";
import * as notifications from "../../services/notifications/notificationService.js";
import { handleNotificationRoute } from "./notificationRouteHelpers.js";

const router = express.Router();

router.get(
  "/",
  handleNotificationRoute(async (req, res) => {
    const list = await notifications.listNotifications(req.user.id);
    res.json(list);
  }, "알림 목록을 불러오지 못했습니다."),
);

export default router;
