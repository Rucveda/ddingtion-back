import prisma from "../../db.js";
import { NotificationServiceError } from "./notificationErrors.js";

export const listNotifications = (userId) =>
  prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

export const markNotificationRead = async (notificationId, userId) => {
  const id = parseInt(notificationId, 10);
  if (Number.isNaN(id)) {
    throw new NotificationServiceError("유효하지 않은 알림 ID입니다.", 400);
  }

  await prisma.notification.update({
    where: { id, userId },
    data: { isRead: true },
  });
};

export const deleteNotification = async (notificationId, userId) => {
  const id = parseInt(notificationId, 10);
  if (Number.isNaN(id)) {
    throw new NotificationServiceError("유효하지 않은 알림 ID입니다.", 400);
  }

  await prisma.notification.delete({
    where: { id, userId },
  });
};

export const clearAllNotifications = (userId) =>
  prisma.notification.deleteMany({
    where: { userId },
  });
